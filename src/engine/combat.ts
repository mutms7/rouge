/**
 * The reducer. `(state, action) => state`, no mutation, no side effects, no async.
 *
 * There is no turn loop in here and no end-turn button. `reduce` applies the player's
 * action and then *settles*: it walks the clock forward, resolving whatever the track
 * says happens next, until either the player is the one furthest behind again or the
 * fight is over. Which means a whole combat can resolve in a microsecond when nobody is
 * watching, and the view can take as long as it likes animating what already happened.
 *
 * Illegal actions throw rather than no-op. The UI has `legalActions` and the sim picks
 * from it, so an illegal action is a bug, and a silent no-op is how a bug turns into a
 * desync nobody can reproduce.
 */
import { BEATS_PER_LAP, HAND_CAP, MAX_RESOLVE_STEPS, STARTING_HAND, WAIT_WEIGHT } from './constants';
import { discardCard, drawCards, exhaustCard, removeFromHand } from './deck';
import { byId, cloneState, emit, playerOf } from './draft';
import type { Draft, DraftCombatant } from './draft';
import { applyEffects, dealDamage, decayGuard } from './effects';
import type { EffectContext } from './effects';
import { makeRngStreams, shuffle } from './rng';
import { cardWeight, frontBeat, isAlive, nextActor, opponentsOf } from './tally';
import type {
  Action,
  CardDef,
  CardInstance,
  CombatSetup,
  CombatState,
  Combatant,
  IntentDef,
  Targeting,
} from './types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function validate(setup: CombatSetup): void {
  if (setup.player.hp <= 0) throw new Error('the player starts a combat alive');
  if (setup.enemies.length === 0) throw new Error('a combat needs at least one enemy');
  for (const enemy of setup.enemies) {
    if (enemy.hp <= 0) throw new Error(`enemy ${enemy.id} starts a combat alive`);
    if (enemy.intents.length === 0) throw new Error(`enemy ${enemy.id} has no intents`);
    for (const intent of enemy.intents) {
      // A zero-weight intent would never yield the track back. Cheap to forbid here,
      // impossible to debug at 3am.
      if (intent.weight < 1) throw new Error(`intent ${enemy.id}/${intent.id} must weigh at least 1 beat`);
    }
  }
  for (const cardId of setup.deck) {
    if (!setup.library[cardId]) throw new Error(`deck references unknown card ${cardId}`);
  }
}

export function createCombat(setup: CombatSetup): CombatState {
  validate(setup);

  const rng = makeRngStreams(setup.seed);
  const player: Combatant = {
    id: setup.player.id ?? 'player',
    name: setup.player.name ?? 'Wick',
    team: 'player',
    hp: setup.player.hp,
    maxHp: setup.player.maxHp ?? setup.player.hp,
    guard: 0,
    guardFrozenUntil: 0,
    position: 0,
    bleed: 0,
    intentIndex: 0,
    intents: [],
  };
  const enemies: Combatant[] = setup.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name ?? enemy.id,
    team: 'enemy',
    hp: enemy.hp,
    maxHp: enemy.maxHp ?? enemy.hp,
    guard: 0,
    guardFrozenUntil: 0,
    position: enemy.startBeat ?? 0,
    bleed: 0,
    intentIndex: 0,
    intents: enemy.intents,
  }));

  let uidSeq = 0;
  const deck: CardInstance[] = setup.deck.map((cardId) => {
    uidSeq += 1;
    return { uid: `c${uidSeq}`, cardId, weightDelta: 0 };
  });
  const [shuffled, shuffleRng] = shuffle(rng.shuffle, deck);

  const draft: Draft = {
    seed: setup.seed,
    beat: 0,
    combatants: [player, ...enemies],
    deck: { draw: shuffled, hand: [], discard: [], exhausted: [] },
    strain: 0,
    handCap: setup.handCap ?? HAND_CAP,
    pending: [],
    rng: { ...rng, shuffle: shuffleRng },
    log: [],
    runLog: [],
    outcome: 'ongoing',
    awaiting: 'none',
    library: setup.library,
    uidSeq,
  };

  emit(draft, { k: 'combat_start' });
  drawCards(draft, setup.startingHand ?? STARTING_HAND);
  settle(draft);
  return draft;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function currentActor(state: CombatState): Combatant | null {
  if (state.outcome !== 'ongoing') return null;
  return nextActor(state.combatants);
}

export function isPlayerTurn(state: CombatState): boolean {
  return state.outcome === 'ongoing' && state.awaiting === 'player';
}

export function cardWeightInHand(state: CombatState, uid: string): number | null {
  const instance = state.deck.hand.find((c) => c.uid === uid);
  if (!instance) return null;
  const def = state.library[instance.cardId];
  return def ? cardWeight(def, instance) : null;
}

/**
 * Everything the player may legally do right now.
 *
 * The order is stable (hand order, then target order, then wait), which is what makes
 * a greedy sim policy reproducible and what lets keyboard play index into it.
 */
export function legalActions(state: CombatState): Action[] {
  if (!isPlayerTurn(state)) return [];
  const player = state.combatants.find((c) => c.team === 'player');
  if (!player) return [];
  const foes = opponentsOf(state.combatants, 'player').filter(isAlive);
  const actions: Action[] = [];
  for (const instance of state.deck.hand) {
    const def = state.library[instance.cardId];
    if (!def) continue;
    if (def.targeting === 'opponent' && foes.length > 1) {
      for (const foe of foes) actions.push({ k: 'play_card', uid: instance.uid, targetId: foe.id });
    } else {
      actions.push({ k: 'play_card', uid: instance.uid });
    }
  }
  actions.push({ k: 'wait' });
  return actions;
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function reduce(state: CombatState, action: Action): CombatState {
  if (state.outcome !== 'ongoing') return state;

  const draft = cloneState(state);
  const actor = nextActor(draft.combatants);
  if (!actor || actor.team !== 'player') throw new Error('it is not the player’s turn');
  const player = byId(draft, actor.id);
  if (!player) throw new Error('the player is not in this combat');

  draft.awaiting = 'none';
  switch (action.k) {
    case 'play_card':
      playCard(draft, player, action.uid, action.targetId);
      break;
    case 'wait':
      emit(draft, { k: 'act', who: player.id, what: 'wait', weight: WAIT_WEIGHT });
      player.position += WAIT_WEIGHT;
      drawCards(draft, 1);
      break;
  }

  settle(draft);
  return draft;
}

function resolveTargets(
  draft: Draft,
  actor: DraftCombatant,
  targeting: Targeting,
  targetId: string | undefined,
): string[] {
  const foes = opponentsOf(draft.combatants, actor.team).filter(isAlive);
  switch (targeting) {
    case 'none':
      return [];
    case 'self':
      return [actor.id];
    case 'all_opponents':
      return foes.map((c) => c.id);
    case 'opponent': {
      if (foes.length === 0) return [];
      if (targetId === undefined) {
        const only = foes[0];
        if (foes.length === 1 && only) return [only.id];
        throw new Error('this card needs a target');
      }
      if (!foes.some((c) => c.id === targetId)) throw new Error(`${targetId} is not a legal target`);
      return [targetId];
    }
  }
}

/**
 * Play a card.
 *
 * The marker advances *before* the effects resolve, which is the ordering that makes
 * Haste mean what the card says it means: `Doubling Back` is Weight 2 and Haste 5, and
 * the player expects to end up three beats better off, not two beats worse. Effects
 * still land on the current beat, so Guard raised by a heavy card is at full value for
 * anything swinging right now and has decayed by the time you act again.
 */
function playCard(draft: Draft, player: DraftCombatant, uid: string, targetId: string | undefined): void {
  const peek = draft.deck.hand.find((c) => c.uid === uid);
  if (!peek) throw new Error(`card ${uid} is not in hand`);
  const def: CardDef | undefined = draft.library[peek.cardId];
  if (!def) throw new Error(`unknown card ${peek.cardId}`);

  // Resolve targets before committing, so an illegal target throws with the hand intact.
  const targetIds = resolveTargets(draft, player, def.targeting, targetId);
  const instance = removeFromHand(draft, uid);
  if (!instance) throw new Error(`card ${uid} is not in hand`);

  const weight = cardWeight(def, instance);
  emit(draft, { k: 'act', who: player.id, what: def.id, weight });
  player.position += weight;

  const flags = { exhaust: false };
  const ctx: EffectContext = {
    actorId: player.id,
    targetIds,
    sourceId: def.id,
    played: instance,
    flags,
  };
  applyEffects(draft, def.effects, ctx);

  // Draw one per action, after the card has done its work.
  drawCards(draft, 1);

  if (flags.exhaust) exhaustCard(draft, instance);
  else discardCard(draft, instance);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Bleed N: the target takes N when it acts, then N drops by 1. §3.6. */
function tickBleed(draft: Draft, combatant: DraftCombatant): boolean {
  if (combatant.bleed > 0) {
    const n = combatant.bleed;
    combatant.bleed = n - 1;
    emit(draft, { k: 'bleed_tick', who: combatant.id, amount: n });
    // Bleed goes through Guard. Otherwise every Guard-stacking enemy is immune to the
    // whole Bleed line, which is three Marks and two Tokens deep.
    dealDamage(draft, combatant.id, n, null, { ignoreGuard: true });
  }
  return isAlive(combatant);
}

function advanceClock(draft: Draft, target: number): void {
  if (target <= draft.beat) return;
  for (const combatant of draft.combatants) decayGuard(combatant, draft.beat, target);
  // A lap ends when the clock reaches a multiple of 24. Interest fires here in phase 5.
  const from = Math.floor(draft.beat / BEATS_PER_LAP);
  const to = Math.floor(target / BEATS_PER_LAP);
  for (let lap = from; lap < to; lap += 1) {
    emit(draft, { k: 'lap_end', lap }, (lap + 1) * BEATS_PER_LAP);
  }
  draft.beat = target;
}

function nextPendingBeat(draft: Draft): number | null {
  let soonest: number | null = null;
  for (const pending of draft.pending) {
    if (soonest === null || pending.at < soonest) soonest = pending.at;
  }
  return soonest;
}

/** Resolve everything sworn for this beat or earlier. Returns true if anything fired. */
function firePendingAt(draft: Draft, beat: number): boolean {
  const due = draft.pending.filter((p) => p.at <= beat);
  if (due.length === 0) return false;
  draft.pending = draft.pending.filter((p) => p.at > beat);

  for (const pending of due) {
    const owner = byId(draft, pending.ownerId);
    if (!owner || !isAlive(owner)) continue;
    // The thing you lied about may have died in the meantime. Point it at whatever is
    // still standing rather than dropping it on the floor.
    let targetIds: string[] = [];
    if (pending.targetId) {
      const target = byId(draft, pending.targetId);
      if (target && isAlive(target)) targetIds = [target.id];
      else {
        const foe = opponentsOf(draft.combatants, owner.team).filter(isAlive)[0];
        if (foe) targetIds = [foe.id];
      }
    }
    emit(draft, { k: 'perjury_resolved', cardId: pending.sourceCardId });
    applyEffects(draft, pending.effects, {
      actorId: owner.id,
      targetIds,
      sourceId: pending.sourceCardId,
      played: null,
      flags: null,
    });
  }
  return true;
}

function takeEnemyTurn(draft: Draft, enemy: DraftCombatant): void {
  if (!tickBleed(draft, enemy)) return;
  const intent = enemy.intents[enemy.intentIndex % enemy.intents.length] as IntentDef;
  emit(draft, { k: 'act', who: enemy.id, what: intent.id, weight: intent.weight });
  enemy.position += intent.weight;
  enemy.intentIndex += 1;
  applyEffects(draft, intent.effects, {
    actorId: enemy.id,
    targetIds: resolveTargets(draft, enemy, intent.targeting, undefined),
    sourceId: intent.id,
    played: null,
    flags: null,
  });
}

function finish(draft: Draft): boolean {
  if (draft.outcome !== 'ongoing') return true;
  const player = playerOf(draft);
  const enemiesLeft = draft.combatants.some((c) => c.team === 'enemy' && isAlive(c));
  if (!player || !isAlive(player)) {
    draft.outcome = 'lost';
  } else if (!enemiesLeft) {
    draft.outcome = 'won';
  } else {
    return false;
  }
  draft.awaiting = 'none';
  emit(draft, { k: 'combat_end', outcome: draft.outcome });
  return true;
}

/**
 * Walk the track forward until the player has to decide something, or the fight ends.
 *
 * One atomic thing per iteration, re-reading the board each time, because a sworn
 * perjury resolving can Slip somebody and change who is furthest behind.
 */
function settle(draft: Draft): void {
  for (let step = 0; step < MAX_RESOLVE_STEPS; step += 1) {
    if (finish(draft)) return;

    const front = frontBeat(draft.combatants);
    if (front === null) continue;
    const sworn = nextPendingBeat(draft);
    advanceClock(draft, sworn === null ? front : Math.min(front, sworn));

    // Anything sworn for this beat happens before anybody acts on it.
    if (firePendingAt(draft, draft.beat)) continue;

    const actor = nextActor(draft.combatants);
    if (!actor) continue;
    const combatant = byId(draft, actor.id);
    if (!combatant) continue;
    if (combatant.position > draft.beat) continue;

    if (combatant.team === 'player') {
      // Bleed lands as the player comes up, not when they commit to a card, so it can
      // kill them on the correct beat instead of after a card they never got to play.
      if (!tickBleed(draft, combatant)) continue;
      draft.awaiting = 'player';
      return;
    }
    takeEnemyTurn(draft, combatant);
  }
  throw new Error(`combat did not settle within ${MAX_RESOLVE_STEPS} steps`);
}
