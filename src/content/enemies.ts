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
    // Its next intent is a copy of the last card you played at it, so the fight is partly about
    // what you are willing to say in front of it.
    //
    // The blank carries more than §11 printed because the mirror now carries less. Restricting the
    // copy to outward cards (see `intentFor`) took the fight from 20 HP a visit to 5, which made
    // the softest node in the act out of one that is supposed to make you think. 7 puts it back in
    // the middle of the Debtor band, and it fires on the beats you did *not* threaten it.
    intents: [{ id: 'wraith_blank', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 7 }] }],
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
    // 40 HP behind 70% damage reduction is 133 effective HP, and 11 damage every 5 beats is
    // 2.2 a beat: elite numbers on a Debtor node. It cost 43 HP a fight and killed 1,130 runs.
    // Trimmed to a normal node's budget without touching the lesson, which is target priority.
    hp: 32,
    tier: 'normal',
    // A person under a pile of paperwork. Hitting the person is nearly pointless until
    // the paperwork is gone, which makes it a target-priority fight with a hard answer.
    intents: [{ id: 'fined_plead', weight: 6, targeting: 'opponent', effects: [{ k: 'damage', n: 11 }] }],
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
  /*
   * Kesk and Ledger. Two bodies at 2x45 HP, each swinging every 4 beats, each doubling when the
   * other dies: 3.75 damage a beat before the doubling, against a Chalk Debtor's 1.75, over a
   * fight the player needs 26 beats to finish. It won 1.6% of 5,964 attempts and killed 74% of
   * all runs between its two map slots. No arrival HP makes that arithmetic work.
   *
   * Cut as *cadence* rather than as damage: both still hit for exactly what §11 prints, they just
   * hit half as often. A bailiff should read as slow and inevitable rather than as fast, and the
   * doubling becomes the decision the pair is built around instead of a death sentence for
   * taking the first kill on offer.
   */
  enemy({
    id: 'bailiff_kesk',
    name: 'Bailiff Kesk',
    hp: 26,
    tier: 'collector',
    intents: [{ id: 'kesk_seize', weight: 8, targeting: 'opponent', effects: [{ k: 'damage', n: 9 }] }],
    mods: [{ k: 'on_ally_death_double' }],
  }),
  enemy({
    id: 'bailiff_ledger',
    name: 'Ledger',
    hp: 26,
    tier: 'collector',
    intents: [
      {
        id: 'ledger_record',
        weight: 8,
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
/*
 * Both lists still sum to exactly 24 beats. That is not decoration: it is what puts the re-ink
 * window on the same two beats of every lap, and it is the reason the fight is learnable rather
 * than lucky. Nothing below changes a weight.
 *
 * The trim is a point off each swing, two off the Seal, three off the Final Notice, and nothing at
 * all off the flurries. It is that small because the first pass measured the fight with the
 * countersign flood in place and concluded the boss needed its HP halved. It did not: it needed
 * the stamp to stop burying the player's deck (see `countersignCard`). With that fixed, 180 HP and
 * these numbers is a 42% fight costing 39 HP, which is what an Act 1 wall should be.
 */
const NOTARY_PHASE_1 = [
  { id: 'notary_stamp', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 8 }] },
  { id: 'notary_file', weight: 4, targeting: 'self', effects: [{ k: 'guard', n: 12 }] },
  {
    id: 'notary_summons',
    weight: 4,
    targeting: 'opponent',
    effects: [
      { k: 'damage', n: 6 },
      { k: 'slip', n: 3 },
    ],
  },
  { id: 'notary_endorse', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 8 }] },
  { id: 'notary_seal', weight: 6, targeting: 'opponent', effects: [{ k: 'damage', n: 12 }] },
  { id: 'notary_reink', weight: 2, targeting: 'self', effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] },
] as const;

const NOTARY_PHASE_2 = [
  { id: 'notary_strike_out', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 10 }] },
  { id: 'notary_flurry', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 6 }] },
  { id: 'notary_flurry_again', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 6 }] },
  { id: 'notary_amend', weight: 4, targeting: 'self', effects: [{ k: 'guard', n: 10 }] },
  { id: 'notary_final_notice', weight: 8, targeting: 'opponent', effects: [{ k: 'damage', n: 17 }] },
  { id: 'notary_reink_again', weight: 2, targeting: 'self', effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] },
] as const;

const BOSSES: readonly EnemyDef[] = [
  enemy({
    id: 'the_notary',
    name: 'The Notary',
    /*
     * §11's printed 180, kept.
     *
     * The proposal that came out of the first pass cut this to 100, because at 180 the fight ran
     * 30 beats and cost 42 HP against an average arrival of 35. That cut was paying for the
     * countersign flood, not for the HP: with the stamp filing every second card into the discard
     * instead of every card into the draw pile, the same 180 HP is a 48% fight that costs 36. A
     * boss should be a wall, and this one gets to stay one.
     */
    hp: 180,
    tier: 'boss',
    artKind: 'bosses',
    intents: NOTARY_PHASE_1,
    phases: [NOTARY_PHASE_2],
    mods: [
      { k: 'phase_at_hp_pct', pct: 50 },
      // Filed, not dealt, and every second card. See `countersignCard` for why the printed
      // "every card, into your draw pile" is a lockout rather than the dilemma §6 describes.
      { k: 'countersign', to: 'discard', everyNth: 2 },
      { k: 'stamp_marks', n: 1 },
    ],
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
