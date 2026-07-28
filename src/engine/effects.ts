/**
 * Effect atoms, resolved.
 *
 * One function per atom, all of them mutating the draft and none of them returning
 * anything. Cards and intents are both just lists of these, which is what lets the sim
 * reason about a card without playing it and lets the UI generate its own rules text.
 */
import { ECHO_WEIGHT_PENALTY, STRAIN_DAMAGE, STRAIN_THRESHOLD } from './constants';
import { addToHand, drawCards } from './deck';
import { byId, emit, nextUid } from './draft';
import type { Draft, DraftCombatant } from './draft';
import { isAlive } from './tally';
import type { CardInstance, Effect } from './types';

export type EffectContext = {
  readonly actorId: string;
  /** Resolved before the first atom runs, so a card cannot re-target mid-resolution. */
  readonly targetIds: readonly string[];
  /** Card id or intent id. Goes in the log and on the pending perjury. */
  readonly sourceId: string;
  /** The instance being played, for Echo. Null for intents and perjury resolutions. */
  readonly played: CardInstance | null;
  /** Scratch space for the current play. Null when nothing is being played. */
  readonly flags: { exhaust: boolean } | null;
};

export type DamageOptions = {
  /** Bleed goes through Guard. Attacks do not. */
  readonly ignoreGuard?: boolean;
  /**
   * Whether landing this fizzles the target's sworn perjuries. True for anything that
   * comes off an opponent, false for Strain: your own overreach should not catch you
   * out in your own lie.
   */
  readonly fizzlesPerjury?: boolean;
};

/** Guard decays 1 per beat elapsed, unless it has been frozen. §3.3. */
export function decayGuard(combatant: DraftCombatant, from: number, to: number): void {
  const span = to - from;
  if (span <= 0 || combatant.guard <= 0) return;
  const frozen = Math.max(0, Math.min(combatant.guardFrozenUntil, to) - from);
  const decay = span - frozen;
  if (decay > 0) combatant.guard = Math.max(0, combatant.guard - decay);
}

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

export function dealDamage(
  draft: Draft,
  targetId: string,
  amount: number,
  sourceId: string | null,
  options: DamageOptions = {},
): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || amount <= 0) return;

  let blocked = 0;
  let remaining = amount;
  if (!options.ignoreGuard) {
    blocked = Math.min(target.guard, remaining);
    target.guard -= blocked;
    remaining -= blocked;
  }
  target.hp = Math.max(0, target.hp - remaining);
  emit(draft, { k: 'damage', who: targetId, amount, blocked, sourceId });

  // "If you take unblocked damage first, it fizzles." §3.6.
  if (remaining > 0 && options.fizzlesPerjury !== false) fizzlePerjuries(draft, targetId);

  if (!isAlive(target)) {
    target.guard = 0;
    target.bleed = 0;
    emit(draft, { k: 'death', who: targetId });
    fizzlePerjuries(draft, targetId);
  }
}

function gainGuard(draft: Draft, combatant: DraftCombatant, n: number, frozenFor: number | undefined): void {
  if (n <= 0) return;
  combatant.guard += n;
  if (frozenFor !== undefined && frozenFor > 0) {
    combatant.guardFrozenUntil = Math.max(combatant.guardFrozenUntil, draft.beat + frozenFor);
  }
  emit(draft, { k: 'guard', who: combatant.id, amount: n, total: combatant.guard });
}

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
  const player = draft.combatants.find((c) => c.team === 'player');
  if (player) {
    dealDamage(draft, player.id, STRAIN_DAMAGE, null, { ignoreGuard: true, fizzlesPerjury: false });
  }
}

function slip(draft: Draft, targetId: string, n: number): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || n <= 0) return;
  target.position += n;
  emit(draft, { k: 'slip', who: targetId, n });
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
  const landed = Math.max(draft.beat, combatant.position - n);
  const moved = combatant.position - landed;
  combatant.position = landed;
  if (moved > 0) emit(draft, { k: 'haste', who: combatant.id, n: moved });
}

function applyBleed(draft: Draft, targetId: string, n: number): void {
  const target = byId(draft, targetId);
  if (!target || !isAlive(target) || n <= 0) return;
  target.bleed += n;
  emit(draft, { k: 'bleed', who: targetId, n });
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
  draft.pending.push({
    id: nextUid(draft, 'p'),
    ownerId: ctx.actorId,
    at: draft.beat + effect.in,
    targetId: ctx.targetIds[0] ?? null,
    sourceCardId: ctx.sourceId,
    effects: effect.effects,
  });
  emit(draft, { k: 'perjury_sworn', cardId: ctx.sourceId, at: draft.beat + effect.in });
}

export function applyEffect(draft: Draft, effect: Effect, ctx: EffectContext): void {
  const actor = byId(draft, ctx.actorId);
  switch (effect.k) {
    case 'damage':
      for (const targetId of ctx.targetIds) dealDamage(draft, targetId, effect.n, ctx.actorId);
      return;
    case 'guard':
      if (actor) gainGuard(draft, actor, effect.n, effect.frozenFor);
      return;
    case 'draw':
      if (actor?.team === 'player') drawCards(draft, effect.n);
      return;
    case 'slip':
      for (const targetId of ctx.targetIds) slip(draft, targetId, effect.n);
      return;
    case 'haste':
      if (actor) haste(draft, actor, effect.n);
      return;
    case 'bleed':
      for (const targetId of ctx.targetIds) applyBleed(draft, targetId, effect.n);
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
