/**
 * The Marks, §4.3 and §9.
 *
 * One per settleable card, and the text is the one thing in the game that is written by
 * hand rather than generated. A Mark is a reward, and a reward should read like somebody
 * chose the words.
 *
 * You start with three slots and can reach eight, so this list is a bidding war over a
 * small board rather than a shopping list. That is the whole point of Settling: every
 * card gets two lives, and a mediocre card worth drafting for what it deletes into makes
 * the draft genuinely hard instead of "is the number big".
 */
import type { MarkDef } from './types';

function mark(def: MarkDef): MarkDef {
  return def;
}

export const MARKS: Readonly<Record<string, MarkDef>> = {
  whetted: mark({
    id: 'whetted',
    name: 'Whetted',
    text: 'All attacks deal +1.',
    mods: [{ k: 'attack_damage', n: 1 }],
  }),
  braced: mark({
    id: 'braced',
    name: 'Braced',
    text: 'Start each combat with Guard 4.',
    mods: [{ k: 'on_combat_start', effects: [{ k: 'guard', n: 4 }] }],
  }),
  fine_print: mark({
    id: 'fine_print',
    name: 'Fine Print',
    text: 'The first enemy action each lap is Slipped 1.',
    mods: [{ k: 'lap_first_enemy_slip', n: 1 }],
  }),
  wellread: mark({
    id: 'wellread',
    name: 'Wellread',
    text: '+1 hand cap. Draw 1 extra at combat start.',
    mods: [
      { k: 'hand_cap', n: 1 },
      { k: 'combat_start_draw', n: 1 },
    ],
  }),
  corroborated: mark({
    id: 'corroborated',
    name: 'Corroborated',
    text: 'The first Guard you gain each lap does not decay for 4 beats.',
    mods: [{ k: 'lap_first_guard_frozen', n: 4 }],
  }),
  light_fingers: mark({
    id: 'light_fingers',
    name: 'Light Fingers',
    text: 'Gain 3 extra Salt per combat won.',
    mods: [{ k: 'salt_per_win', n: 3 }],
  }),
  loose_weave: mark({
    id: 'loose_weave',
    name: 'Loose Weave',
    text: 'Once per lap your next card costs 1 less Weight.',
    mods: [{ k: 'lap_discount', n: 1 }],
  }),
  tell: mark({
    id: 'tell',
    name: 'Tell',
    text: 'All enemy intents are visible one lap further ahead.',
    mods: [{ k: 'intent_horizon', n: 24 }],
  }),
  faithless: mark({
    id: 'faithless',
    name: 'Faithless',
    text: 'When you discard a card, deal 2 to a random enemy.',
    mods: [{ k: 'on_discard', effects: [{ k: 'damage_random', n: 2 }] }],
  }),
  cutpurse: mark({
    id: 'cutpurse',
    name: 'Cutpurse',
    text: 'Killing an enemy Hastes you 3.',
    mods: [{ k: 'on_kill', effects: [{ k: 'haste', n: 3 }] }],
  }),
  windbag: mark({
    id: 'windbag',
    name: 'Windbag',
    text: 'Draw 1 extra at the start of each lap.',
    mods: [{ k: 'lap_draw', n: 1 }],
  }),
  bookkeeper: mark({
    id: 'bookkeeper',
    name: 'Bookkeeper',
    text: 'Assay prices reduced 20%.',
    mods: [{ k: 'assay_discount_pct', n: 20 }],
  }),
  silvertongue: mark({
    id: 'silvertongue',
    name: 'Silvertongue',
    text: 'The first card you play each lap gains Echo.',
    mods: [{ k: 'lap_nth_card', n: 1, boon: { echo: true } }],
  }),
  sworn_falsely: mark({
    id: 'sworn_falsely',
    name: 'Sworn Falsely',
    text: 'Perjury effects resolve 2 beats sooner.',
    mods: [{ k: 'perjury_sooner', n: 2 }],
  }),
  patience: mark({
    id: 'patience',
    name: 'Patience',
    text: 'Resolved Perjury effects deal +50%.',
    mods: [{ k: 'perjury_damage_pct', n: 50 }],
  }),
  doubled: mark({
    id: 'doubled',
    name: 'Doubled',
    text: 'Second hits deal +2.',
    mods: [{ k: 'second_hit_damage', n: 2 }],
  }),
  bond: mark({
    id: 'bond',
    name: 'Bond',
    text: 'Guard cards give +2 Guard. You take 1 damage per lap.',
    mods: [
      { k: 'guard_gain', n: 2 },
      { k: 'on_lap_end', effects: [{ k: 'self_damage', n: 1 }] },
    ],
  }),
  weighted_purse: mark({
    id: 'weighted_purse',
    name: 'Weighted Purse',
    text: '+1 damage per 25 Salt held, max +4.',
    mods: [{ k: 'attack_damage_per', n: 1, per: 'salt', divide: 25, max: 4 }],
  }),
  unsaid: mark({
    id: 'unsaid',
    name: 'Unsaid',
    text: 'Once per combat, return a played card to hand free.',
    mods: [{ k: 'once_per_combat', effects: [{ k: 'return_last', weight: 0 }] }],
  }),
  bought_time: mark({
    id: 'bought_time',
    name: 'Bought Time',
    text: 'All Slip effects +1 beat.',
    mods: [{ k: 'slip_bonus', n: 1 }],
  }),
  consumptive: mark({
    id: 'consumptive',
    name: 'Consumptive',
    text: 'All Bleed you apply +2.',
    mods: [{ k: 'bleed_bonus', n: 2 }],
  }),
  quickstep: mark({
    id: 'quickstep',
    name: 'Quickstep',
    text: 'All Haste effects +1 beat.',
    mods: [{ k: 'haste_bonus', n: 1 }],
  }),
  stillness: mark({
    id: 'stillness',
    name: 'Stillness',
    text: 'If you play no card for 6 consecutive beats, gain Guard 8.',
    mods: [{ k: 'idle_guard', beats: 6, n: 8 }],
  }),
  cooked_books: mark({
    id: 'cooked_books',
    name: 'Cooked Books',
    text: 'Interest generates 1 fewer Compound per lap.',
    mods: [{ k: 'interest_compounds', n: -1 }],
  }),
  threefold: mark({
    id: 'threefold',
    name: 'Threefold',
    text: 'Perjury effects trigger twice at half value.',
    mods: [{ k: 'perjury_split' }],
  }),
  accounted: mark({
    id: 'accounted',
    name: 'Accounted',
    text: 'Start each combat with 4 random cards already in your discard.',
    mods: [{ k: 'on_combat_start', effects: [{ k: 'seed_discard', n: 4 }] }],
  }),
  blank_page: mark({
    id: 'blank_page',
    name: 'Blank Page',
    text: 'Once per combat your next 2 cards cost 0 Weight.',
    mods: [{ k: 'once_per_combat', effects: [{ k: 'empower_next', n: 2, boon: { weight: 0 } }] }],
  }),
  usury: mark({
    id: 'usury',
    name: 'Usury',
    text: 'Gain 15 Salt per lap. Interest is +1 Compound.',
    mods: [
      { k: 'salt_per_lap', n: 15 },
      { k: 'interest_compounds', n: 1 },
    ],
  }),
  scarred: mark({
    id: 'scarred',
    name: 'Scarred',
    text: '+1 damage per 6 HP missing.',
    mods: [{ k: 'attack_damage_per', n: 1, per: 'missing_hp', divide: 6 }],
  }),
  absolved: mark({
    id: 'absolved',
    name: 'Absolved',
    text: 'Compounds may be played as: Exhaust, gain Guard 3.',
    mods: [{ k: 'compound_playable_as', effects: [{ k: 'guard', n: 3 }, { k: 'exhaust' }] }],
  }),
  provisioned: mark({
    id: 'provisioned',
    name: 'Provisioned',
    text: 'Heal 4 after each combat.',
    mods: [{ k: 'on_combat_won', effects: [{ k: 'heal', n: 4 }] }],
  }),
  leverage: mark({
    id: 'leverage',
    name: 'Leverage',
    text: 'Attacks ignore 3 Guard.',
    mods: [{ k: 'pierce', n: 3 }],
  }),
  lantern: mark({
    id: 'lantern',
    name: 'Lantern',
    text: 'The whole map layer is revealed.',
    mods: [{ k: 'reveal_map_layer' }],
  }),
  drawn_line: mark({
    id: 'drawn_line',
    name: 'Drawn Line',
    text: 'Guard decays 1 slower.',
    mods: [{ k: 'guard_decay', n: 1 }],
  }),
  deadman: mark({
    id: 'deadman',
    name: 'Deadman',
    text: 'Once per run, survive lethal at 1 HP.',
    mods: [{ k: 'survive_lethal_run', hp: 1 }],
  }),
  familiar: mark({
    id: 'familiar',
    name: 'Familiar',
    text: 'Compounds cost 0 Weight to discard.',
    mods: [{ k: 'compound_discard_free' }],
  }),
  grasping: mark({
    id: 'grasping',
    name: 'Grasping',
    text: '+2 hand cap.',
    mods: [{ k: 'hand_cap', n: 2 }],
  }),
  mimic: mark({
    id: 'mimic',
    name: 'Mimic',
    text: "Start combat with a copy of the enemy's opening intent.",
    mods: [{ k: 'on_combat_start', effects: [{ k: 'copy_intent', weight: 2 }] }],
  }),
};

export const MARK_IDS = Object.keys(MARKS);

export function markOf(id: string): MarkDef {
  const found = MARKS[id];
  if (!found) throw new Error(`no Mark called ${id}`);
  return found;
}
