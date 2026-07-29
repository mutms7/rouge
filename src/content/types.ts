/**
 * The card face, and everything else the run needs to know about.
 *
 * `engine/types.ts` owns the shapes the Tally reads. This file sits on top of them and
 * adds what the engine has no business knowing: suits, rarity, the Mark a card Settles
 * into, rules text, and the whole layer above combat.
 *
 * The dependency arrow points inward. `content/` may import `engine/`; the reverse is a
 * lint error, because the engine defines the vocabulary and content fills it in.
 */
import type { CardDef, Effect, IntentDef, Mod } from '../engine/types';
import type { Suit } from './palette';

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'neutral' | 'compound';

/**
 * A passive on your character sheet, bought by deleting the card that printed it.
 *
 * Marks are why the deck arc runs backwards from the genre norm: you finish with a
 * smaller deck and a bigger sheet. §4.3.
 */
export type MarkDef = {
  readonly id: string;
  readonly name: string;
  /** Written by hand. Mark text is the reward, so it does not get generated. */
  readonly text: string;
  readonly mods: readonly Mod[];
};

export type Card = CardDef & {
  readonly suit: Suit;
  readonly rarity: Rarity;
  /** What it Settles into. Compounds have none: junk buys you nothing. */
  readonly mark: MarkDef | null;
  /**
   * Hand-written rules text, for the handful of cards where the generated line reads
   * badly. Everything else renders from `effects`.
   */
  readonly textOverride?: string;
  readonly flavour?: string;
};

/**
 * Collateral. Fictionally these are objects taken off people, which is why they are all
 * small and sad. Mechanically they are Marks you did not have to pay a card for.
 */
export type TokenDef = {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly mods: readonly Mod[];
};

export type EnemyTier = 'normal' | 'collector' | 'boss';

/**
 * One body.
 *
 * A body is not a fight: The Owed is one definition that shows up twice, Marginalia three
 * times, and Fined arrives with its paperwork. `EncounterDef` is what stands on the floor.
 * The art contract addresses art by content ID, so one body means one PNG however many
 * of it a fight puts in front of you.
 */
export type EnemyDef = {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly tier: EnemyTier;
  readonly intents: readonly IntentDef[];
  /** Later phases. `phases[0]` is phase 2. Only the Notary has any. */
  readonly phases?: readonly (readonly IntentDef[])[];
  readonly mods?: readonly Mod[];
  /** Bosses live in `art/bosses/` as `<id>_p<n>.png`, not in `art/enemies/`. */
  readonly artKind?: 'enemies' | 'bosses';
};

/** One body on the floor, at a starting position, partway through its cycle. */
export type EncounterMember = {
  readonly defId: string;
  /** Unique within the encounter. Two of The Owed cannot both be `the_owed`. */
  readonly id: string;
  readonly startBeat?: number;
  readonly intentOffset?: number;
};

export type EncounterDef = {
  readonly id: string;
  readonly name: string;
  readonly tier: EnemyTier;
  readonly members: readonly EncounterMember[];
};

/**
 * What a Hollow can do to you. The run layer's vocabulary, separate from `Effect`.
 *
 * An `Effect` happens inside a combat and knows about beats. These happen between fights
 * and know about decks, Salt and the map. Keeping them apart means neither union has to
 * carry cases the other one can never resolve.
 */
export type RunEffect =
  | { readonly k: 'gain_card'; readonly n: number; readonly pool: 'any' | 'rare' }
  | { readonly k: 'remove_card'; readonly n: number; readonly destroysMark?: boolean }
  | { readonly k: 'upgrade_card'; readonly n: number }
  | { readonly k: 'add_card_load'; readonly n: number }
  | { readonly k: 'gain_token'; readonly n: number }
  | { readonly k: 'gain_salt'; readonly n: number }
  | { readonly k: 'spend_salt'; readonly n: number }
  | { readonly k: 'gain_mark_slot'; readonly n: number }
  | { readonly k: 'lose_hp'; readonly n: number }
  | { readonly k: 'lose_max_hp'; readonly n: number }
  | { readonly k: 'heal'; readonly n: number }
  | { readonly k: 'add_compound'; readonly n: number }
  | { readonly k: 'reveal_nodes'; readonly n: number }
  | { readonly k: 'reveal_boss_intent' }
  /** A Door That Has Been Opened Before. Act 4 collects on this. */
  | { readonly k: 'compound_phase'; readonly n: number }
  | { readonly k: 'nothing' };

export type RunEffectKind = RunEffect['k'];

export type HollowOption = {
  readonly id: string;
  readonly label: string;
  readonly outcomes: readonly RunEffect[];
  /** Salt or cards the option needs before it can be taken. */
  readonly requires?: { readonly salt?: number; readonly cards?: number };
  /**
   * Walking away. Refusals go in the run log, per §12: the Compound remembers.
   */
  readonly refusal?: true;
};

export type HollowDef = {
  readonly id: string;
  readonly name: string;
  /** Second person, past tense, guilty. Under 60 words. §13. */
  readonly text: string;
  readonly options: readonly HollowOption[];
};

/** §5.1. The symbol carries the meaning alongside the icon, never colour alone. */
export type NodeKind = 'debtor' | 'collector' | 'assay' | 'reckoning' | 'wake' | 'hollow' | 'vault' | 'boss';

export type NodeDef = {
  readonly id: NodeKind;
  readonly name: string;
  readonly symbol: string;
  readonly text: string;
};

export type StratumDef = {
  readonly id: string;
  readonly name: string;
  readonly nodes: number;
  readonly bossEncounterId: string;
  /** `art/backdrops/<id>.png`. The last one is the boss room. */
  readonly backdrops: readonly string[];
};

export type CharacterDef = {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly suit: Suit;
  readonly hp: number;
  readonly markSlots: number;
  /** Card ids, with repeats. 10 cards. §8. */
  readonly deck: readonly string[];
  /** `art/portraits/<id>_<expr>.png`. */
  readonly expressions: readonly string[];
};

/** A card's Load, which Interest bills you for. Usually its Weight. §4.1. */
export function loadOf(card: Card): number {
  return card.load ?? card.weight;
}

/** Every effect atom a card reaches for, perjuries and conditionals unwrapped. */
export function effectsDeep(effects: readonly Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const effect of effects) {
    out.push(effect);
    if ('effects' in effect) out.push(...effectsDeep(effect.effects));
  }
  return out;
}

/** Every effect atom a mod reaches for. Same trick, one level up. */
export function modEffects(mods: readonly Mod[]): Effect[] {
  const out: Effect[] = [];
  for (const mod of mods) {
    if ('effects' in mod) out.push(...effectsDeep(mod.effects));
  }
  return out;
}
