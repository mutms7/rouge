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

/** How far ahead the policy looks when deciding whether Guard is worth raising. */
const GUARD_HORIZON = 8;

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
} as const;

function playerOf(state: CombatState): Combatant | null {
  return state.combatants.find((c) => c.team === 'player') ?? null;
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
    // Waiting draws a card and costs a beat. It is the floor, not a strategy, and the
    // Stillness Mark is the only reason it is ever more than that.
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

  let value = 0;
  value += estimate.damage * WEIGHTS.damage;
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

  // A kill is worth more than the damage that got there.
  for (const target of targets) {
    if (estimate.damage >= effectiveHp(state, target)) {
      value += WEIGHTS.lethal;
      break;
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
