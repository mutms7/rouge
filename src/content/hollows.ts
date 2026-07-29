/**
 * The 8 demo Hollows, §12.
 *
 * Text follows §13: bureaucratic rather than gothic, second person, past tense, guilty,
 * under 60 words. Nobody cackles. The horror is procedural.
 *
 * Every option that is a refusal is marked as one, because refusals go into the run log
 * and Act 4's Compound is built out of it. Nothing reads that yet. Writing it now costs a
 * field; backfilling it once there are three acts is miserable.
 */
import type { HollowDef } from './types';

function hollow(def: HollowDef): HollowDef {
  return def;
}

export const HOLLOW_LIST: readonly HollowDef[] = [
  hollow({
    id: 'the_confessional_booth',
    name: 'The Confessional Booth',
    text: 'A stranger is already sitting in it when you arrive. He does not want absolution. He wants you to eat something, and he has the paperwork for it, and the paperwork is in order.',
    options: [
      {
        id: 'take_it',
        label: 'Eat it.',
        outcomes: [
          { k: 'gain_card', n: 1, pool: 'rare' },
          { k: 'add_compound', n: 2 },
        ],
      },
      { id: 'refuse', label: 'Leave him sitting there.', outcomes: [{ k: 'nothing' }], refusal: true },
    ],
  }),
  hollow({
    id: 'a_man_selling_his_own_name',
    name: 'A Man Selling His Own Name',
    text: 'He has written it on a card and he will not say it aloud. Forty Salt buys you the space it used to take up in him. Or you can take the name itself, and carry it, and be one thing lighter than you were.',
    options: [
      {
        id: 'buy_the_space',
        label: 'Pay him, and take the room he leaves.',
        requires: { salt: 40 },
        outcomes: [
          { k: 'spend_salt', n: 40 },
          { k: 'gain_mark_slot', n: 1 },
        ],
      },
      {
        id: 'take_the_name',
        label: 'Take the name instead.',
        outcomes: [
          { k: 'gain_card', n: 1, pool: 'any' },
          { k: 'lose_max_hp', n: 10 },
        ],
      },
      { id: 'refuse', label: 'He can keep it.', outcomes: [{ k: 'nothing' }], refusal: true },
    ],
  }),
  hollow({
    id: 'the_weighing_room',
    name: 'The Weighing Room',
    text: 'Scales, a chair, and a clerk who does not look up. Anything you put on the plate is struck off the register at no charge. It is also struck off permanently, and whatever it would have taught you is struck off with it.',
    options: [
      {
        id: 'weigh_one',
        label: 'Put one on the plate.',
        requires: { cards: 1 },
        outcomes: [{ k: 'remove_card', n: 1, destroysMark: true }],
      },
      { id: 'refuse', label: 'Keep everything.', outcomes: [{ k: 'nothing' }], refusal: true },
    ],
  }),
  hollow({
    id: 'chalk_children',
    name: 'Chalk Children',
    text: 'Three of them, drawn on the wall at knee height, and hungry in the way a sum is hungry. They will take whatever you have most of. They are not cruel. They are just owed.',
    options: [
      {
        id: 'feed_blood',
        label: 'Feed them.',
        outcomes: [
          { k: 'lose_hp', n: 8 },
          { k: 'gain_salt', n: 35 },
        ],
      },
      {
        id: 'feed_salt',
        label: 'Pay them.',
        requires: { salt: 30 },
        outcomes: [
          { k: 'spend_salt', n: 30 },
          { k: 'gain_card', n: 1, pool: 'any' },
        ],
      },
      {
        id: 'feed_paper',
        label: 'Give them something you were carrying.',
        requires: { cards: 1 },
        outcomes: [
          { k: 'remove_card', n: 1 },
          { k: 'gain_token', n: 1 },
        ],
      },
    ],
  }),
  hollow({
    id: 'your_own_handwriting_on_a_wall',
    name: 'Your Own Handwriting on a Wall',
    text: 'Chest height, in chalk, in your hand, and you have never been down this far. It lists what is coming. You do not remember writing it, which is not the same as not having written it.',
    options: [
      {
        id: 'read_it',
        label: 'Read it.',
        outcomes: [{ k: 'reveal_nodes', n: 3 }, { k: 'reveal_boss_intent' }],
      },
      { id: 'scrub_it', label: 'Scrub it off.', outcomes: [{ k: 'heal', n: 20 }], refusal: true },
    ],
  }),
  hollow({
    id: 'the_ink_well',
    name: 'The Ink Well',
    text: 'Sunk into the floor, lidless, and deeper than the floor is thick. Whatever you dip comes out darker and heavier and better at what it does.',
    options: [
      {
        id: 'dip_one',
        label: 'Dip a card.',
        requires: { cards: 1 },
        outcomes: [
          { k: 'upgrade_card', n: 1 },
          { k: 'add_card_load', n: 1 },
        ],
      },
      { id: 'refuse', label: 'Keep your hands dry.', outcomes: [{ k: 'nothing' }], refusal: true },
    ],
  }),
  hollow({
    id: 'a_door_that_has_been_opened_before',
    name: 'A Door That Has Been Opened Before',
    text: 'The hinges are clean. There is a small object on the floor just inside, placed rather than dropped. Somebody came down here, took the trouble to leave you this, and went further in.',
    options: [
      {
        id: 'take_it',
        label: 'Pick it up.',
        outcomes: [
          { k: 'gain_token', n: 1 },
          { k: 'compound_phase', n: 1 },
        ],
      },
      { id: 'refuse', label: 'Close the door.', outcomes: [{ k: 'nothing' }], refusal: true },
    ],
  }),
  hollow({
    id: 'nothing_here',
    name: 'Nothing Here',
    // §12: "There is nothing here. (Act 4 disagrees.)" It stays empty, and the run log
    // records that you walked through it, which is the entire joke and the entire setup.
    text: 'There is nothing here.',
    options: [{ id: 'move_on', label: 'Move on.', outcomes: [{ k: 'nothing' }] }],
  }),
];

export const HOLLOWS: Readonly<Record<string, HollowDef>> = Object.fromEntries(HOLLOW_LIST.map((h) => [h.id, h]));

export const HOLLOW_IDS: readonly string[] = HOLLOW_LIST.map((h) => h.id);

export function hollowOf(id: string): HollowDef {
  const found = HOLLOWS[id];
  if (!found) throw new Error(`no Hollow called ${id}`);
  return found;
}
