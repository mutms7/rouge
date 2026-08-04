/**
 * The heuristic policy.
 *
 * A reasonable greedy player, per the phase brief: it does not need to be good, it needs
 * to be consistent. Every decision is a pure function of the state, ties break by the
 * order `legalActions` returns, and there is no randomness anywhere. Two runs of the same
 * seed produce byte-identical numbers, which is the only reason the balance table means
 * anything.
 *
 * Everything is scored *per beat*, because Weight is the entire cost system and damage per
 * beat is the real currency of the Tally. §3.2. A greedy policy that ignored that would
 * over-value big slow cards and make every heavy card look better than it is.
 */
import { effectiveWeight, isPlayerTurn, legalActions } from '../engine/combat';
import { STRAIN_THRESHOLD } from '../engine/constants';
import { isAlive, projectIntents } from '../engine/tally';
import { collectMods } from '../engine/mods';
import type { Action, CombatState, Combatant, Effect } from '../engine/types';
import { estimateEffects } from './estimate';

/**
 * How far ahead the policy looks when deciding whether Guard is worth raising.
 *
 * Short on purpose. Guard decays 1 per beat (§3.3), so Guard raised eight beats before the
 * hit arrives is mostly gone by the time it lands, and a policy that blocks on an eight-beat
 * horizon reports the game as harder than it is for a reason that has nothing to do with the
 * numbers being tuned.
 */
const GUARD_HORIZON = 4;

/**
 * How far ahead the policy will hold an attack to catch a damage-multiplier window.
 *
 * The Notary's re-ink window is two beats of tripled damage on the same beats of every lap,
 * and it is the fight's entire design: a rhythm fight wearing a value fight's coat. A greedy
 * policy that cannot see one beat past its own nose plays it as a damage race, loses 93% of
 * the time, and reports the boss as impossible when what is actually impossible is the
 * policy. Two beats of patience is the smallest amount that makes the fight measurable.
 */
const WINDOW_PATIENCE = 2;

const WEIGHTS = {
  damage: 1,
  /** Guard that will actually be tested. */
  guardNeeded: 1,
  /** Guard beyond what is coming. Decays before it is used, so nearly worthless. */
  guardSpare: 0.15,
  draw: 2.5,
  slip: 1.1,
  haste: 1.1,
  heal: 0.9,
  salt: 0.08,
  junk: 3,
  exhaust: 0.6,
  echo: 1.5,
  selfDamage: 1.4,
  /** Killing something removes every future action it had. Worth a flat premium. */
  lethal: 40,
  /** Per point of HP, when choosing which of two mutually-reinforcing bodies to hit. */
  spread: 0.08,
} as const;

function playerOf(state: CombatState): Combatant | null {
  return state.combatants.find((c) => c.team === 'player') ?? null;
}

/**
 * The damage multiplier a target is currently sitting under, from `vulnerable`.
 *
 * Priced rather than ignored: without this, the tripled-damage window is invisible to the
 * policy and it will spend the Notary's re-ink beats raising Guard.
 */
function vulnerabilityOf(state: CombatState, target: Combatant): number {
  return state.beat < target.vulnerableUntil ? target.vulnerableMultiplier : 1;
}

/** The next enemy-opened damage window on the track, if one is coming. */
export function nextWindow(
  state: CombatState,
  horizon: number,
): { readonly inBeats: number; readonly multiplier: number } | null {
  // `projectIntents` is sorted by beat, so the first match is the soonest one.
  for (const projected of projectIntents(state, horizon)) {
    for (const effect of projected.intent.effects) {
      if (effect.k === 'vulnerable' && effect.multiplier > 1) {
        return { inBeats: projected.beat - state.beat, multiplier: effect.multiplier };
      }
    }
  }
  return null;
}

/** An enemy's damage per beat, read off its intent cycle rather than its next action. */
function intentDamagePerBeat(combatant: Combatant): number {
  let damage = 0;
  let beats = 0;
  for (const intent of combatant.intents) {
    beats += intent.weight;
    if (intent.targeting !== 'opponent' && intent.targeting !== 'all_opponents') continue;
    for (const effect of intent.effects) {
      if (effect.k === 'damage') damage += effect.n;
    }
  }
  return beats === 0 ? 0 : damage / beats;
}

/**
 * What a kill costs when somebody else gets stronger for it.
 *
 * Kesk and Ledger each double their damage when the other dies (§11), which makes the fight a
 * target-priority puzzle: bring them down together, or pay for the tempo you saved. A policy
 * with a flat premium on kills always takes the first one on offer, eats a doubled attacker
 * for the rest of the fight, and then reports the encounter as unwinnable. Priced, the same
 * greedy rule spreads its damage while both are healthy and takes the kill once the survivor
 * is nearly down, which is the answer the fight is asking for.
 */
function doublersBesides(state: CombatState, victim: Combatant): Combatant[] {
  return state.combatants.filter(
    (c) => c.team === 'enemy' && c.id !== victim.id && isAlive(c) && collectMods(c.mods).doublesOnAllyDeath,
  );
}

function doublingCost(state: CombatState, victim: Combatant): number {
  const survivors = doublersBesides(state, victim);
  if (survivors.length === 0) return 0;
  const rate = Math.max(1, bestAttackRate(state));
  const beatsLeft = survivors.reduce((total, c) => total + effectiveHp(state, c), 0) / rate;
  return survivors.reduce((total, c) => total + intentDamagePerBeat(c), 0) * beatsLeft;
}

/** The best damage-per-beat sitting in hand right now, ignoring everything else a card does. */
function bestAttackRate(state: CombatState): number {
  let best = 0;
  for (const instance of state.deck.hand) {
    const def = state.library[instance.cardId];
    if (!def || def.playable === false) continue;
    const damage = estimateEffects(state, def.effects, 1).damage;
    if (damage <= 0) continue;
    const weight = effectiveWeight(state, instance.uid) ?? def.weight;
    best = Math.max(best, damage / (weight + 1));
  }
  return best;
}

/** Damage aimed at the player inside the window, read straight off the track. §3.4. */
export function incomingDamage(state: CombatState, beats: number = GUARD_HORIZON): number {
  let total = 0;
  for (const projected of projectIntents(state, beats)) {
    if (projected.beat >= state.beat + beats) continue;
    if (projected.intent.targeting !== 'opponent' && projected.intent.targeting !== 'all_opponents') continue;
    for (const effect of projected.intent.effects) {
      if (effect.k === 'damage') total += effect.n;
    }
  }
  return total;
}

/**
 * Effective HP of a target, allowing for Guard and for anything shielding it.
 *
 * Fined takes 70% reduced damage until its paperwork is gone, so its effective HP is more
 * than three times what the bar says. Pricing that here is what makes the policy hit the
 * paperwork first, which is the lesson the fight is trying to teach.
 */
function effectiveHp(state: CombatState, target: Combatant): number {
  const passives = collectMods(target.mods);
  let multiplier = 1;
  for (const shield of passives.shieldedBy) {
    const ally = state.combatants.find((c) => c.id === shield.allyId);
    if (ally && isAlive(ally)) multiplier *= 1 - shield.pct / 100;
  }
  const raw = target.hp + target.guard;
  return multiplier <= 0 ? Number.POSITIVE_INFINITY : raw / multiplier;
}

/** Whether the card is pointed at anything, for scoring damage against a real target. */
function targetsOf(state: CombatState, effects: readonly Effect[], targetId: string | undefined): Combatant[] {
  const foes = state.combatants.filter((c) => c.team === 'enemy' && isAlive(c));
  if (targetId !== undefined) return foes.filter((c) => c.id === targetId);
  const hitsAll = effects.some((e) => e.k === 'slip' || e.k === 'damage');
  return hitsAll ? foes : [];
}

export function scoreAction(state: CombatState, action: Action): number {
  const player = playerOf(state);
  if (!player) return 0;
  const incoming = incomingDamage(state);
  const guardNeed = Math.max(0, incoming - player.guard);

  if (action.k === 'wait') {
    // Waiting a beat to catch a tripled-damage window is the one time idling is a play.
    // Priced as what the wait actually buys: the same attack, for the multiplier, minus
    // whatever lands on you while you stand there.
    const window = nextWindow(state, WINDOW_PATIENCE + 1);
    if (window && window.inBeats > 0 && window.inBeats <= WINDOW_PATIENCE) {
      const gain = bestAttackRate(state) * (window.multiplier - 1);
      const cost = Math.max(0, incomingDamage(state, window.inBeats) - player.guard);
      if (gain > cost) return gain - cost;
    }
    // Otherwise it is the floor, not a strategy, and the Stillness Mark is the only reason
    // it is ever more than that.
    return WEIGHTS.draw / 2;
  }

  // Collector's Interest can make Compounds discardable when a passive grants the free
  // discard. It costs no Weight and removes a dead draw, so always prefer it to waiting.
  if (action.k === 'discard_compound') return WEIGHTS.junk * 2;

  const instance = state.deck.hand.find((c) => c.uid === action.uid);
  if (!instance) return Number.NEGATIVE_INFINITY;
  const def = state.library[instance.cardId];
  if (!def) return Number.NEGATIVE_INFINITY;
  const weight = effectiveWeight(state, action.uid) ?? def.weight;

  const targets = targetsOf(state, def.effects, action.k === 'play_card' ? action.targetId : undefined);
  const targetCount = def.targeting === 'all_opponents' ? Math.max(1, targets.length) : 1;
  const estimate = estimateEffects(state, def.effects, targetCount);

  // The mean over targets, which is exact for the single-target cards that matter here.
  const vulnerability =
    targets.length === 0 ? 1 : targets.reduce((total, c) => total + vulnerabilityOf(state, c), 0) / targets.length;

  let value = 0;
  value += estimate.damage * vulnerability * WEIGHTS.damage;
  value += Math.min(estimate.guard, guardNeed) * WEIGHTS.guardNeeded;
  value += Math.max(0, estimate.guard - guardNeed) * WEIGHTS.guardSpare;
  value += estimate.draw * WEIGHTS.draw;
  value += estimate.slip * WEIGHTS.slip;
  // Haste can only claw back beats this card just spent: the marker never goes behind the
  // clock, and at decision time the player is already on it.
  value += Math.min(estimate.hasteBeats, weight) * WEIGHTS.haste;
  value += Math.min(estimate.heal, player.maxHp - player.hp) * WEIGHTS.heal;
  value += estimate.salt * WEIGHTS.salt;
  value -= estimate.junk * WEIGHTS.junk;
  value -= estimate.exhausts * WEIGHTS.exhaust;
  value += estimate.echoes * WEIGHTS.echo;
  value -= estimate.selfDamage * WEIGHTS.selfDamage;

  // Strain is a resource you spend, so it only really hurts at the threshold. §3.5.
  const strainAfter = state.strain + estimate.strain;
  value -= estimate.strain * (strainAfter >= STRAIN_THRESHOLD ? 1.6 : 0.35);

  // A kill is worth more than the damage that got there, less whatever the corpse buys the
  // survivors.
  for (const target of targets) {
    if (estimate.damage * vulnerabilityOf(state, target) >= effectiveHp(state, target)) {
      value += WEIGHTS.lethal - doublingCost(state, target);
      break;
    }
  }

  // Where two bodies each get stronger for the other's death, aim at the healthier one, so
  // they arrive at the end together and the doubled window is as short as possible. Written as
  // a difference from the mean, so choosing *between* targets is steered without making the
  // card look better than a Guard card that had no target to choose.
  if (estimate.damage > 0 && targets.length === 1) {
    const target = targets[0] as Combatant;
    if (doublersBesides(state, target).length > 0) {
      const foes = state.combatants.filter((c) => c.team === 'enemy' && isAlive(c));
      const mean = foes.reduce((total, c) => total + effectiveHp(state, c), 0) / Math.max(1, foes.length);
      value += WEIGHTS.spread * (effectiveHp(state, target) - mean);
    }
  }

  // Damage per beat. Weight is the whole cost, so this is the number that matters.
  return value / (weight + 1);
}

/**
 * The action the policy takes. Null only when the combat is over.
 *
 * Strictly-greater comparison, so the first of two equal options wins and the order of
 * `legalActions` is the tie-break. That is why `legalActions` promises a stable order.
 */
export function chooseAction(state: CombatState): Action | null {
  if (!isPlayerTurn(state)) return null;
  const options = legalActions(state);
  let best: Action | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const option of options) {
    const score = scoreAction(state, option);
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}
