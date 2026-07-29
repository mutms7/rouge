/**
 * All 45 demo cards, §9.
 *
 * Effects are data, not functions. Every one of these is a list of typed atoms from
 * `engine/types.ts`, which is what lets the sim reason about a card without playing it,
 * lets the UI generate its own rules text, and gives localization something to hang off.
 * If a card ever wants a bespoke function, the vocabulary is missing an atom: add the
 * atom.
 *
 * The numbers here are the design doc's first pass, transcribed rather than tuned. The
 * sim harness is what argues with them, and `npm run sim` prints the argument.
 *
 * Card ids match `docs/prompts/CODEX_ART_PROMPT.md` exactly, because the art contract
 * addresses art by content ID and a typo means a permanent placeholder nobody notices.
 */
import { markOf } from './marks';
import type { Card } from './types';

function card(def: Card): Card {
  return def;
}

/** Compounds all weigh 2 Load whatever their Weight, per §4.1. */
const COMPOUND_LOAD = 2;

// ---------------------------------------------------------------------------
// Wick, common (12)
// ---------------------------------------------------------------------------

const COMMON: readonly Card[] = [
  card({
    id: 'paper_cut',
    name: 'Paper Cut',
    suit: 'lie',
    rarity: 'common',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 5 }],
    mark: markOf('whetted'),
    // §13: foreshadow the sibling with absences, never explanation. Wick's oldest card,
    // and the handwriting on it is not his.
    flavour: 'The hand that wrote this was smaller than yours.',
  }),
  card({
    id: 'flinch',
    name: 'Flinch',
    suit: 'lie',
    rarity: 'common',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 5 }],
    mark: markOf('braced'),
  }),
  card({
    id: 'small_print',
    name: 'Small Print',
    suit: 'lie',
    rarity: 'common',
    weight: 2,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 4 },
      { k: 'slip', n: 2 },
    ],
    mark: markOf('fine_print'),
  }),
  card({
    id: 'second_story',
    name: 'Second Story',
    suit: 'lie',
    rarity: 'common',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'draw', n: 2 }],
    mark: markOf('wellread'),
  }),
  card({
    id: 'alibi',
    name: 'Alibi',
    suit: 'lie',
    rarity: 'common',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [
      { k: 'guard', n: 3 },
      { k: 'perjury', in: 4, effects: [{ k: 'guard', n: 6 }] },
    ],
    mark: markOf('corroborated'),
  }),
  card({
    id: 'sleight',
    name: 'Sleight',
    suit: 'theft',
    rarity: 'common',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 3 },
      { k: 'salt', n: 2 },
    ],
    mark: markOf('light_fingers'),
  }),
  card({
    id: 'slip_the_knot',
    name: 'Slip the Knot',
    suit: 'lie',
    rarity: 'common',
    weight: 0,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'strain', n: 2 },
      { k: 'haste', n: 3 },
    ],
    mark: markOf('loose_weave'),
  }),
  card({
    id: 'cold_read',
    name: 'Cold Read',
    suit: 'lie',
    rarity: 'common',
    weight: 1,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'reveal_intents', n: 2 },
      { k: 'draw', n: 1 },
    ],
    mark: markOf('tell'),
  }),
  card({
    id: 'bad_faith',
    name: 'Bad Faith',
    suit: 'oath',
    rarity: 'common',
    weight: 2,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 7 },
      { k: 'discard', n: 1 },
    ],
    mark: markOf('faithless'),
  }),
  card({
    id: 'nick',
    name: 'Nick',
    suit: 'theft',
    rarity: 'common',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 4 },
      { k: 'on_kill', effects: [{ k: 'haste', n: 4 }] },
    ],
    mark: markOf('cutpurse'),
    textOverride: 'Deal 4. If this kills, Haste 4.',
  }),
  card({
    id: 'winded_excuse',
    name: 'Winded Excuse',
    suit: 'lie',
    rarity: 'common',
    weight: 2,
    type: 'skill',
    targeting: 'self',
    effects: [
      { k: 'guard', n: 4 },
      { k: 'draw', n: 1 },
    ],
    mark: markOf('windbag'),
  }),
  card({
    id: 'tally_mark',
    name: 'Tally Mark',
    suit: 'theft',
    rarity: 'common',
    weight: 1,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'salt', n: 4 }, { k: 'exhaust' }],
    mark: markOf('bookkeeper'),
  }),
];

// ---------------------------------------------------------------------------
// Wick, uncommon (12)
// ---------------------------------------------------------------------------

const UNCOMMON: readonly Card[] = [
  card({
    id: 'ninth_tongue',
    name: 'Ninth Tongue',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 3,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 6 }, { k: 'echo' }],
    mark: markOf('silvertongue'),
  }),
  card({
    id: 'perjure',
    name: 'Perjure',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 0,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'strain', n: 3 },
      { k: 'empower_next', n: 1, boon: { weight: 0, perjuryIn: 6 }, untilLapEnd: true },
    ],
    mark: markOf('sworn_falsely'),
    textOverride: 'Strain 3. Your next card this lap gains Perjury 6 and costs 0 Weight.',
  }),
  card({
    id: 'long_con',
    name: 'Long Con',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 2,
    type: 'skill',
    targeting: 'opponent',
    effects: [{ k: 'perjury', in: 12, effects: [{ k: 'damage', n: 30 }] }],
    mark: markOf('patience'),
  }),
  card({
    id: 'two_truths',
    name: 'Two Truths',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 2,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 6 },
      { k: 'next_action', effects: [{ k: 'damage', n: 6 }] },
    ],
    mark: markOf('doubled'),
    textOverride: 'Deal 6. Deal 6 again at the start of your next action.',
  }),
  card({
    id: 'debt_of_honour',
    name: 'Debt of Honour',
    suit: 'oath',
    rarity: 'uncommon',
    weight: 3,
    type: 'skill',
    targeting: 'self',
    effects: [
      { k: 'guard', n: 12 },
      { k: 'next_lap', effects: [{ k: 'self_damage', n: 6 }] },
    ],
    mark: markOf('bond'),
    textOverride: 'Guard 12. Next lap, take 6 damage.',
  }),
  card({
    id: 'sixpence_trick',
    name: 'Sixpence Trick',
    suit: 'theft',
    rarity: 'uncommon',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 5 },
      { k: 'steal_guard', n: 1, per: 'salt', divide: 5, max: 5 },
    ],
    mark: markOf('weighted_purse'),
  }),
  card({
    id: 'recant',
    name: 'Recant',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 1,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'strain', n: 2 },
      { k: 'return_last', weight: 0 },
    ],
    mark: markOf('unsaid'),
  }),
  card({
    id: 'hush_money',
    name: 'Hush Money',
    suit: 'theft',
    rarity: 'uncommon',
    weight: 2,
    type: 'skill',
    targeting: 'opponent',
    effects: [{ k: 'spend_salt', n: 10, effects: [{ k: 'slip', n: 6 }] }],
    mark: markOf('bought_time'),
  }),
  card({
    id: 'grifters_cough',
    name: "Grifter's Cough",
    suit: 'grief',
    rarity: 'uncommon',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 3 },
      { k: 'bleed', n: 4 },
    ],
    mark: markOf('consumptive'),
  }),
  card({
    id: 'doubling_back',
    name: 'Doubling Back',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'strain', n: 1 },
      { k: 'haste', n: 5 },
      { k: 'draw', n: 1 },
    ],
    mark: markOf('quickstep'),
  }),
  card({
    id: 'the_long_silence',
    name: 'The Long Silence',
    suit: 'grief',
    rarity: 'uncommon',
    weight: 4,
    type: 'skill',
    targeting: 'all_opponents',
    effects: [
      { k: 'guard', n: 16 },
      { k: 'slip', n: 3 },
    ],
    mark: markOf('stillness'),
    textOverride: 'Guard 16. All enemies Slip 3.',
  }),
  card({
    id: 'false_ledger',
    name: 'False Ledger',
    suit: 'lie',
    rarity: 'uncommon',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'remove_compound', n: 1 },
      { k: 'draw', n: 1 },
    ],
    mark: markOf('cooked_books'),
  }),
];

// ---------------------------------------------------------------------------
// Wick, rare (6)
// ---------------------------------------------------------------------------

const RARE: readonly Card[] = [
  card({
    id: 'the_ninth_lie',
    name: 'The Ninth Lie',
    suit: 'lie',
    rarity: 'rare',
    weight: 3,
    type: 'attack',
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 10 },
      { k: 'perjury', in: 8, effects: [{ k: 'damage', n: 10 }] },
      { k: 'perjury', in: 16, effects: [{ k: 'damage', n: 10 }] },
    ],
    mark: markOf('threefold'),
  }),
  card({
    id: 'everything_i_told_you',
    name: 'Everything I Told You',
    suit: 'lie',
    rarity: 'rare',
    weight: 5,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage_per', n: 4, per: 'discard' }, { k: 'exhaust' }],
    mark: markOf('accounted'),
  }),
  card({
    id: 'unwritten',
    name: 'Unwritten',
    suit: 'lie',
    rarity: 'rare',
    weight: 0,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'strain', n: 5 }, { k: 'lap_boon', boon: { weight: 0 } }, { k: 'exhaust' }],
    mark: markOf('blank_page'),
    textOverride: 'Strain 5. This lap your cards cost 0 Weight. Exhaust.',
  }),
  card({
    id: 'collectors_interest',
    name: "Collector's Interest",
    suit: 'theft',
    rarity: 'rare',
    weight: 3,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'salt', n: 25 },
      { k: 'add_compound', n: 2, to: 'draw' },
    ],
    mark: markOf('usury'),
  }),
  card({
    id: 'the_face_you_made',
    name: 'The Face You Made',
    suit: 'grief',
    rarity: 'rare',
    weight: 3,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage_per', n: 1, per: 'missing_hp', divide: 3 }],
    mark: markOf('scarred'),
    textOverride: 'Deal damage equal to one third of your missing HP.',
  }),
  card({
    id: 'nothing_owed',
    name: 'Nothing Owed',
    suit: 'oath',
    rarity: 'rare',
    weight: 4,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'purge_compounds', guardPer: 5 }],
    mark: markOf('absolved'),
  }),
];

// ---------------------------------------------------------------------------
// Neutral (8)
// ---------------------------------------------------------------------------

const NEUTRAL: readonly Card[] = [
  card({
    id: 'salt_ration',
    name: 'Salt Ration',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'heal', n: 6 }, { k: 'exhaust' }],
    mark: markOf('provisioned'),
  }),
  card({
    id: 'pry_bar',
    name: 'Pry Bar',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 2,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 8, pierce: true }],
    mark: markOf('leverage'),
  }),
  card({
    id: 'lamp_oil',
    name: 'Lamp Oil',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 1,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'reveal_nodes', n: 2 },
      { k: 'draw', n: 1 },
    ],
    mark: markOf('lantern'),
  }),
  card({
    id: 'chalk_line',
    name: 'Chalk Line',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 4, frozenFor: 3 }],
    mark: markOf('drawn_line'),
  }),
  card({
    id: 'dead_mans_switch',
    name: "Dead Man's Switch",
    suit: 'neutral',
    rarity: 'neutral',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'survive_lethal', heal: 15 }],
    mark: markOf('deadman'),
  }),
  card({
    id: 'common_debt',
    name: 'Common Debt',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 4 }],
    weightScale: { per: 'compounds_in_discard', n: -1 },
    mark: markOf('familiar'),
    textOverride: 'Deal 4. Costs 1 less Weight per Compound in your discard.',
  }),
  card({
    id: 'hand_over_fist',
    name: 'Hand Over Fist',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 3,
    type: 'skill',
    targeting: 'none',
    effects: [
      { k: 'strain', n: 3 },
      { k: 'draw', n: 4 },
    ],
    mark: markOf('grasping'),
  }),
  card({
    id: 'witness',
    name: 'Witness',
    suit: 'neutral',
    rarity: 'neutral',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'copy_intent', weight: 2 }],
    mark: markOf('mimic'),
  }),
];

// ---------------------------------------------------------------------------
// Compound (7). Generated by Interest, never drafted.
// ---------------------------------------------------------------------------

const COMPOUND: readonly Card[] = [
  card({
    id: 'arrears',
    name: 'Arrears',
    suit: 'compound',
    rarity: 'compound',
    weight: 1,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mark: null,
    textOverride: 'Unplayable. It just sits there.',
  }),
  card({
    id: 'accrual',
    name: 'Accrual',
    suit: 'compound',
    rarity: 'compound',
    weight: 1,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mods: [{ k: 'on_draw', effects: [{ k: 'self_damage', n: 2 }] }],
    mark: null,
    textOverride: 'Unplayable. Take 2 damage when drawn.',
  }),
  card({
    id: 'foreclosure',
    name: 'Foreclosure',
    suit: 'compound',
    rarity: 'compound',
    weight: 0,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mods: [{ k: 'in_hand_lap_end', effects: [{ k: 'enemy_haste', n: 1 }] }],
    mark: null,
    textOverride: 'Unplayable. While in hand, enemies Haste 1 per lap.',
  }),
  card({
    id: 'chalk_dust',
    name: 'Chalk Dust',
    suit: 'compound',
    rarity: 'compound',
    weight: 2,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'exhaust' }],
    mark: null,
    textOverride: 'Do nothing. Exhaust.',
  }),
  card({
    id: 'interest_owed',
    name: 'Interest Owed',
    suit: 'compound',
    rarity: 'compound',
    weight: 1,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mods: [{ k: 'replicates', cardId: 'interest_owed' }],
    mark: null,
    textOverride: 'Unplayable. At end of combat, add another Interest Owed to your deck.',
  }),
  card({
    id: 'the_notarys_countersign',
    name: "The Notary's Countersign",
    suit: 'compound',
    rarity: 'compound',
    weight: 1,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mods: [{ k: 'irremovable' }],
    mark: null,
    textOverride: 'Unplayable. Cannot be removed at Reckoning nodes.',
  }),
  card({
    id: 'grief_unpaid',
    name: 'Grief, Unpaid',
    suit: 'compound',
    rarity: 'compound',
    weight: 0,
    load: COMPOUND_LOAD,
    type: 'skill',
    targeting: 'none',
    playable: false,
    effects: [],
    mods: [{ k: 'in_hand_no_guard' }],
    mark: null,
    textOverride: 'Unplayable. While in hand, you cannot gain Guard.',
  }),
];

export const CARD_LIST: readonly Card[] = [...COMMON, ...UNCOMMON, ...RARE, ...NEUTRAL, ...COMPOUND];

export const CARDS: Readonly<Record<string, Card>> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export const CARD_IDS: readonly string[] = CARD_LIST.map((c) => c.id);

/** Everything Interest can hand you. Never drafted. */
export const COMPOUND_IDS: readonly string[] = COMPOUND.map((c) => c.id);

/** Everything a reward screen, shop or Hollow may offer. §9 minus the Compounds. */
export const DRAFTABLE_IDS: readonly string[] = CARD_LIST.filter((c) => c.rarity !== 'compound').map((c) => c.id);

export function cardOf(id: string): Card {
  const found = CARDS[id];
  if (!found) throw new Error(`no card called ${id}`);
  return found;
}
