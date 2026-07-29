/**
 * The 20 demo Tokens, §10.
 *
 * Relics. Fictionally objects taken as collateral, which is why every one of them is
 * small and sad. Mechanically they are the same shape as a Mark, a list of `Mod`s, which
 * means the engine has one passive pipeline rather than two and a Token can never do
 * something a Mark structurally cannot.
 *
 * Ids match the art brief exactly. Punctuation is dropped, not replaced: "A Child's
 * Tooth" is `a_childs_tooth`.
 */
import type { TokenDef } from './types';

function token(def: TokenDef): TokenDef {
  return def;
}

export const TOKEN_LIST: readonly TokenDef[] = [
  token({
    id: 'a_childs_tooth',
    name: "A Child's Tooth",
    text: 'First attack each combat deals +4.',
    mods: [{ k: 'first_attack_damage', n: 4 }],
  }),
  token({
    id: 'nine_feet_of_rope',
    name: 'Nine Feet of Rope',
    text: 'Slip and Haste effects +1 beat.',
    mods: [
      { k: 'slip_bonus', n: 1 },
      { k: 'haste_bonus', n: 1 },
    ],
  }),
  token({
    id: 'someone_elses_wedding_band',
    name: "Someone Else's Wedding Band",
    text: 'Heal 6 whenever you Settle a card.',
    mods: [{ k: 'on_settle', effects: [{ k: 'heal', n: 6 }] }],
  }),
  token({
    id: 'a_jar_of_teeth',
    name: 'A Jar of Teeth',
    text: 'All Bleed +1.',
    mods: [{ k: 'bleed_bonus', n: 1 }],
  }),
  token({
    id: 'unsent_letter',
    name: 'Unsent Letter',
    text: 'Draw 1 extra at combat start.',
    mods: [{ k: 'combat_start_draw', n: 1 }],
  }),
  token({
    id: 'salt_rimed_spectacles',
    name: 'Salt-Rimed Spectacles',
    text: 'See enemy intents one lap further.',
    mods: [{ k: 'intent_horizon', n: 24 }],
  }),
  token({
    id: 'the_notarys_nib',
    name: "The Notary's Nib",
    text: 'The first Compound generated each combat becomes a Salt Ration instead.',
    mods: [{ k: 'first_compound_becomes', cardId: 'salt_ration' }],
  }),
  token({
    id: 'a_widows_thimble',
    name: "A Widow's Thimble",
    text: 'Guard does not decay during the first lap.',
    mods: [{ k: 'guard_no_decay_first_lap' }],
  }),
  token({
    id: 'half_a_locket',
    name: 'Half a Locket',
    text: 'Below 30% HP, gain Guard 20. Once per combat.',
    mods: [{ k: 'below_hp_pct', pct: 30, effects: [{ k: 'guard', n: 20 }] }],
  }),
  token({
    id: 'counterfeit_sixpence',
    name: 'Counterfeit Sixpence',
    text: 'Assay prices reduced 25%. One purchase in six silently fails.',
    mods: [
      { k: 'assay_discount_pct', n: 25 },
      { k: 'purchase_fails_one_in', n: 6 },
    ],
  }),
  token({
    id: 'ledger_bone',
    name: 'Ledger Bone',
    text: '+1 Mark slot.',
    mods: [{ k: 'mark_slots', n: 1 }],
  }),
  token({
    id: 'grave_dirt_in_a_handkerchief',
    name: 'Grave Dirt in a Handkerchief',
    text: 'Heal 8 after each Collector.',
    mods: [{ k: 'on_collector_won', effects: [{ k: 'heal', n: 8 }] }],
  }),
  token({
    id: 'a_debt_collectors_whistle',
    name: "A Debt Collector's Whistle",
    text: 'Enemies start combat Slipped 3.',
    mods: [{ k: 'enemies_start_slipped', n: 3 }],
  }),
  token({
    id: 'milk_tooth_necklace',
    name: 'Milk Tooth Necklace',
    text: 'Every third card each lap costs 0 Weight.',
    mods: [{ k: 'lap_nth_card', n: 3, boon: { weight: 0 }, repeating: true }],
  }),
  token({
    id: 'the_rope_you_kept',
    name: 'The Rope You Kept',
    text: 'Survive lethal once per run at 1 HP.',
    mods: [{ k: 'survive_lethal_run', hp: 1 }],
  }),
  token({
    id: 'a_bad_photograph',
    name: 'A Bad Photograph',
    text: 'See the full intent list of Collectors and bosses at combat start.',
    mods: [{ k: 'reveal_elite_intents' }],
  }),
  token({
    id: 'chalk_stub',
    name: 'Chalk Stub',
    text: 'The first card each lap gains Echo.',
    mods: [{ k: 'lap_nth_card', n: 1, boon: { echo: true } }],
  }),
  token({
    id: 'interest_table',
    name: 'Interest Table',
    text: 'Interest fires every 30 beats instead of 24.',
    mods: [{ k: 'interest_period', n: 30 }],
  }),
  token({
    id: 'borrowed_coat',
    name: 'Borrowed Coat',
    text: '+15 max HP. +1 Load on every card in your deck.',
    mods: [
      { k: 'max_hp', n: 15 },
      { k: 'card_load', n: 1 },
    ],
  }),
  token({
    id: 'your_own_handwriting',
    name: 'Your Own Handwriting',
    text: 'Settling a card also grants 10 Salt and heals 5.',
    mods: [
      {
        k: 'on_settle',
        effects: [
          { k: 'salt', n: 10 },
          { k: 'heal', n: 5 },
        ],
      },
    ],
  }),
];

export const TOKENS: Readonly<Record<string, TokenDef>> = Object.fromEntries(TOKEN_LIST.map((t) => [t.id, t]));

export const TOKEN_IDS: readonly string[] = TOKEN_LIST.map((t) => t.id);

export function tokenOf(id: string): TokenDef {
  const found = TOKENS[id];
  if (!found) throw new Error(`no Token called ${id}`);
  return found;
}
