/**
 * What a card is worth *in a deck*, with no board in front of it.
 *
 * Deliberately not `estimateEffects`. That one answers "what is this card worth on this
 * board, this beat, against these enemies", which needs a `CombatState` and is the right
 * question inside a fight. The layer above a fight asks a different question: given a shop,
 * a Reckoning and a stack of paper, which card do I want to stop owning? A card's answer to
 * that has nothing to do with the current beat, so the two do not share an implementation.
 *
 * Every number here is a guess and is supposed to be. The policy needs to be consistent,
 * not clever, so that a win rate moving means a balance number moved.
 */
import { effectsDeep } from '../content/types';
import type { CardDef, Effect } from '../engine/types';

/** Per point of the thing, before dividing by Weight. */
const VALUE = {
  damage: 1,
  guard: 0.4,
  heal: 0.5,
  draw: 2,
  slip: 0.8,
  haste: 0.5,
  salt: 0.05,
  strain: -0.35,
  selfDamage: -1,
  /** A Compound handed to you is worse than a wasted card: it is a wasted draw all fight. */
  compound: -8,
  exhaust: -1.5,
} as const;

/**
 * Scaling atoms priced at a plausible mid-fight count rather than at zero.
 *
 * "Deal 4 per card in your discard" is worth nothing on beat one and is a finisher on beat
 * forty, and a deck decision has to average over the whole fight. Four is that average.
 */
const ASSUMED_COUNT = 4;

function atomValue(effect: Effect): number {
  switch (effect.k) {
    case 'damage':
      return effect.n * VALUE.damage;
    case 'damage_per':
      return Math.floor(ASSUMED_COUNT / Math.max(1, effect.divide ?? 1)) * effect.n * VALUE.damage;
    case 'damage_random':
      return effect.n * VALUE.damage;
    case 'bleed':
      // Bleed N deals N + (N-1) + ... spread out. Half credit for the wait, as in-combat.
      return ((effect.n * (effect.n + 1)) / 2) * 0.5 * VALUE.damage;
    case 'self_damage':
      return effect.n * VALUE.selfDamage;
    case 'guard':
      return effect.n * VALUE.guard;
    case 'steal_guard':
      return Math.min(effect.max, effect.n * Math.floor(ASSUMED_COUNT / Math.max(1, effect.divide))) * VALUE.guard;
    case 'heal':
      return effect.n * VALUE.heal;
    case 'survive_lethal':
      return effect.heal * 0.5 * VALUE.heal;
    case 'draw':
      return effect.n * VALUE.draw;
    case 'discard':
      return -effect.n * VALUE.draw;
    case 'slip':
      return effect.n * VALUE.slip;
    case 'haste':
      return effect.n * VALUE.haste;
    case 'enemy_haste':
      return -effect.n * VALUE.slip;
    case 'strain':
      return effect.n * VALUE.strain;
    case 'salt':
      return effect.n * VALUE.salt;
    case 'add_compound':
      return effect.n * VALUE.compound;
    case 'remove_compound':
      return -effect.n * VALUE.compound;
    case 'purge_compounds':
      return -VALUE.compound;
    case 'exhaust':
      return VALUE.exhaust;
    case 'empower_next':
    case 'lap_boon':
    case 'return_last':
    case 'copy_intent':
      return VALUE.draw;
    case 'echo':
      return VALUE.draw;
    default:
      // Reveals, Salt theft, enemy-only atoms, and the wrappers `effectsDeep` already opened.
      return 0;
  }
}

/**
 * A card's worth per beat it costs, which is the only rate that matters when Weight is the
 * whole cost system. Weight 0 cards are priced as if they cost half a beat, so that free
 * cards look good without looking infinite.
 */
export function cardValue(def: CardDef): number {
  if (def.playable === false) return -20;
  const raw = effectsDeep(def.effects).reduce((total, effect) => total + atomValue(effect), 0);
  return raw / (def.weight + 0.5);
}

/** How much damage a card contributes, ignoring everything else it does. */
export function cardOffence(def: CardDef): number {
  if (def.playable === false) return 0;
  return effectsDeep(def.effects).reduce((total, effect) => {
    switch (effect.k) {
      case 'damage':
      case 'damage_random':
        return total + effect.n;
      case 'damage_per':
        return total + Math.floor(ASSUMED_COUNT / Math.max(1, effect.divide ?? 1)) * effect.n;
      case 'bleed':
        return total + (effect.n * (effect.n + 1)) / 2;
      default:
        return total;
    }
  }, 0);
}

/** How much a card keeps you alive: Guard, healing, and the one card that refuses lethal. */
export function cardDefence(def: CardDef): number {
  if (def.playable === false) return 0;
  return effectsDeep(def.effects).reduce((total, effect) => {
    switch (effect.k) {
      case 'guard':
        return total + effect.n;
      case 'steal_guard':
        return total + effect.n;
      case 'heal':
        return total + effect.n;
      case 'survive_lethal':
        return total + effect.heal;
      default:
        return total;
    }
  }, 0);
}

/**
 * Cards in the deck that can actually kill something.
 *
 * The reason this exists: a greedy policy that ranks removals by Weight alone will happily
 * trade away every attack it owns, arrive at the Bailiff with six Guard cards, and out-block
 * the fight forever without ever winning it. Offence is a floor, not a preference.
 */
export function offenceCount(defs: readonly CardDef[]): number {
  return defs.filter((def) => cardOffence(def) > 0).length;
}

/** The same floor from the other side: a deck with no Guard in it dies to the first elite. */
export function defenceCount(defs: readonly CardDef[]): number {
  return defs.filter((def) => cardDefence(def) > 0).length;
}
