/**
 * The run above combat: node types, strata, the character, and the icon set.
 *
 * Phase 4 builds the map generator off this. Phase 2 encodes it because `art:check` needs
 * the node and backdrop IDs to be real, and because the node symbols are a colourblind
 * requirement rather than decoration: shape and text always carry the meaning too, so the
 * symbol lives in the data next to the name.
 */
import type { RunEconomy } from '../engine/runtypes';
import type { CharacterDef, LayerSpec, NodeDef, NodeKind, StratumDef } from './types';

/** §5.1. Symbols are load-bearing: never encode information in colour alone. */
export const NODES: readonly NodeDef[] = [
  { id: 'debtor', name: 'Debtor', symbol: '·', text: 'A normal fight.' },
  { id: 'collector', name: 'Collector', symbol: '✚', text: 'Elite. Harder, always drops a Token.' },
  { id: 'assay', name: 'Assay', symbol: '⚖', text: 'Shop. Pay in Salt, or pay in cards.' },
  { id: 'reckoning', name: 'Reckoning', symbol: '▣', text: 'Settle one card into a Mark.' },
  { id: 'wake', name: 'Wake', symbol: '▲', text: 'Rest. Heal, upgrade a card, or buy a Mark slot.' },
  { id: 'hollow', name: 'Hollow', symbol: '◇', text: 'An event.' },
  { id: 'vault', name: 'Vault', symbol: '✦', text: 'A free Token and some Salt.' },
  { id: 'boss', name: 'Stratum Boss', symbol: '✷', text: 'The end of the act.' },
];

export const NODE_IDS: readonly NodeKind[] = NODES.map((n) => n.id);

export function nodeOf(id: NodeKind): NodeDef {
  const found = NODES.find((n) => n.id === id);
  if (!found) throw new Error(`no node type called ${id}`);
  return found;
}

/**
 * Act 1's twelve layers, in order.
 *
 * A layer with one kind in it is that kind on every branch, which is how the act guarantees
 * one Assay, one Reckoning and one Wake however you walk it: nobody should be able to miss
 * Settling entirely and then wonder why the boss is impossible. A layer with several is a
 * real fork, and repeating an entry weights it.
 *
 * Layer 0 is one node on purpose. Fight one is the Chalk Debtor and the beat grid has to
 * explain itself against a single telegraphed attack, so there is nothing to choose yet.
 * Layer 11 is the Notary.
 *
 * The shape is deliberately legible in four seconds, per §2: fight, fork, shop, fork,
 * Reckoning, elite-or-fight, rest, fork, fork, elite, rest-or-shop, boss.
 */
const CHALK_WARDS_LAYERS: readonly LayerSpec[] = [
  { width: [1, 1], kinds: ['debtor'] },
  { width: [2, 2], kinds: ['debtor', 'hollow'] },
  { width: [2, 2], kinds: ['assay'] },
  { width: [2, 3], kinds: ['debtor', 'debtor', 'hollow'] },
  { width: [2, 2], kinds: ['reckoning'] },
  { width: [2, 2], kinds: ['debtor', 'collector'] },
  { width: [2, 2], kinds: ['wake'] },
  { width: [2, 3], kinds: ['debtor', 'vault', 'hollow'] },
  { width: [2, 2], kinds: ['debtor', 'hollow'] },
  { width: [1, 2], kinds: ['collector'] },
  { width: [2, 2], kinds: ['wake', 'assay'] },
  { width: [1, 1], kinds: ['boss'] },
];

/**
 * The Chalk Wards. Petty debts, dry and administrative. §5.2.
 *
 * Only Act 1 exists in the demo. Acts 2 to 4 are sketched in §14 and are explicitly out
 * of scope: they change the moment real people play this.
 */
export const STRATA: readonly StratumDef[] = [
  {
    id: 'chalk_wards',
    name: 'The Chalk Wards',
    nodes: 12,
    bossEncounterId: 'the_notary',
    backdrops: ['chalk_wards_a', 'chalk_wards_b', 'chalk_wards_c', 'chalk_wards_boss'],
    layers: CHALK_WARDS_LAYERS,
  },
];

export const CHALK_WARDS = STRATA[0] as StratumDef;

/**
 * Wick, the Ninth Tongue. §8.
 *
 * NOTE: §8's starter deck lists "1x Bald-Faced", and no card of that name exists in §9's
 * 45, in the art brief, or anywhere else. Rather than invent a 46th card (which would
 * break both the 45-card count and the 129-asset count), the slot holds Alibi: it is a
 * Lie, it is Weight 1, and it is the cheapest card that teaches Perjury, which is Wick's
 * whole signature and wants teaching in fight one. Flagged rather than fixed silently.
 */
export const WICK: CharacterDef = {
  id: 'wick',
  name: 'Wick',
  title: 'the Ninth Tongue',
  suit: 'lie',
  hp: 68,
  markSlots: 3,
  deck: [
    'paper_cut',
    'paper_cut',
    'paper_cut',
    'paper_cut',
    'flinch',
    'flinch',
    'flinch',
    'small_print',
    'second_story',
    'alibi',
  ],
  expressions: ['neutral', 'hurt', 'dying', 'win'],
};

export const CHARACTERS: readonly CharacterDef[] = [WICK];

/**
 * Keyword and UI icons, from the art brief §5.
 *
 * Solid slate, no colour, tinted in CSS at runtime. Twenty-four of them, and the list is
 * exact rather than derived: an icon is a drawing somebody has to make, so it belongs in a
 * table that both sides of the contract can read, not in a clever expression over the
 * effect vocabulary.
 */
export const ICON_IDS: readonly string[] = [
  'guard',
  'damage',
  'bleed',
  'slip',
  'haste',
  'perjury',
  'echo',
  'exhaust',
  'strain',
  'weight',
  'salt',
  'load',
  'interest',
  'compound',
  'mark_slot',
  'hp',
  'draw',
  'discard',
  'deck',
  'lap',
  'type_attack',
  'type_skill',
  'lock',
  'settle',
];

/** Valve's capsule set, §6 of the art contract. Sizes live in `art.ts`. */
export const STORE_ASSET_IDS: readonly string[] = [
  'header_capsule',
  'small_capsule',
  'main_capsule',
  'vertical_capsule',
  'library_capsule',
  'library_header',
  'library_hero',
  'library_logo',
  'client_icon',
];

export const BRAND_ASSET_IDS: readonly string[] = ['wordmark'];

/** §4.2. Interest bills you per lap for the deck you insisted on keeping. */
export const INTEREST_TABLE: readonly { readonly maxLoad: number; readonly compounds: number }[] = [
  { maxLoad: 24, compounds: 0 },
  { maxLoad: 39, compounds: 1 },
  { maxLoad: 54, compounds: 2 },
  { maxLoad: Number.POSITIVE_INFINITY, compounds: 3 },
];

/** How many Compounds a lap costs you, at a given deck Load. */
export function compoundsPerLap(deckLoad: number): number {
  for (const row of INTEREST_TABLE) {
    if (deckLoad <= row.maxLoad) return row.compounds;
  }
  return 0;
}

/** Mark slots run from 3 to 8. §4.3. */
export const MARK_SLOTS = { start: 3, max: 8 } as const;

/**
 * Prices and payouts.
 *
 * The design doc fixes two of these and is silent on the rest: Wake sells a Mark slot for 60
 * Salt (§5.1) and A Man Selling His Own Name sells one for 40 (§12). Everything else here is
 * a first pass reverse-engineered from those two, on the theory that a full act should pay
 * for roughly three purchases: about 190 Salt across twelve nodes, against a shop where the
 * interesting things cost 60 to 110. Phase 6 is where the sim argues with all of it.
 *
 * Numbers, not code, so the argument is a diff in this table.
 */
export const ECONOMY: RunEconomy = {
  saltPerDebtor: 14,
  saltPerCollector: 30,
  saltPerVault: 40,
  /** §5.1 says 30 percent. */
  wakeHealPct: 30,
  /** §5.1 says 60. */
  wakeSlotSalt: 60,
  assayCardSalt: { common: 40, uncommon: 60, rare: 95, neutral: 50, starter: 35 },
  assayTokenSalt: 105,
  assaySlotSalt: 85,
  assayRemoveSalt: 55,
  assayCards: 3,
  assayTokens: 2,
  rewardCards: 3,
  /**
   * Draft weighting. Starters are never offered: they are what you already have too many of,
   * and a reward screen that can hand you a fourth Paper Cut is a reward screen you learn to
   * skip.
   */
  draftWeights: { common: 52, uncommon: 30, rare: 8, neutral: 10 },
  /** Ten cards in, so five is already a thin deck and four is a broken one. */
  minDeckSize: 5,
  /** Paying in paper: one card covers this much Salt, rounded up, minimum one card. */
  saltPerCardPaid: 60,
};
