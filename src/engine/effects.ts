/**
 * Effect atoms, resolved.
 *
 * One function per atom, all of them mutating the draft and none of them returning
 * anything. Cards and intents are both just lists of these, which is what lets the sim
 * reason about a card without playing it and lets the UI generate its own rules text.
 *
 * The damage pipeline is the one thing in here worth reading in order, because six
 * different content items all reach into it:
 *
 *   base -> attacker's passives -> perjury and second-hit scaling -> the attacker's own
 *   damage scale -> the target's damage reduction -> the target's vulnerable window ->
 *   Guard -> HP
 *
 * Bonuses land before reductions on purpose. A +1 attack Mark should be worth the same
 * to you whether or not the thing you are hitting is buried in paperwork.
 */
import { BEATS_PER_LAP, ECHO_WEIGHT_PENALTY, STRAIN_DAMAGE, STRAIN_THRESHOLD } from './constants';
import { addToHand, drawCards, exhaustCard, removeFrom } from './deck';
import { byId, claimOnce, countOf, emit, isCompound, nextUid, playerOf } from './draft';
import type { Draft, DraftCombatant } from './draft';
import { collectMods, scaledValue } from './mods';
import type { Passives } from './mods';
import { nextInt } from './rng';
import { isAlive, lapOf, opponentsOf } from './tally';
import type { CardDef, CardInstance, Effect, IntentDef, Mod } from './types';

export type EffectContext = {
  readonly actorId: string;
  /** Resolved before the first atom runs, so a card cannot re-target mid-resolution. */
  readonly targetIds: readonly string[];
  /** Card id or intent id. Goes in the log and on the pending perjury. */
  readonly sourceId: string;
  /** The instance being played, for Echo. Null for intents and perjury resolutions. */
  readonly played: CardInstance | null;
  /** Scratch space for the current play. Null when nothing is being played. */
  readonly flags: { exhaust: boolean; killed: boolean } | null;
  /** Attack-type card or a damaging intent. Gates the attack-damage passives. */
  readonly isAttack: boolean;
  /** A sworn thing coming true. Gates Patience. */
  readonly viaPerjury: boolean;
  /** Two Truths landing its second half. Gates Doubled. */
  readonly isSecondHit: boolean;
};

export function baseContext(overrides: Partial<EffectContext> & { actorId: string }): EffectContext {
  return {
    targetIds: [],
    sourceId: overrides.actorId,
    played: null,
    flags: null,
    isAttack: false,
    viaPerjury: false,
    isSecondHit: false,
    ...overrides,
  };
}

export type DamageOptions = {
  /** Bleed and Strain go through Guard. Attacks do not. */
  readonly ignoreGuard?: boolean;
  /** Chip this much Guard off before Guard gets to block. Leverage, Pry Bar. */
  readonly pierce?: number;
  /**
   * Whether landing this fizzles the target's sworn perjuries. True for anything that
   * comes off an opponent, false for Strain: your own overreach should not catch you
   * out in your own lie.
   */
  readonly fizzlesPerjury?: boolean;
  /** Who threw it. Drives the on-kill triggers. */
  readonly attackerId?: string;
};

// ---------------------------------------------------------------------------
// Passives
// ---------------------------------------------------------------------------

/**
 * A combatant's passives.
 *
 * Recomputed per read rather than cached. Aggregating a dozen mods is a handful of
 * additions, and a cache would need invalidating every time a Mark gets stamped or a
 * Token gets taken, which is exactly the sort of bookkeeping that goes wrong quietly.
 */
export function passivesOf(combatant: { readonly mods: Parameters<typeof collectMods>[0] }): Passives {
  return collectMods(combatant.mods);
}

/** Passives coming off the cards currently sitting in the player's hand. */
export function handPassives(draft: Draft): Passives {
  const mods = draft.deck.hand.flatMap((c) => draft.library[c.cardId]?.mods ?? []);
  return collectMods(mods);
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * What Guard is worth after the clock moves from `from` to `to`. Decays 1 per beat
 * elapsed, unless it has been frozen or slowed. §3.3.
 *
 * Pure, and separate from `decayGuard`, because phase 3's hover preview has to answer
 * "how much of this Guard survives until the enemy actually swings" and there must be
 * exactly one implementation of that arithmetic. A preview that disagrees with the
 * engine is worse than no preview.
 */
export function guardAfterDecay(
  combatant: { readonly guard: number; readonly guardFrozenUntil: number; readonly mods: readonly Mod[] },
  from: number,
  to: number,
): number {
  const span = to - from;
  if (span <= 0 || combatant.guard <= 0) return Math.max(0, combatant.guard);

  const passives = passivesOf(combatant);
  // A Widow's Thimble: nothing melts during lap 0 at all.
  if (passives.guardNoDecayFirstLap && to <= BEATS_PER_LAP) return combatant.guard;

  const frozen = Math.max(0, Math.min(combatant.guardFrozenUntil, to) - from);
  const beats = span - frozen;
  if (beats <= 0) return combatant.guard;
  const rate = Math.max(0, 1 - passives.guardDecaySlower);
  return Math.max(0, combatant.guard - Math.floor(beats * rate));
}

export function decayGuard(combatant: DraftCombatant, from: number, to: number): void {
  combatant.guard = guardAfterDecay(combatant, from, to);
}

function gainGuard(draft: Draft, combatant: DraftCombatant, n: number, frozenFor: number | undefined): void {
  const passives = passivesOf(combatant);

  // Grief, Unpaid: while it is in your hand, you cannot gain Guard at all.
  if (combatant.team === 'player' && handPassives(draft).inHandNoGuard) return;

  const amount = n + (n > 0 ? passives.guardGain : 0);
  if (amount <= 0) return;
  combatant.guard += amount;

  let freeze = frozenFor ?? 0;
  // Corroborated: the first Guard you gain each lap does not decay for a while.
  if (passives.lapFirstGuardFrozen > 0 && claimOnce(draft, `lap_guard:${String(lapOf(draft.beat))}`)) {
    freeze = Math.max(freeze, passives.lapFirstGuardFrozen);
  }
  if (freeze > 0) combatant.guardFrozenUntil = Math.max(combatant.guardFrozenUntil, draft.beat + freeze);

  emit(draft, { k: 'guard', who: combatant.id, amount, total: combatant.guard });
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/** Everything this combatant had sworn stops being true. */
export function fizzlePerjuries(draft: Draft, ownerId: string): void {
  if (draft.pending.length === 0) return;
  const kept: typeof draft.pending = [];
  for (const pending of draft.pending) {
    if (pending.ownerId === ownerId) emit(draft, { k: 'perjury_fizzled', cardId: pending.sourceCardId });
    else kept.push(pending);
  }
  draft.pending = kept;
}

/** The attacker's half of the pipeline: passives, scaling, and their own damage scale. */
function outgoingDamage(draft: Draft, ctx: EffectContext, base: number): number {
  const actor = byId(draft, ctx.actorId);
  if (!actor || base <= 0) return Math.max(0, base);
  const passives = passivesOf(actor);

  let amount = base;
  if (ctx.isAttack) {
    amount += passives.attackDamage;
    for (const bonus of passives.attackDamagePer) amount += scaledValue(bonus, countOf(draft, bonus.per));
    // A Child's Tooth. Once, on the first attack of the combat.
    if (passives.firstAttackDamage > 0 && claimOnce(draft, `first_attack:${actor.id}`)) {
      amount += passives.firstAttackDamage;
    }
    amount += actor.damageBonus;
  }
  if (ctx.isSecondHit) amount += passives.secondHitDamage;
  if (ctx.viaPerjury && passives.perjuryDamagePct !== 0) {
    amount = Math.floor(amount * (1 + passives.perjuryDamagePct / 100));
  }
  return Math.max(0, Math.floor(amount * actor.damageScale));
}

/** The target's half: paperwork, re-ink windows, then Guard. */
export function dealDamage(
  draft: Draft,
  targetId: string,
  amount: number,
  sourceId: string | null,
  options: DamageOptions = {},
): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || amount <= 0) return;
  const targetPassives = passivesOf(target);

  let incoming = amount;
  // Fined takes 70% reduced damage until its paperwork is destroyed.
  for (const shield of targetPassives.shieldedBy) {
    const ally = byId(draft, shield.allyId);
    if (ally && isAlive(ally)) incoming = Math.ceil(incoming * (1 - shield.pct / 100));
  }
  // The stamp needs ink, and while it is re-inking everything lands three times as hard.
  if (draft.beat < target.vulnerableUntil) incoming = incoming * target.vulnerableMultiplier;

  let blocked = 0;
  let remaining = incoming;
  if (!options.ignoreGuard) {
    const pierced = Math.min(target.guard, options.pierce ?? 0);
    target.guard -= pierced;
    blocked = Math.min(target.guard, remaining);
    target.guard -= blocked;
    remaining -= blocked;
  }
  target.hp = Math.max(0, target.hp - remaining);
  emit(draft, { k: 'damage', who: targetId, amount: incoming, blocked, sourceId });

  // "If you take unblocked damage first, it fizzles." §3.6.
  if (remaining > 0 && options.fizzlesPerjury !== false) fizzlePerjuries(draft, targetId);

  if (isAlive(target)) {
    if (remaining > 0) checkHpTriggers(draft, target, targetPassives);
    return;
  }

  // Half a Locket and Dead Man's Switch get a look in before the body drops.
  if (spendWard(draft, target)) return;

  target.guard = 0;
  target.bleed = 0;
  emit(draft, { k: 'death', who: targetId });
  fizzlePerjuries(draft, targetId);
  onDeath(draft, target, options.attackerId ?? null);
}

/** Half a Locket: an emergency wall the first time you drop under the line. */
function checkHpTriggers(draft: Draft, target: DraftCombatant, passives: Passives): void {
  for (const trigger of passives.belowHpPct) {
    if (target.hp * 100 > target.maxHp * trigger.pct) continue;
    if (!claimOnce(draft, `below_hp:${target.id}:${trigger.key}`)) continue;
    applyEffects(draft, trigger.effects, baseContext({ actorId: target.id, sourceId: trigger.key }));
  }
}

/** Dead Man's Switch: "When you would die this combat, heal 15 and Exhaust this instead." */
function spendWard(draft: Draft, target: DraftCombatant): boolean {
  const index = draft.wards.findIndex((w) => w.kind === 'survive_lethal');
  const ward = draft.wards[index];
  if (!ward || target.team !== 'player') return false;
  draft.wards.splice(index, 1);
  target.hp = Math.min(target.maxHp, ward.heal);
  // A ward with a card behind it is Dead Man's Switch; one with none came off the sheet.
  emit(draft, { k: 'ward_spent', who: target.id, healed: target.hp, fromCard: ward.cardUid !== null });
  if (ward.cardUid) {
    const instance = removeFrom(draft.deck.discard, ward.cardUid) ?? removeFrom(draft.deck.hand, ward.cardUid);
    if (instance) exhaustCard(draft, instance);
  }
  return true;
}

/**
 * Someone died. Two things care: whoever killed them, and whoever they were standing
 * next to.
 */
function onDeath(draft: Draft, dead: DraftCombatant, attackerId: string | null): void {
  const attacker = attackerId === null ? null : byId(draft, attackerId);
  if (attacker && isAlive(attacker)) {
    for (const trigger of passivesOf(attacker).onKill) {
      applyEffects(draft, trigger.effects, baseContext({ actorId: attacker.id, sourceId: trigger.key }));
    }
  }
  // Killing one Bailiff doubles the other. There is no correct order, only a correct pace.
  for (const ally of draft.combatants) {
    if (ally.id === dead.id || ally.team !== dead.team || !isAlive(ally)) continue;
    if (!passivesOf(ally).doublesOnAllyDeath) continue;
    ally.maxHp *= 2;
    ally.hp *= 2;
    ally.damageScale *= 2;
  }
}

// ---------------------------------------------------------------------------
// The rest of the atoms
// ---------------------------------------------------------------------------

/**
 * Strain. Weight-0 loops are a resource you spend, not an infinite you discover. §3.5.
 *
 * Deliberately unglamorous: at the threshold you take a flat hit and go back to zero.
 * The overflow is forgiven, which matches the design doc's wording and means a big
 * Strain card is never worse than two small ones.
 */
function addStrain(draft: Draft, n: number): void {
  if (n <= 0) return;
  draft.strain += n;
  emit(draft, { k: 'strain', total: draft.strain });
  if (draft.strain < STRAIN_THRESHOLD) return;
  draft.strain = 0;
  emit(draft, { k: 'strain_break', damage: STRAIN_DAMAGE });
  const player = playerOf(draft);
  if (player) {
    dealDamage(draft, player.id, STRAIN_DAMAGE, null, { ignoreGuard: true, fizzlesPerjury: false });
  }
}

function slip(draft: Draft, actor: DraftCombatant | null, targetId: string, n: number): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || n <= 0) return;
  const bonus = actor ? passivesOf(actor).slipBonus : 0;
  const beats = n + bonus;
  target.position += beats;
  emit(draft, { k: 'slip', who: targetId, n: beats });
}

/**
 * Haste pulls your marker back, but never behind the clock.
 *
 * That clamp is load-bearing. The clock only ever moves forward, because Guard decay
 * and perjury resolution are both computed off elapsed beats, and a marker that could
 * rewind past `now` would make both of them ambiguous. In practice the clamp is
 * generous rather than punishing: being pulled to the current beat means acting again
 * immediately, which is the whole point of Haste.
 */
function haste(draft: Draft, combatant: DraftCombatant, n: number): void {
  if (n <= 0) return;
  const beats = n + passivesOf(combatant).hasteBonus;
  const landed = Math.max(draft.beat, combatant.position - beats);
  const moved = combatant.position - landed;
  combatant.position = landed;
  if (moved > 0) emit(draft, { k: 'haste', who: combatant.id, n: moved });
}

function applyBleed(draft: Draft, actor: DraftCombatant | null, targetId: string, n: number): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || n <= 0) return;
  const applied = n + (actor ? passivesOf(actor).bleedBonus : 0);
  target.bleed += applied;
  emit(draft, { k: 'bleed', who: targetId, n: applied });
}

/** On play, add a copy to your hand at Weight +1. §3.6. Chains get heavier. */
function echo(draft: Draft, played: CardInstance | null): void {
  if (!played) return;
  const copy: CardInstance = {
    uid: nextUid(draft, 'c'),
    cardId: played.cardId,
    weightDelta: played.weightDelta + ECHO_WEIGHT_PENALTY,
  };
  if (addToHand(draft, copy)) emit(draft, { k: 'echo', uid: copy.uid, cardId: copy.cardId });
}

function swear(draft: Draft, effect: Extract<Effect, { k: 'perjury' }>, ctx: EffectContext): void {
  const actor = byId(draft, ctx.actorId);
  const sooner = actor ? passivesOf(actor).perjurySooner : 0;
  const at = draft.beat + Math.max(1, effect.in - sooner);
  draft.pending.push({
    id: nextUid(draft, 'p'),
    ownerId: ctx.actorId,
    at,
    targetId: ctx.targetIds[0] ?? null,
    sourceCardId: ctx.sourceId,
    effects: effect.effects,
  });
  emit(draft, { k: 'perjury_sworn', cardId: ctx.sourceId, at });
}

function schedule(draft: Draft, at: number, effects: readonly Effect[], ctx: EffectContext): void {
  draft.scheduled.push({
    id: nextUid(draft, 's'),
    ownerId: ctx.actorId,
    at,
    targetId: ctx.targetIds[0] ?? null,
    sourceId: ctx.sourceId,
    effects,
  });
  emit(draft, { k: 'scheduled', sourceId: ctx.sourceId, at });
}

function gainSalt(draft: Draft, n: number): void {
  if (n === 0) return;
  draft.salt = Math.max(0, draft.salt + n);
  emit(draft, { k: 'salt', amount: n, total: draft.salt });
}

/** Sixpence Trick: take Guard off the target and keep it yourself. */
function stealGuard(draft: Draft, effect: Extract<Effect, { k: 'steal_guard' }>, ctx: EffectContext): void {
  const actor = byId(draft, ctx.actorId);
  if (!actor) return;
  const wanted = Math.min(effect.max, Math.floor(countOf(draft, effect.per) / Math.max(1, effect.divide)) * effect.n);
  if (wanted <= 0) return;
  let taken = 0;
  for (const targetId of ctx.targetIds) {
    const target = byId(draft, targetId);
    if (!target) continue;
    const off = Math.min(target.guard, wanted - taken);
    target.guard -= off;
    taken += off;
    if (taken >= wanted) break;
  }
  // The card says steal, so it is worth having even against a bare enemy: what it
  // cannot take off them it takes off nobody, and you get what it managed.
  if (taken > 0) gainGuard(draft, actor, taken, undefined);
}

/** Random by design: no choice means the sim and the player see the same card leave. */
function discardAtRandom(draft: Draft, n: number): void {
  for (let i = 0; i < n; i += 1) {
    if (draft.deck.hand.length === 0) return;
    const [index, rng] = nextInt(draft.rng.shuffle, draft.deck.hand.length);
    draft.rng = { ...draft.rng, shuffle: rng };
    const [instance] = draft.deck.hand.splice(index, 1);
    if (!instance) return;
    draft.deck.discard.push(instance);
    emit(draft, { k: 'discard', uid: instance.uid, cardId: instance.cardId });
    fireDiscardTriggers(draft);
  }
}

/** Faithless: when you discard a card, deal 2 to a random enemy. */
export function fireDiscardTriggers(draft: Draft): void {
  const player = playerOf(draft);
  if (!player) return;
  for (const trigger of passivesOf(player).onDiscard) {
    applyEffects(draft, trigger.effects, baseContext({ actorId: player.id, sourceId: trigger.key, isAttack: true }));
  }
}

function damageRandomOpponent(draft: Draft, ctx: EffectContext, amount: number): void {
  const actor = byId(draft, ctx.actorId);
  if (!actor) return;
  const foes = opponentsOf(draft.combatants, actor.team).filter(isAlive);
  if (foes.length === 0) return;
  const [index, rng] = nextInt(draft.rng.ai, foes.length);
  draft.rng = { ...draft.rng, ai: rng };
  const target = foes[index];
  if (target) dealDamage(draft, target.id, amount, ctx.sourceId, { attackerId: actor.id });
}

/** Accounted: start each combat with 4 random cards already in your discard. */
function seedDiscard(draft: Draft, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const card = draft.deck.draw.shift();
    if (!card) return;
    draft.deck.discard.push(card);
  }
}

function compoundIdsIn(draft: Draft): string[] {
  return Object.keys(draft.library)
    .filter((id) => draft.library[id]?.playable === false)
    .sort();
}

/** Interest's little gifts, and what Collector's Interest sells you Salt for. */
function addCompounds(draft: Draft, effect: Extract<Effect, { k: 'add_compound' }>): void {
  const pool = compoundIdsIn(draft);
  if (pool.length === 0) return;
  for (let i = 0; i < effect.n; i += 1) {
    const [index, rng] = nextInt(draft.rng.rewards, pool.length);
    draft.rng = { ...draft.rng, rewards: rng };
    const cardId = pool[index];
    if (cardId === undefined) return;
    const instance: CardInstance = { uid: nextUid(draft, 'x'), cardId, weightDelta: 0 };
    if (effect.to === 'hand') {
      if (!addToHand(draft, instance)) draft.deck.draw.push(instance);
    } else if (effect.to === 'discard') {
      draft.deck.discard.push(instance);
    } else {
      draft.deck.draw.push(instance);
    }
    emit(draft, { k: 'compound', uid: instance.uid, cardId, to: effect.to });
  }
}

/** False Ledger digs junk out of the draw pile before you have to draw it. */
function removeCompounds(draft: Draft, limit: number): number {
  let removed = 0;
  for (const zone of [draft.deck.draw, draft.deck.hand, draft.deck.discard]) {
    for (let i = zone.length - 1; i >= 0 && removed < limit; i -= 1) {
      const instance = zone[i];
      if (!instance || !isCompound(draft, instance.cardId)) continue;
      zone.splice(i, 1);
      removed += 1;
      emit(draft, { k: 'compound_removed', cardId: instance.cardId });
    }
    if (removed >= limit) break;
  }
  return removed;
}

/**
 * Recant: the thing you just said comes back to you, free.
 *
 * It checks the hand too, which is not paranoia: drawing after a play can reshuffle the
 * discard and hand you the same card back before Recant ever looks for it. Without this
 * the card would silently do nothing, which is the worst possible outcome for a card whose
 * entire text is a promise.
 */
function returnLast(draft: Draft, weight: number | undefined): void {
  const last = draft.lastPlayed;
  if (!last) return;
  const def = draft.library[last.cardId];
  if (!def) return;
  const delta = (instance: CardInstance) => (weight === undefined ? instance.weightDelta : weight - def.weight);

  // Already back in hand: re-cost it where it sits rather than doing nothing.
  const held = draft.deck.hand.findIndex((c) => c.uid === last.uid);
  const inHand = draft.deck.hand[held];
  if (inHand) {
    draft.deck.hand[held] = { ...inHand, weightDelta: delta(inHand) };
    draft.lastPlayed = null;
    emit(draft, { k: 'returned', uid: inHand.uid, cardId: inHand.cardId });
    return;
  }

  const instance = removeFrom(draft.deck.discard, last.uid) ?? removeFrom(draft.deck.exhausted, last.uid);
  if (!instance) return;
  if (addToHand(draft, { ...instance, weightDelta: delta(instance) })) {
    draft.lastPlayed = null;
    emit(draft, { k: 'returned', uid: instance.uid, cardId: instance.cardId });
  } else {
    draft.deck.discard.push(instance);
  }
}

/**
 * Witness: the enemy's next intent, as a card in your hand.
 *
 * The synthetic definition goes into the combat's library, which means one shallow copy
 * of it. Rare enough to not care, and it keeps `CardInstance` from growing a per-instance
 * effect list that every other consumer would then have to check for.
 */
function copyIntent(draft: Draft, ctx: EffectContext, weight: number): void {
  const actor = byId(draft, ctx.actorId);
  if (!actor) return;
  const foe = opponentsOf(draft.combatants, actor.team).filter(isAlive)[0];
  if (!foe || foe.intents.length === 0) return;
  const intent = foe.intents[foe.intentIndex % foe.intents.length] as IntentDef;

  const id = `witness_${intent.id}_${nextUid(draft, 'w')}`;
  const def: CardDef = {
    id,
    name: intent.id,
    weight,
    type: intent.effects.some((e) => e.k === 'damage' || e.k === 'damage_per') ? 'attack' : 'skill',
    targeting: intent.targeting === 'opponent' ? 'opponent' : intent.targeting,
    effects: intent.effects,
  };
  draft.library = { ...draft.library, [id]: def };
  const instance: CardInstance = { uid: nextUid(draft, 'c'), cardId: id, weightDelta: 0 };
  if (addToHand(draft, instance)) emit(draft, { k: 'draw', uid: instance.uid, cardId: id });
}

/** The Owed buff each other, never themselves. */
function buffAlly(draft: Draft, ctx: EffectContext, n: number): void {
  const actor = byId(draft, ctx.actorId);
  if (!actor) return;
  const ally = draft.combatants.find((c) => c.team === actor.team && c.id !== actor.id && isAlive(c));
  if (ally) ally.damageBonus += n;
}

function stealSalt(draft: Draft, ctx: EffectContext, n: number): void {
  const thief = byId(draft, ctx.actorId);
  if (!thief) return;
  const taken = Math.min(draft.salt, n);
  if (taken <= 0) return;
  draft.salt -= taken;
  thief.saltHoard += taken;
  emit(draft, { k: 'salt_stolen', who: thief.id, amount: taken });
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

export function applyEffect(draft: Draft, effect: Effect, ctx: EffectContext): void {
  const actor = byId(draft, ctx.actorId);
  switch (effect.k) {
    case 'damage': {
      const amount = outgoingDamage(draft, ctx, effect.n);
      const pierce = actor ? passivesOf(actor).pierce : 0;
      for (const targetId of ctx.targetIds) {
        const before = byId(draft, targetId)?.hp ?? 0;
        dealDamage(draft, targetId, amount, ctx.sourceId, {
          ...(effect.pierce === true ? { ignoreGuard: true } : { pierce }),
          attackerId: ctx.actorId,
        });
        if (ctx.flags && before > 0 && (byId(draft, targetId)?.hp ?? 0) <= 0) ctx.flags.killed = true;
      }
      return;
    }
    case 'damage_per': {
      const count = countOf(draft, effect.per);
      const base = Math.floor(count / Math.max(1, effect.divide ?? 1)) * effect.n;
      const amount = outgoingDamage(draft, ctx, base);
      const pierce = actor ? passivesOf(actor).pierce : 0;
      for (const targetId of ctx.targetIds) {
        dealDamage(draft, targetId, amount, ctx.sourceId, { pierce, attackerId: ctx.actorId });
      }
      return;
    }
    case 'damage_random':
      damageRandomOpponent(draft, ctx, outgoingDamage(draft, ctx, effect.n));
      return;
    case 'self_damage':
      if (actor) dealDamage(draft, actor.id, effect.n, ctx.sourceId, { ignoreGuard: true, fizzlesPerjury: false });
      return;
    case 'guard':
      if (actor) gainGuard(draft, actor, effect.n, effect.frozenFor);
      return;
    case 'heal':
      if (actor && effect.n > 0) {
        const healed = Math.min(effect.n, actor.maxHp - actor.hp);
        actor.hp += healed;
        if (healed > 0) emit(draft, { k: 'heal', who: actor.id, amount: healed });
      }
      return;
    case 'draw':
      if (actor?.team === 'player') drawWithTriggers(draft, effect.n);
      return;
    case 'discard':
      if (actor?.team === 'player') discardAtRandom(draft, effect.n);
      return;
    case 'slip':
      for (const targetId of ctx.targetIds) slip(draft, actor, targetId, effect.n);
      return;
    case 'haste':
      if (actor) haste(draft, actor, effect.n);
      return;
    case 'enemy_haste':
      for (const foe of draft.combatants) {
        if (foe.team === 'enemy' && isAlive(foe)) haste(draft, foe, effect.n);
      }
      return;
    case 'bleed':
      for (const targetId of ctx.targetIds) applyBleed(draft, actor, targetId, effect.n);
      return;
    case 'strain':
      if (actor?.team === 'player') addStrain(draft, effect.n);
      return;
    case 'echo':
      if (actor?.team === 'player') echo(draft, ctx.played);
      return;
    case 'exhaust':
      if (ctx.flags) ctx.flags.exhaust = true;
      return;
    case 'perjury':
      swear(draft, effect, ctx);
      return;
    case 'next_action':
      draft.nextAction.push({
        id: nextUid(draft, 'n'),
        ownerId: ctx.actorId,
        at: draft.beat,
        targetId: ctx.targetIds[0] ?? null,
        sourceId: ctx.sourceId,
        effects: effect.effects,
      });
      return;
    case 'next_lap':
      schedule(draft, (lapOf(draft.beat) + 1) * 24, effect.effects, ctx);
      return;
    case 'on_kill':
      if (ctx.flags?.killed === true) applyEffects(draft, effect.effects, ctx);
      return;
    case 'salt':
      if (actor?.team === 'player') gainSalt(draft, effect.n);
      return;
    case 'spend_salt':
      if (draft.salt >= effect.n) {
        gainSalt(draft, -effect.n);
        applyEffects(draft, effect.effects, ctx);
      }
      return;
    case 'steal_guard':
      stealGuard(draft, effect, ctx);
      return;
    case 'reveal_intents':
      draft.intentsRevealed += effect.n;
      return;
    case 'empower_next':
      draft.boons.push({
        id: nextUid(draft, 'b'),
        boon: effect.boon,
        remaining: effect.n,
        untilLapEnd: effect.untilLapEnd ?? false,
        lap: lapOf(draft.beat),
      });
      emit(draft, { k: 'boon', cards: effect.n });
      return;
    case 'lap_boon':
      draft.boons.push({
        id: nextUid(draft, 'b'),
        boon: effect.boon,
        remaining: null,
        untilLapEnd: true,
        lap: lapOf(draft.beat),
      });
      emit(draft, { k: 'boon', cards: 0 });
      return;
    case 'return_last':
      returnLast(draft, effect.weight);
      return;
    case 'copy_intent':
      copyIntent(draft, ctx, effect.weight);
      return;
    case 'remove_compound':
      removeCompounds(draft, effect.n);
      return;
    case 'purge_compounds': {
      const removed = removeCompounds(draft, Number.MAX_SAFE_INTEGER);
      if (actor && effect.guardPer !== undefined && removed > 0) {
        gainGuard(draft, actor, removed * effect.guardPer, undefined);
      }
      return;
    }
    case 'add_compound':
      addCompounds(draft, effect);
      return;
    case 'seed_discard':
      seedDiscard(draft, effect.n);
      return;
    case 'survive_lethal':
      draft.wards.push({
        id: nextUid(draft, 'v'),
        kind: 'survive_lethal',
        heal: effect.heal,
        cardUid: ctx.played?.uid ?? null,
      });
      return;
    case 'vulnerable':
      if (actor) {
        actor.vulnerableUntil = draft.beat + effect.beats;
        actor.vulnerableMultiplier = effect.multiplier;
        emit(draft, { k: 'vulnerable', who: actor.id, until: actor.vulnerableUntil, multiplier: effect.multiplier });
      }
      return;
    case 'steal_salt':
      stealSalt(draft, ctx, effect.n);
      return;
    case 'ally_damage':
      buffAlly(draft, ctx, effect.n);
      return;
    // The map is not a thing a combat can see. Phase 4 reads this off the card instead.
    case 'reveal_nodes':
      return;
  }
}

export function applyEffects(draft: Draft, effects: readonly Effect[], ctx: EffectContext): void {
  for (const effect of effects) {
    // A card that kills its target mid-list still finishes resolving; a dead actor
    // stops, because anything left on the list was theirs to do.
    const actor = byId(draft, ctx.actorId);
    if (actor && !isAlive(actor)) return;
    applyEffect(draft, effect, ctx);
  }
}

/**
 * Draw, then let the drawn cards bite.
 *
 * `deck.ts` stays trigger-free so it has no reason to import this file. Accrual is the
 * only card in the demo that hurts on the way into your hand, and it should hurt whether
 * it arrived from a card, a lap, or the opening deal.
 */
export function drawWithTriggers(draft: Draft, n: number): void {
  const drawn = drawCards(draft, n);
  if (drawn.length === 0) return;
  const player = playerOf(draft);
  if (!player) return;
  for (const instance of drawn) {
    for (const trigger of passivesOf({ mods: draft.library[instance.cardId]?.mods ?? [] }).onDraw) {
      applyEffects(draft, trigger.effects, baseContext({ actorId: player.id, sourceId: instance.cardId }));
    }
  }
}
