/**
 * What a card is worth, guessed from its effects alone.
 *
 * This is the payoff for effects being data rather than functions: the policy can price a
 * card it has never seen without playing it and without a lookup table. Add a card to
 * `content/cards.ts` and the sim can already reason about it.
 *
 * The discounts below are guesses, and they are supposed to be. A heuristic policy does
 * not need to be good, it needs to be *consistent*, so that when a balance number moves
 * the win rate moves for that reason and not because the AI got cleverer.
 */
import { countOf } from '../engine/draft';
import type { Draft } from '../engine/draft';
import type { CombatState, Effect } from '../engine/types';

export type Estimate = {
  damage: number;
  /** Damage aimed at the player. Debt of Honour's bill, Accrual's bite. */
  selfDamage: number;
  guard: number;
  heal: number;
  draw: number;
  /** Beats bought by pushing an enemy back. Haste is scored separately: see `hasteBeats`. */
  slip: number;
  hasteBeats: number;
  strain: number;
  salt: number;
  /** Junk added minus junk removed. Positive is bad. */
  junk: number;
  /** Cards that leave the deck for the fight. Mildly bad on its own. */
  exhausts: number;
  echoes: number;
  /** How much of this is a promise that something could still catch out. */
  promised: number;
};

const EMPTY: Estimate = {
  damage: 0,
  selfDamage: 0,
  guard: 0,
  heal: 0,
  draw: 0,
  slip: 0,
  hasteBeats: 0,
  strain: 0,
  salt: 0,
  junk: 0,
  exhausts: 0,
  echoes: 0,
  promised: 0,
};

/** A perjury may fizzle. Worth most of face value, not all of it. */
const PERJURY_DISCOUNT = 0.6;
/** Scheduled and second-hit effects land unless you die first. */
const DELAYED_DISCOUNT = 0.85;
/** On-kill riders only pay out sometimes. */
const CONDITIONAL_DISCOUNT = 0.3;

/** Bleed N deals N + (N-1) + ... over N activations, spread out. Half credit for the wait. */
function bleedValue(n: number): number {
  return ((n * (n + 1)) / 2) * 0.5;
}

function scale(estimate: Estimate, factor: number): Estimate {
  const out = { ...EMPTY };
  for (const key of Object.keys(out) as (keyof Estimate)[]) out[key] = estimate[key] * factor;
  return out;
}

function add(into: Estimate, from: Estimate): void {
  for (const key of Object.keys(into) as (keyof Estimate)[]) into[key] += from[key];
}

/**
 * Price a list of effects.
 *
 * `state` is needed for the scaling atoms: "deal 4 per card in your discard pile" is worth
 * nothing on turn one and is a finisher on turn twenty.
 */
export function estimateEffects(state: CombatState, effects: readonly Effect[], targets = 1): Estimate {
  const out = { ...EMPTY };
  const counts = (per: Parameters<typeof countOf>[1]) => countOf(state as unknown as Draft, per);

  for (const effect of effects) {
    switch (effect.k) {
      case 'damage':
        out.damage += effect.n * targets;
        break;
      case 'damage_per':
        out.damage += Math.floor(counts(effect.per) / Math.max(1, effect.divide ?? 1)) * effect.n * targets;
        break;
      case 'damage_random':
        out.damage += effect.n;
        break;
      case 'self_damage':
        out.selfDamage += effect.n;
        break;
      case 'guard':
        out.guard += effect.n;
        break;
      case 'heal':
        out.heal += effect.n;
        break;
      case 'draw':
        out.draw += effect.n;
        break;
      case 'discard':
        out.draw -= effect.n;
        break;
      case 'slip':
        out.slip += effect.n * targets;
        break;
      case 'haste':
        out.hasteBeats += effect.n;
        break;
      case 'enemy_haste':
        out.slip -= effect.n;
        break;
      case 'bleed':
        out.damage += bleedValue(effect.n) * targets;
        break;
      case 'strain':
        out.strain += effect.n;
        break;
      case 'echo':
        out.echoes += 1;
        break;
      case 'exhaust':
        out.exhausts += 1;
        break;
      case 'perjury': {
        const inner = scale(estimateEffects(state, effect.effects, targets), PERJURY_DISCOUNT);
        add(out, inner);
        out.promised += inner.damage + inner.guard;
        break;
      }
      case 'next_action':
      case 'next_lap':
        add(out, scale(estimateEffects(state, effect.effects, targets), DELAYED_DISCOUNT));
        break;
      case 'on_kill':
        add(out, scale(estimateEffects(state, effect.effects, targets), CONDITIONAL_DISCOUNT));
        break;
      case 'salt':
        out.salt += effect.n;
        break;
      case 'spend_salt':
        // Only worth anything if the Salt is actually there.
        if (state.salt >= effect.n) {
          out.salt -= effect.n;
          add(out, estimateEffects(state, effect.effects, targets));
        }
        break;
      case 'steal_guard':
        out.guard += Math.min(effect.max, Math.floor(counts(effect.per) / Math.max(1, effect.divide)) * effect.n);
        break;
      case 'empower_next':
        // A free card is worth roughly a card.
        out.draw += effect.n * 0.8;
        break;
      case 'lap_boon':
        out.draw += 2;
        break;
      case 'return_last':
      case 'copy_intent':
        out.draw += 1;
        break;
      case 'remove_compound':
        out.junk -= effect.n;
        break;
      case 'purge_compounds': {
        const junk = counts('compounds_in_discard') + counts('compounds_in_hand');
        out.junk -= junk;
        out.guard += junk * (effect.guardPer ?? 0);
        break;
      }
      case 'add_compound':
        out.junk += effect.n;
        break;
      case 'seed_discard':
        break;
      case 'survive_lethal':
        out.heal += effect.heal * 0.5;
        break;
      // Things only an enemy does, or things a combat cannot see.
      case 'vulnerable':
      case 'steal_salt':
      case 'ally_damage':
      case 'reveal_intents':
      case 'reveal_nodes':
        break;
    }
  }
  return out;
}
