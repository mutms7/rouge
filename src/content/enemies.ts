/**
 * The Act 1 bestiary, §11.
 *
 * Intents are pinned to beats, not to turns, which changes how these are designed. An
 * enemy is a *cadence* plus a payload: the interesting number is damage per beat, and the
 * interesting decision is where in the 24 its actions land. So each list below sums to
 * something the player can learn, and the ones that teach a specific lesson (the track
 * moves, Guard should be late, target priority) do it with rhythm rather than with text.
 *
 * A body is not a fight. `the_owed` is one definition that stands twice, `marginalia`
 * three times, and `fined` arrives with its paperwork, which is why `ENCOUNTERS` is a
 * separate table. One body, one PNG, however many of it a fight puts in front of you.
 *
 * HP is from the design doc. Everything else is a first pass for the sim to argue with.
 */
import type { EncounterDef, EnemyDef } from './types';

function enemy(def: EnemyDef): EnemyDef {
  return def;
}

// ---------------------------------------------------------------------------
// Normal (8 fights, 9 bodies)
// ---------------------------------------------------------------------------

const NORMAL: readonly EnemyDef[] = [
  enemy({
    id: 'chalk_debtor',
    name: 'Chalk Debtor',
    hp: 24,
    tier: 'normal',
    // One attack, one cadence, nothing hidden. The tutorial body: fight one exists so
    // the beat grid can explain itself without a wall of text.
    intents: [{ id: 'chalk_debtor_settle', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 7 }] }],
  }),
  enemy({
    id: 'tallymans_apprentice',
    name: "Tallyman's Apprentice",
    hp: 30,
    tier: 'normal',
    // Teaches that the track can be moved, by moving yours. A Slip on the player is the
    // cheapest possible demonstration that position is a resource.
    intents: [
      { id: 'apprentice_tally', weight: 3, targeting: 'opponent', effects: [{ k: 'slip', n: 3 }] },
      { id: 'apprentice_strike', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 6 }] },
    ],
  }),
  enemy({
    id: 'dust_clerk',
    name: 'Dust Clerk',
    hp: 34,
    tier: 'normal',
    // Teaches burst timing. The Guard goes up on a fixed rhythm, so the answer is to hit
    // in the window after it decays rather than to hit harder.
    intents: [
      { id: 'dust_clerk_file', weight: 3, targeting: 'self', effects: [{ k: 'guard', n: 8 }] },
      { id: 'dust_clerk_stamp', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 8 }] },
    ],
  }),
  enemy({
    id: 'the_owed',
    name: 'The Owed',
    hp: 18,
    tier: 'normal',
    // Teaches target priority. Two of them alternate, so whichever one you leave alive
    // spends its next action making the other worse.
    intents: [
      { id: 'owed_urge', weight: 3, targeting: 'none', effects: [{ k: 'ally_damage', n: 3 }] },
      { id: 'owed_grasp', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 5 }] },
    ],
  }),
  enemy({
    id: 'marginalia',
    name: 'Marginalia',
    hp: 9,
    tier: 'normal',
    // Three of these on consecutive beats flood the track: small numbers, no gaps, and
    // suddenly Guard that decays 1 per beat is worth much less than it looks.
    intents: [{ id: 'marginalia_scratch', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 3 }] }],
  }),
  enemy({
    id: 'receipt_wraith',
    name: 'Receipt Wraith',
    hp: 30,
    tier: 'normal',
    // Its next intent is a copy of the last card you played, so the fight is partly about
    // what you are willing to say in front of it.
    intents: [{ id: 'wraith_blank', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 4 }] }],
    mods: [{ k: 'mirror_last_card' }],
  }),
  enemy({
    id: 'chalk_hound',
    name: 'Chalk Hound',
    hp: 20,
    tier: 'normal',
    // Acts every 3 beats and punishes heavy cards specifically: the Weight 5 nuke is a
    // gamble here in two directions at once.
    intents: [{ id: 'chalk_hound_snap', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 5 }] }],
    mods: [{ k: 'punish_heavy', minWeight: 3, n: 4 }],
  }),
  enemy({
    id: 'fined',
    name: 'Fined',
    hp: 40,
    tier: 'normal',
    // A person under a pile of paperwork. Hitting the person is nearly pointless until
    // the paperwork is gone, which makes it a target-priority fight with a hard answer.
    intents: [{ id: 'fined_plead', weight: 5, targeting: 'opponent', effects: [{ k: 'damage', n: 11 }] }],
    mods: [{ k: 'shielded_by', allyId: 'fined_paperwork', pct: 70 }],
  }),
  enemy({
    id: 'fined_paperwork',
    name: 'The Paperwork',
    hp: 12,
    tier: 'normal',
    intents: [{ id: 'paperwork_settle', weight: 6, targeting: 'opponent', effects: [{ k: 'damage', n: 3 }] }],
  }),
];

// ---------------------------------------------------------------------------
// Collectors (2 fights, 3 bodies)
// ---------------------------------------------------------------------------

const COLLECTORS: readonly EnemyDef[] = [
  enemy({
    id: 'bailiff_kesk',
    name: 'Bailiff Kesk',
    hp: 45,
    tier: 'collector',
    intents: [{ id: 'kesk_seize', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 9 }] }],
    mods: [{ k: 'on_ally_death_double' }],
  }),
  enemy({
    id: 'bailiff_ledger',
    name: 'Ledger',
    hp: 45,
    tier: 'collector',
    intents: [
      {
        id: 'ledger_record',
        weight: 4,
        targeting: 'opponent',
        effects: [
          { k: 'damage', n: 6 },
          { k: 'slip', n: 2 },
        ],
      },
    ],
    mods: [{ k: 'on_ally_death_double' }],
  }),
  enemy({
    id: 'the_tithe_wolf',
    name: 'The Tithe-Wolf',
    hp: 70,
    tier: 'collector',
    // Steals Salt on every hit. The Salt is recoverable from its corpse, but one stack
    // digests per lap, so a slow win costs you money as well as HP.
    intents: [
      {
        id: 'tithe_wolf_bite',
        weight: 3,
        targeting: 'opponent',
        effects: [
          { k: 'damage', n: 8 },
          { k: 'steal_salt', n: 5 },
        ],
      },
      { id: 'tithe_wolf_circle', weight: 2, targeting: 'self', effects: [{ k: 'guard', n: 6 }] },
    ],
    mods: [{ k: 'salt_hoard_decay', n: 1 }],
  }),
];

// ---------------------------------------------------------------------------
// Boss
// ---------------------------------------------------------------------------

/**
 * The Notary. A clerk with too many arms and one stamp. Not evil. Employed.
 *
 * Both intent lists sum to exactly 24 beats, which is the whole design of the fight: the
 * re-ink window lands on the same two beats of every lap, so the rhythm is learnable
 * rather than lucky. Damage in that window is tripled. It is a rhythm fight wearing a
 * value fight's coat.
 *
 * The countersign and the Mark-stamping are encoded as mods and wired up in phase 5,
 * which is where the design doc puts them. The re-ink window is live now because it is
 * one atom and the sim should be able to see it.
 */
const NOTARY_PHASE_1 = [
  { id: 'notary_stamp', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 9 }] },
  { id: 'notary_file', weight: 4, targeting: 'self', effects: [{ k: 'guard', n: 12 }] },
  {
    id: 'notary_summons',
    weight: 4,
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 7 },
      { k: 'slip', n: 3 },
    ],
  },
  { id: 'notary_endorse', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 9 }] },
  { id: 'notary_seal', weight: 6, targeting: 'opponent', effects: [{ k: 'damage', n: 14 }] },
  { id: 'notary_reink', weight: 2, targeting: 'self', effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] },
] as const;

const NOTARY_PHASE_2 = [
  { id: 'notary_strike_out', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 11 }] },
  { id: 'notary_flurry', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 6 }] },
  { id: 'notary_flurry_again', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 6 }] },
  { id: 'notary_amend', weight: 4, targeting: 'self', effects: [{ k: 'guard', n: 10 }] },
  { id: 'notary_final_notice', weight: 8, targeting: 'opponent', effects: [{ k: 'damage', n: 20 }] },
  { id: 'notary_reink_again', weight: 2, targeting: 'self', effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] },
] as const;

const BOSSES: readonly EnemyDef[] = [
  enemy({
    id: 'the_notary',
    name: 'The Notary',
    hp: 180,
    tier: 'boss',
    artKind: 'bosses',
    intents: NOTARY_PHASE_1,
    phases: [NOTARY_PHASE_2],
    mods: [{ k: 'phase_at_hp_pct', pct: 50 }, { k: 'countersign' }, { k: 'stamp_marks', n: 1 }],
  }),
];

export const ENEMY_LIST: readonly EnemyDef[] = [...NORMAL, ...COLLECTORS, ...BOSSES];

export const ENEMIES: Readonly<Record<string, EnemyDef>> = Object.fromEntries(ENEMY_LIST.map((e) => [e.id, e]));

export const ENEMY_IDS: readonly string[] = ENEMY_LIST.map((e) => e.id);

export function enemyOf(id: string): EnemyDef {
  const found = ENEMIES[id];
  if (!found) throw new Error(`no enemy called ${id}`);
  return found;
}

/**
 * The 11 fights of §11.
 *
 * Marginalia start on beats 0, 1 and 2, so they act on consecutive beats and genuinely
 * flood the track rather than just being three of a thing. The two Owed are offset one
 * intent apart, so at any moment one is buffing and one is hitting.
 */
export const ENCOUNTERS: readonly EncounterDef[] = [
  {
    id: 'chalk_debtor',
    name: 'Chalk Debtor',
    tier: 'normal',
    members: [{ defId: 'chalk_debtor', id: 'chalk_debtor' }],
  },
  {
    id: 'tallymans_apprentice',
    name: "Tallyman's Apprentice",
    tier: 'normal',
    members: [{ defId: 'tallymans_apprentice', id: 'tallymans_apprentice' }],
  },
  {
    id: 'dust_clerk',
    name: 'Dust Clerk',
    tier: 'normal',
    members: [{ defId: 'dust_clerk', id: 'dust_clerk' }],
  },
  {
    id: 'the_owed',
    name: 'The Owed',
    tier: 'normal',
    members: [
      { defId: 'the_owed', id: 'the_owed_a' },
      { defId: 'the_owed', id: 'the_owed_b', intentOffset: 1 },
    ],
  },
  {
    id: 'marginalia',
    name: 'Marginalia',
    tier: 'normal',
    members: [
      { defId: 'marginalia', id: 'marginalia_a', startBeat: 0 },
      { defId: 'marginalia', id: 'marginalia_b', startBeat: 1 },
      { defId: 'marginalia', id: 'marginalia_c', startBeat: 2 },
    ],
  },
  {
    id: 'receipt_wraith',
    name: 'Receipt Wraith',
    tier: 'normal',
    members: [{ defId: 'receipt_wraith', id: 'receipt_wraith' }],
  },
  {
    id: 'chalk_hound',
    name: 'Chalk Hound',
    tier: 'normal',
    members: [{ defId: 'chalk_hound', id: 'chalk_hound' }],
  },
  {
    id: 'fined',
    name: 'Fined',
    tier: 'normal',
    members: [
      { defId: 'fined', id: 'fined' },
      { defId: 'fined_paperwork', id: 'fined_paperwork', startBeat: 2 },
    ],
  },
  {
    id: 'bailiff_kesk_and_ledger',
    name: 'Bailiff Kesk & Ledger',
    tier: 'collector',
    members: [
      { defId: 'bailiff_kesk', id: 'bailiff_kesk' },
      { defId: 'bailiff_ledger', id: 'bailiff_ledger', startBeat: 2 },
    ],
  },
  {
    id: 'the_tithe_wolf',
    name: 'The Tithe-Wolf',
    tier: 'collector',
    members: [{ defId: 'the_tithe_wolf', id: 'the_tithe_wolf' }],
  },
  {
    id: 'the_notary',
    name: 'The Notary',
    tier: 'boss',
    members: [{ defId: 'the_notary', id: 'the_notary' }],
  },
];

export const ENCOUNTER_IDS: readonly string[] = ENCOUNTERS.map((e) => e.id);

export function encounterOf(id: string): EncounterDef {
  const found = ENCOUNTERS.find((e) => e.id === id);
  if (!found) throw new Error(`no encounter called ${id}`);
  return found;
}
