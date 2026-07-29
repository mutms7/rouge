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
import { discardCard, exhaustCard, removeFromHand } from './deck';
import { byId, claimOnce, cloneState, emit, playerOf } from './draft';
import type { Draft, DraftCombatant } from './draft';
import {
  applyEffects,
  addCompoundCard,
  baseContext,
  dealDamage,
  decayGuard,
  drawWithTriggers,
  fireDiscardTriggers,
  handPassives,
  passivesOf,
} from './effects';
import type { EffectContext } from './effects';
import { collectMods } from './mods';
import { makeRngStreams, nextInt, shuffle } from './rng';
import { cardWeight, frontBeat, isAlive, lapOf, nextActor, opponentsOf } from './tally';
import type {
  Action,
  ActiveBoon,
  CardBoon,
  CardDef,
  CardInstance,
  CombatSetup,
  CombatState,
  Combatant,
  Effect,
  IntentDef,
  Mod,
  Targeting,
} from './types';

function modKey(mod: Mod): string {
  return JSON.stringify(mod);
}

function subtractMods(all: readonly Mod[], remove: readonly Mod[]): Mod[] {
  const remaining = [...all];
  for (const mod of remove) {
    const index = remaining.findIndex((candidate) => modKey(candidate) === modKey(mod));
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function validate(setup: CombatSetup): void {
  if (setup.player.hp <= 0) throw new Error('the player starts a combat alive');
  if (setup.enemies.length === 0) throw new Error('a combat needs at least one enemy');
  for (const enemy of setup.enemies) {
    if (enemy.hp <= 0) throw new Error(`enemy ${enemy.id} starts a combat alive`);
    if (enemy.intents.length === 0) throw new Error(`enemy ${enemy.id} has no intents`);
    for (const intents of [enemy.intents, ...(enemy.phases ?? [])]) {
      for (const intent of intents) {
        // A zero-weight intent would never yield the track back. Cheap to forbid here,
        // impossible to debug at 3am.
        if (intent.weight < 1) throw new Error(`intent ${enemy.id}/${intent.id} must weigh at least 1 beat`);
      }
    }
  }
  for (const cardId of setup.deck) {
    if (!setup.library[cardId]) throw new Error(`deck references unknown card ${cardId}`);
  }
}

export function createCombat(setup: CombatSetup): CombatState {
  validate(setup);

  const rng = makeRngStreams(setup.seed);
  const playerMods = setup.player.mods ?? [];
  const passives = collectMods(playerMods);
  const interestPeriod = Math.max(1, setup.interestPeriod ?? (passives.interestPeriod || BEATS_PER_LAP));
  const deckLoad = setup.deckLoad ?? setup.deck.reduce((total, cardId) => {
    const card = setup.library[cardId];
    return total + (card?.load ?? card?.weight ?? 0) + passives.cardLoad;
  }, 0);
  const interestLoad = setup.interestCompounds ?? 0;
  const markMods = setup.player.markMods ?? {};
  const activeMarkIds = [...(setup.player.markIds ?? [])];
  const markedMods = activeMarkIds.flatMap((id) => markMods[id] ?? []);
  // Run setups pass flattened Mark/Token mods in `player.mods`. Keep a copy of the
  // remainder so phase-two stamping can rebuild the player's passives without guessing.
  const basePlayerMods = subtractMods(playerMods, markedMods);
  const compoundIds = [...(setup.compoundIds ?? Object.keys(setup.library).filter((id) => setup.library[id]?.playable === false).sort())];
  const maxHp = (setup.player.maxHp ?? setup.player.hp) + passives.maxHp;

  const player: Combatant = {
    id: setup.player.id ?? 'player',
    name: setup.player.name ?? 'Wick',
    team: 'player',
    hp: Math.min(setup.player.hp, maxHp),
    maxHp,
    guard: 0,
    guardFrozenUntil: 0,
    position: 0,
    bleed: 0,
    intentIndex: 0,
    intents: [],
    mods: playerMods,
    phase: 1,
    phases: [],
    vulnerableUntil: 0,
    vulnerableMultiplier: 1,
    damageBonus: 0,
    damageScale: 1,
    saltHoard: 0,
  };
  const enemies: Combatant[] = setup.enemies.map((enemy) => ({
    id: enemy.id,
    name: enemy.name ?? enemy.id,
    team: 'enemy',
    hp: enemy.hp,
    maxHp: enemy.maxHp ?? enemy.hp,
    guard: 0,
    guardFrozenUntil: 0,
    // A Debt Collector's Whistle: everything starts three beats behind where it wanted to.
    position: (enemy.startBeat ?? 0) + passives.enemiesStartSlipped,
    bleed: 0,
    intentIndex: enemy.intentOffset ?? 0,
    intents: enemy.intents,
    mods: enemy.mods ?? [],
    phase: 1,
    phases: enemy.phases ?? [],
    vulnerableUntil: 0,
    vulnerableMultiplier: 1,
    damageBonus: 0,
    damageScale: 1,
    saltHoard: 0,
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
    handCap: (setup.handCap ?? HAND_CAP) + passives.handCap,
    pending: [],
    scheduled: [],
    nextAction: [],
    rng: { ...rng, shuffle: shuffleRng },
    log: [],
    runLog: [],
    outcome: 'ongoing',
    awaiting: 'none',
    library: setup.library,
    uidSeq,
    salt: setup.player.salt ?? 0,
    intentHorizon: BEATS_PER_LAP + passives.intentHorizon,
    intentsRevealed: 0,
    boons: [],
    lastPlayed: null,
    cardsThisLap: 0,
    cardsPlayed: 0,
    lastPlayBeat: 0,
    wards: [],
    spent: [],
    deckLoad,
    interestPeriod,
    interestNextBeat: interestPeriod,
    interestLoad,
    countersignCancelledLap: null,
    activeMarkIds,
    stampedMarks: [],
    markMods,
    basePlayerMods,
    compoundIds,
  };

  emit(draft, { k: 'combat_start' });

  // Accounted seeds the discard before the opening deal, because it is about what you
  // have already spent, not about what you are holding.
  for (const trigger of passives.onCombatStart) {
    applyEffects(draft, trigger.effects, baseContext({ actorId: player.id, sourceId: trigger.key }));
  }
  for (const enemy of enemies) {
    for (const trigger of passivesOf(enemy).onCombatStart) {
      applyEffects(draft, trigger.effects, baseContext({ actorId: enemy.id, sourceId: trigger.key }));
    }
  }

  drawWithTriggers(draft, (setup.startingHand ?? STARTING_HAND) + passives.combatStartDraw);
  runLapStart(draft);
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

/** What a boon does to a card's Weight. Flat replacement wins over a discount. */
function boonWeight(base: number, boon: CardBoon): number {
  if (boon.weight !== undefined) return Math.max(0, boon.weight);
  if (boon.weightMinus !== undefined) return Math.max(0, base - boon.weightMinus);
  return base;
}

/** Boons still in force. A lap boon dies with its lap even if nothing spent it. */
function liveBoons(state: { readonly boons: readonly ActiveBoon[]; readonly beat: number }): ActiveBoon[] {
  const lap = lapOf(state.beat);
  return state.boons.filter((b) => (b.untilLapEnd ? b.lap === lap : true));
}

/**
 * What this instance costs to play, right now, with everything applied.
 *
 * Order matters and it is: printed Weight, then the card's own scaling (Common Debt gets
 * cheaper the more junk you are carrying), then whatever boon is riding on your next
 * card, then the once-per-lap discount. The last two are floored at zero separately so
 * that a free card cannot go negative and buy you beats.
 */
export function effectiveWeight(state: CombatState, uid: string): number | null {
  const instance = state.deck.hand.find((c) => c.uid === uid);
  if (!instance) return null;
  const def = state.library[instance.cardId];
  if (!def) return null;

  let weight = cardWeight(def, instance);
  if (def.weightScale) {
    weight = Math.max(0, weight + def.weightScale.n * countScale(state, def));
  }
  for (const boon of liveBoons(state)) weight = boonWeight(weight, boon.boon);

  const player = state.combatants.find((c) => c.team === 'player');
  const passives = player ? collectMods(player.mods) : collectMods([]);
  for (const nth of passives.lapNthCard) {
    const index = state.cardsThisLap + 1;
    const hits = nth.repeating ? index % nth.n === 0 : index === nth.n;
    if (hits) weight = boonWeight(weight, nth.boon);
  }
  if (passives.lapDiscount > 0 && !state.spent.includes(`lap_discount:${String(lapOf(state.beat))}`)) {
    weight = Math.max(0, weight - passives.lapDiscount);
  }
  return weight;
}

/** Common Debt is the only card that scales its own cost, but the atom is general. */
function countScale(state: CombatState, def: CardDef): number {
  if (!def.weightScale) return 0;
  switch (def.weightScale.per) {
    case 'discard':
      return state.deck.discard.length;
    case 'draw_pile':
      return state.deck.draw.length;
    case 'hand':
      return state.deck.hand.length;
    case 'exhausted':
      return state.deck.exhausted.length;
    case 'compounds_in_discard':
      return state.deck.discard.filter((c) => state.compoundIds.includes(c.cardId)).length;
    case 'compounds_in_hand':
      return state.deck.hand.filter((c) => state.compoundIds.includes(c.cardId)).length;
    case 'missing_hp': {
      const player = state.combatants.find((c) => c.team === 'player');
      return player ? player.maxHp - player.hp : 0;
    }
    case 'salt':
      return state.salt;
  }
}

/** Kept for the phase 1 call sites and the tests. `effectiveWeight` is the real answer. */
export function cardWeightInHand(state: CombatState, uid: string): number | null {
  return effectiveWeight(state, uid);
}

export function isPlayable(state: CombatState, uid: string): boolean {
  const instance = state.deck.hand.find((c) => c.uid === uid);
  if (!instance) return false;
  const def = state.library[instance.cardId];
  if (!def) return false;
  if (!state.compoundIds.includes(def.id) || def.playable !== false) return true;
  const player = state.combatants.find((combatant) => combatant.team === 'player');
  return (player ? collectMods(player.mods).compoundPlayableAs.length > 0 : false);
}

/**
 * Everything the player may legally do right now.
 *
 * The order is stable (hand order, then target order, then wait), which is what makes
 * a greedy sim policy reproducible and what lets keyboard play index into it. Compounds
 * are absent because they are unplayable: junk you have to draw around, not junk you
 * choose not to play.
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
    if (state.compoundIds.includes(def.id)) {
      if (def.playable !== false || collectMods(player.mods).compoundPlayableAs.length > 0) {
        actions.push({ k: 'play_card', uid: instance.uid });
      }
      continue;
    }
    if (def.targeting === 'opponent' && foes.length > 1) {
      for (const foe of foes) actions.push({ k: 'play_card', uid: instance.uid, targetId: foe.id });
    } else {
      actions.push({ k: 'play_card', uid: instance.uid });
    }
  }
  if (collectMods(player.mods).compoundDiscardFree) {
    for (const instance of state.deck.hand) {
      if (state.compoundIds.includes(instance.cardId)) actions.push({ k: 'discard_compound', uid: instance.uid });
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
  // Two Truths' second half lands before whatever you are doing now.
  fireNextAction(draft);

  switch (action.k) {
    case 'play_card':
      playCard(draft, player, action.uid, action.targetId);
      break;
    case 'discard_compound':
      discardCompound(draft, player, action.uid);
      break;
    case 'wait':
      emit(draft, { k: 'act', who: player.id, what: 'wait', weight: WAIT_WEIGHT });
      player.position += WAIT_WEIGHT;
      drawWithTriggers(draft, 1);
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
      if (foes.some((c) => c.id === targetId)) return [targetId];

      // The target died between being chosen and being resolved, which is a legitimate
      // race rather than a caller bug: Two Truths' second half fires at the top of your
      // action and can finish something off before your card lands. Point it at whatever
      // is still standing, exactly as a resolving perjury does. A target that was never
      // an enemy at all is still a bug, and still throws.
      const known = draft.combatants.some((c) => c.id === targetId && c.team !== actor.team);
      if (!known) throw new Error(`${targetId} is not a legal target`);
      const survivor = foes[0];
      return survivor ? [survivor.id] : [];
    }
  }
}

/** Spend one card's worth of every boon riding on the play. */
function consumeBoons(draft: Draft): CardBoon[] {
  const lap = lapOf(draft.beat);
  const applied: CardBoon[] = [];
  const kept: ActiveBoon[] = [];
  for (const boon of draft.boons) {
    if (boon.untilLapEnd && boon.lap !== lap) continue;
    applied.push(boon.boon);
    if (boon.remaining === null) {
      kept.push(boon);
      continue;
    }
    const remaining = boon.remaining - 1;
    if (remaining > 0) kept.push({ ...boon, remaining });
  }
  draft.boons = kept;
  return applied;
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
  const compoundPlay = draft.compoundIds.includes(def.id);
  const compoundEffects = passivesOf(player).compoundPlayableAs;
  const replacementPlay = compoundPlay && compoundEffects.length > 0;
  if (compoundPlay && def.playable === false && !replacementPlay) throw new Error(`${def.id} is unplayable: it just sits there`);

  // Weight, and any boon spent on it, are settled before the hand changes, so a card
  // that draws or discards cannot change what it cost.
  const weight = effectiveWeight(draft, uid) ?? cardWeight(def, peek);
  const passives = passivesOf(player);
  if (passives.lapDiscount > 0) claimOnce(draft, `lap_discount:${String(lapOf(draft.beat))}`);
  const boons = consumeBoons(draft);

  // Resolve targets before committing, so an illegal target throws with the hand intact.
  const targetIds = resolveTargets(draft, player, def.targeting, targetId);
  const instance = removeFromHand(draft, uid);
  if (!instance) throw new Error(`card ${uid} is not in hand`);

  emit(draft, { k: 'act', who: player.id, what: def.id, weight });
  player.position += weight;
  draft.cardsThisLap += 1;
  draft.cardsPlayed += 1;
  draft.lastPlayBeat = draft.beat;

  const flags = { exhaust: false, killed: false };
  const ctx: EffectContext = {
    actorId: player.id,
    targetIds,
    sourceId: def.id,
    played: instance,
    flags,
    isAttack: def.type === 'attack',
    viaPerjury: false,
    isSecondHit: false,
  };

  // Perjure turns the next card into a promise: everything it does happens later, and
  // an unblocked hit in the meantime means none of it was ever true.
  const perjuryIn = boonPerjury(boons);
  if (replacementPlay) {
    applyEffects(draft, compoundEffects, ctx);
  } else if (perjuryIn === null) {
    applyEffects(draft, def.effects, ctx);
  } else {
    applyEffects(draft, [{ k: 'perjury', in: perjuryIn, effects: def.effects }], ctx);
  }
  if (boons.some((b) => b.echo === true)) applyEffects(draft, [{ k: 'echo' }], ctx);

  // The Notary's stamp is a phase-one enemy trait. It is deliberately after the card
  // resolves so a lethal play still receives the countersign only if the boss survives.
  countersignCard(draft);

  // *After* the effects, not before. Recant says "return your last played card", and from
  // the player's side that is the card before Recant, not Recant itself. The Receipt Wraith
  // reads the same field when it acts, by which point this card is correctly the last one.
  draft.lastPlayed = instance;

  // Chalk Hound: something heavy in your hand is something it can smell.
  punishHeavy(draft, player, weight);

  // Draw one per action, after the card has done its work.
  drawWithTriggers(draft, 1);

  if (flags.exhaust) exhaustCard(draft, instance);
  else {
    discardCard(draft, instance);
    fireDiscardTriggers(draft);
  }
}

function discardCompound(draft: Draft, player: DraftCombatant, uid: string): void {
  if (!passivesOf(player).compoundDiscardFree) throw new Error('Compounds cannot be discarded for free');
  const instance = draft.deck.hand.find((card) => card.uid === uid);
  if (!instance || !isCompoundDef(draft, instance.cardId)) throw new Error(`${uid} is not a held Compound`);
  removeFromHand(draft, uid);
  emit(draft, { k: 'act', who: player.id, what: 'discard_compound', weight: 0 });
  discardCard(draft, instance);
  emit(draft, { k: 'discard', uid: instance.uid, cardId: instance.cardId });
  fireDiscardTriggers(draft);
}

function isCompoundDef(draft: Draft, cardId: string): boolean {
  return draft.compoundIds.includes(cardId);
}

function countersignCard(draft: Draft): void {
  const lap = lapOf(draft.beat);
  if (draft.countersignCancelledLap === lap) return;
  const notary = draft.combatants.find(
    (combatant) => combatant.team === 'enemy' && isAlive(combatant) && passivesOf(combatant).countersign && combatant.phase === 1,
  );
  if (!notary || !draft.library['the_notarys_countersign']) return;
  addCompoundCard(draft, 'the_notarys_countersign', 'draw');
}

function boonPerjury(boons: readonly CardBoon[]): number | null {
  let soonest: number | null = null;
  for (const boon of boons) {
    if (boon.perjuryIn === undefined) continue;
    soonest = soonest === null ? boon.perjuryIn : Math.min(soonest, boon.perjuryIn);
  }
  return soonest;
}

function punishHeavy(draft: Draft, player: DraftCombatant, weight: number): void {
  for (const enemy of draft.combatants) {
    if (enemy.team !== 'enemy' || !isAlive(enemy)) continue;
    for (const rule of passivesOf(enemy).punishHeavy) {
      if (weight < rule.minWeight) continue;
      dealDamage(draft, player.id, rule.n, enemy.id, { attackerId: enemy.id });
    }
  }
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

/** Guard decay only. Lap boundaries are a stop in `settle`, not something to jump over. */
function advanceClock(draft: Draft, target: number): void {
  if (target <= draft.beat) return;
  for (const combatant of draft.combatants) decayGuard(combatant, draft.beat, target);
  draft.beat = target;
}

function soonestBeat(items: readonly { readonly at: number }[]): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    if (soonest === null || item.at < soonest) soonest = item.at;
  }
  return soonest;
}

/**
 * Threefold: a sworn thing lands twice, at half value each.
 *
 * Halved on the way out rather than by scaling the whole payload, so a perjury that also
 * draws a card draws two cards and deals its damage in two pieces. Rounded up, because two
 * halves of 5 rounding down to 4 total would make the Mark a downgrade on odd numbers, and
 * a Mark that quietly punishes you is worse than no Mark.
 */
function halveEffects(effects: readonly Effect[]): Effect[] {
  return effects.map((effect) => {
    if (effect.k === 'damage' || effect.k === 'damage_random' || effect.k === 'self_damage') {
      return { ...effect, n: Math.max(1, Math.ceil(effect.n / 2)) };
    }
    if (effect.k === 'guard' || effect.k === 'heal') return { ...effect, n: Math.max(1, Math.ceil(effect.n / 2)) };
    return effect;
  });
}

/** Resolve everything sworn for this beat or earlier. Returns true if anything fired. */
function firePendingAt(draft: Draft, beat: number): boolean {
  const due = draft.pending.filter((p) => p.at <= beat);
  if (due.length === 0) return false;
  draft.pending = draft.pending.filter((p) => p.at > beat);

  for (const pending of due) {
    const owner = byId(draft, pending.ownerId);
    if (!owner || !isAlive(owner)) continue;
    emit(draft, { k: 'perjury_resolved', cardId: pending.sourceCardId });
    const split = passivesOf(owner).perjurySplit;
    const payload = split ? halveEffects(pending.effects) : pending.effects;
    for (let hit = 0; hit < (split ? 2 : 1); hit += 1) {
      if (!isAlive(owner)) break;
      applyEffects(draft, payload, {
        actorId: owner.id,
        targetIds: retarget(draft, owner, pending.targetId),
        sourceId: pending.sourceCardId,
        played: null,
        flags: null,
        isAttack: true,
        viaPerjury: true,
        isSecondHit: hit > 0,
      });
    }
  }
  return true;
}

/** Debt of Honour's bill, and anything else on a timer that nothing can talk out of. */
function fireScheduledAt(draft: Draft, beat: number): boolean {
  const due = draft.scheduled.filter((s) => s.at <= beat);
  if (due.length === 0) return false;
  draft.scheduled = draft.scheduled.filter((s) => s.at > beat);
  for (const item of due) {
    const owner = byId(draft, item.ownerId);
    if (!owner || !isAlive(owner)) continue;
    applyEffects(
      draft,
      item.effects,
      baseContext({
        actorId: owner.id,
        sourceId: item.sourceId,
        targetIds: retarget(draft, owner, item.targetId),
      }),
    );
  }
  return true;
}

/** Two Truths: "Deal 6 again at the start of your next action." */
function fireNextAction(draft: Draft): void {
  if (draft.nextAction.length === 0) return;
  const due = draft.nextAction;
  draft.nextAction = [];
  for (const item of due) {
    const owner = byId(draft, item.ownerId);
    if (!owner || !isAlive(owner)) continue;
    applyEffects(draft, item.effects, {
      actorId: owner.id,
      targetIds: retarget(draft, owner, item.targetId),
      sourceId: item.sourceId,
      played: null,
      flags: null,
      isAttack: true,
      viaPerjury: false,
      isSecondHit: true,
    });
  }
}

/**
 * The thing you lied about may have died in the meantime. Point it at whatever is still
 * standing rather than dropping it on the floor.
 */
function retarget(draft: Draft, owner: DraftCombatant, targetId: string | null): string[] {
  if (!targetId) return [];
  const target = byId(draft, targetId);
  if (target && isAlive(target)) return [target.id];
  const foe = opponentsOf(draft.combatants, owner.team).filter(isAlive)[0];
  return foe ? [foe.id] : [];
}

// ---------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------

function fireAllPassives(draft: Draft, pick: (id: string) => readonly { key: string; effects: readonly Effect[] }[]): void {
  for (const combatant of draft.combatants) {
    if (!isAlive(combatant)) continue;
    for (const trigger of pick(combatant.id)) {
      applyEffects(draft, trigger.effects, baseContext({ actorId: combatant.id, sourceId: trigger.key }));
    }
  }
}

function runLapStart(draft: Draft): void {
  draft.cardsThisLap = 0;
  const player = playerOf(draft);
  if (player) {
    const passives = passivesOf(player);
    if (passives.lapDraw > 0) drawWithTriggers(draft, passives.lapDraw);
  }
  fireAllPassives(draft, (id) => passivesOf(byId(draft, id) ?? { mods: [] }).onLapStart);
}

/**
 * A lap has ended. Interest fires here in phase 5.
 *
 * Everything else that runs on the lap clock lives here too: Bond's bill, Usury's income,
 * the Tithe-Wolf digesting a stack of your Salt, and Foreclosure hurrying the enemy along
 * from inside your hand.
 */
function runLapEnd(draft: Draft, lap: number): void {
  emit(draft, { k: 'lap_end', lap });
  fireAllPassives(draft, (id) => passivesOf(byId(draft, id) ?? { mods: [] }).onLapEnd);

  const player = playerOf(draft);
  if (player) {
    // Usury. Income on the lap clock, which is the only clock the run and the Tally share.
    const income = passivesOf(player).saltPerLap;
    if (income > 0) applyEffects(draft, [{ k: 'salt', n: income }], baseContext({ actorId: player.id, sourceId: 'usury' }));
    for (const trigger of handPassives(draft).inHandLapEnd) {
      applyEffects(draft, trigger.effects, baseContext({ actorId: player.id, sourceId: trigger.key }));
    }
  }
  for (const combatant of draft.combatants) {
    const decay = passivesOf(combatant).saltHoardDecay;
    if (decay > 0 && combatant.saltHoard > 0) combatant.saltHoard = Math.max(0, combatant.saltHoard - decay);
  }
  stampMarkAtLapEnd(draft, lap);
  // Re-ink cancellation is scoped to the lap that just ended.
  if (draft.countersignCancelledLap === lap) draft.countersignCancelledLap = null;
  runLapStart(draft);
}

function interestCount(load: number): number {
  if (load >= 55) return 3;
  if (load >= 40) return 2;
  if (load >= 25) return 1;
  return 0;
}

function runInterest(draft: Draft): void {
  const player = playerOf(draft);
  const modifiers = player ? passivesOf(player).interestCompounds : 0;
  const count = Math.max(0, interestCount(draft.deckLoad) + draft.interestLoad + modifiers);
  emit(draft, {
    k: 'interest',
    load: draft.deckLoad,
    count,
    period: draft.interestPeriod,
    beat: draft.beat,
  });
  if (count <= 0 || draft.compoundIds.length === 0) return;
  for (let i = 0; i < count; i += 1) {
    const [index, rng] = nextInt(draft.rng.rewards, draft.compoundIds.length);
    draft.rng = { ...draft.rng, rewards: rng };
    const cardId = draft.compoundIds[index];
    if (cardId !== undefined) addCompoundCard(draft, cardId, 'draw', true);
  }
}

function stampMarkAtLapEnd(draft: Draft, lap: number): void {
  const notary = draft.combatants.find(
    (combatant) => combatant.team === 'enemy' && isAlive(combatant) && passivesOf(combatant).stampMarks > 0 && combatant.phase >= 2,
  );
  if (!notary) return;
  const markId = draft.activeMarkIds[0];
  if (!markId) return;
  draft.activeMarkIds = draft.activeMarkIds.slice(1);
  draft.stampedMarks.push(markId);
  const marked = draft.markMods[markId] ?? [];
  const player = playerOf(draft);
  if (player) player.mods = subtractMods(player.mods, marked);
  emit(draft, { k: 'mark_stamped', who: notary.id, markId, lap });
}

// ---------------------------------------------------------------------------
// Enemy turns
// ---------------------------------------------------------------------------

/** The Receipt Wraith's next intent is a copy of the last card you played. */
function intentFor(draft: Draft, enemy: DraftCombatant): IntentDef {
  const scripted = enemy.intents[enemy.intentIndex % enemy.intents.length] as IntentDef;
  if (!passivesOf(enemy).mirrorLastCard) return scripted;
  const mirrored = draft.lastPlayed === null ? undefined : draft.library[draft.lastPlayed.cardId];
  if (!mirrored) return scripted;
  return {
    id: `mirror_${mirrored.id}`,
    weight: Math.max(1, mirrored.weight),
    targeting: mirrored.targeting === 'self' || mirrored.targeting === 'none' ? 'self' : 'opponent',
    effects: mirrored.effects.filter((e) => e.k !== 'echo' && e.k !== 'exhaust' && e.k !== 'draw'),
  };
}

/** The Notary stops stamping cards and starts stamping Marks. §6. */
function checkPhase(draft: Draft, enemy: DraftCombatant): void {
  const thresholds = passivesOf(enemy).phaseAtHpPct;
  if (thresholds.length === 0) return;
  const next = enemy.phases[enemy.phase - 1];
  if (!next) return;
  const threshold = thresholds[enemy.phase - 1] ?? thresholds[0];
  if (threshold === undefined || enemy.hp * 100 > enemy.maxHp * threshold) return;
  enemy.phase += 1;
  enemy.intents = next;
  enemy.intentIndex = 0;
  emit(draft, { k: 'phase', who: enemy.id, phase: enemy.phase });
}

function takeEnemyTurn(draft: Draft, enemy: DraftCombatant): void {
  if (!tickBleed(draft, enemy)) return;

  // Fine Print: the first enemy action each lap arrives a beat late.
  const player = playerOf(draft);
  if (player) {
    const slip = passivesOf(player).lapFirstEnemySlip;
    if (slip > 0 && claimOnce(draft, `lap_enemy_slip:${String(lapOf(draft.beat))}`)) {
      enemy.position += slip;
      emit(draft, { k: 'slip', who: enemy.id, n: slip });
      return;
    }
  }

  const intent = intentFor(draft, enemy);
  emit(draft, { k: 'act', who: enemy.id, what: intent.id, weight: intent.weight });
  enemy.position += intent.weight;
  enemy.intentIndex += 1;
  applyEffects(draft, intent.effects, {
    actorId: enemy.id,
    targetIds: resolveTargets(draft, enemy, intent.targeting, undefined),
    sourceId: intent.id,
    played: null,
    flags: null,
    isAttack: true,
    viaPerjury: false,
    isSecondHit: false,
  });
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

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

/** Stillness: if you play no card for six consecutive beats, the quiet pays out. */
function checkIdle(draft: Draft, player: DraftCombatant): void {
  for (const rule of passivesOf(player).idleGuard) {
    if (draft.beat - draft.lastPlayBeat < rule.beats) continue;
    if (!claimOnce(draft, `idle:${String(draft.lastPlayBeat)}:${String(rule.beats)}`)) continue;
    applyEffects(draft, [{ k: 'guard', n: rule.n }], baseContext({ actorId: player.id, sourceId: 'stillness' }));
  }
}

/**
 * Walk the track forward until the player has to decide something, or the fight ends.
 *
 * One atomic thing per iteration, re-reading the board each time, because a sworn
 * perjury resolving can Slip somebody and change who is furthest behind. The clock stops
 * at every lap boundary as well as at every marker, so the lap hooks fire on the beat
 * they belong to rather than at the far end of a jump.
 */
function settle(draft: Draft): void {
  for (let step = 0; step < MAX_RESOLVE_STEPS; step += 1) {
    if (finish(draft)) return;

    // Resolve an Interest deadline that landed on the current beat before looking for
    // the next marker. This is important when lap hooks leave every marker past a
    // coincident 24-beat deadline.
    if (draft.beat >= draft.interestNextBeat) {
      runInterest(draft);
      draft.interestNextBeat += draft.interestPeriod;
      continue;
    }

    const front = frontBeat(draft.combatants);
    if (front === null) continue;
    const boundary = (lapOf(draft.beat) + 1) * BEATS_PER_LAP;
    const stops = [front, boundary];
    if (draft.interestNextBeat > draft.beat) stops.push(draft.interestNextBeat);
    const sworn = soonestBeat(draft.pending);
    if (sworn !== null) stops.push(sworn);
    const timed = soonestBeat(draft.scheduled);
    if (timed !== null) stops.push(timed);
    advanceClock(draft, Math.min(...stops));

    // A lap ends exactly once, whatever else is queued for the same beat.
    if (draft.beat === boundary && claimOnce(draft, `lap_end:${String(lapOf(draft.beat) - 1)}`)) {
      runLapEnd(draft, lapOf(draft.beat) - 1);
      continue;
    }
    if (draft.beat >= draft.interestNextBeat) {
      runInterest(draft);
      draft.interestNextBeat += draft.interestPeriod;
      continue;
    }
    // Anything sworn for this beat happens before anybody acts on it.
    if (firePendingAt(draft, draft.beat)) continue;
    if (fireScheduledAt(draft, draft.beat)) continue;

    const actor = nextActor(draft.combatants);
    if (!actor) continue;
    const combatant = byId(draft, actor.id);
    if (!combatant) continue;
    if (combatant.position > draft.beat) continue;

    if (combatant.team === 'player') {
      // Bleed lands as the player comes up, not when they commit to a card, so it can
      // kill them on the correct beat instead of after a card they never got to play.
      if (!tickBleed(draft, combatant)) continue;
      checkIdle(draft, combatant);
      if (!isAlive(combatant)) continue;
      draft.awaiting = 'player';
      return;
    }
    checkPhase(draft, combatant);
    takeEnemyTurn(draft, combatant);
  }
  throw new Error(`combat did not settle within ${MAX_RESOLVE_STEPS} steps`);
}
