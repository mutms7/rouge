/**
 * The vocabulary, catalogued.
 *
 * Two registries: every effect atom and every mod kind, each tagged with where it lives
 * and whether the Tally resolves it today. This exists for three reasons and all three
 * are worth the file:
 *
 * 1. Content validation can reject an atom that does not exist instead of shipping a
 *    card that silently does nothing.
 * 2. Rules-text generation and the sim can both ask "is this thing live?" rather than
 *    guessing from behaviour.
 * 3. It puts the phase boundary in code. A `run` atom is not unfinished, it is encoded
 *    now so phases 4 and 5 have something to read, and `combat.test.ts` asserts that
 *    everything marked `combat` actually has a handler. The alternative is a prose
 *    promise in a commit message that nobody checks.
 */
import type { EffectKind, ModKind } from './types';

/**
 * `combat` means the Tally resolves it. `run` means the layer above combat owns it, and
 * it is a no-op inside a fight by design, not by omission.
 */
export type Scope = 'combat' | 'run';

export type VocabEntry = {
  readonly scope: Scope;
  /** Live in the reducer today. False means a later phase wires it up. */
  readonly live: boolean;
  /** Which phase owns it, for the ones that are not live yet. */
  readonly owner?: string;
};

export const EFFECT_VOCAB: Readonly<Record<EffectKind, VocabEntry>> = {
  damage: { scope: 'combat', live: true },
  damage_per: { scope: 'combat', live: true },
  damage_random: { scope: 'combat', live: true },
  self_damage: { scope: 'combat', live: true },
  guard: { scope: 'combat', live: true },
  heal: { scope: 'combat', live: true },
  draw: { scope: 'combat', live: true },
  discard: { scope: 'combat', live: true },
  slip: { scope: 'combat', live: true },
  haste: { scope: 'combat', live: true },
  enemy_haste: { scope: 'combat', live: true },
  bleed: { scope: 'combat', live: true },
  strain: { scope: 'combat', live: true },
  echo: { scope: 'combat', live: true },
  exhaust: { scope: 'combat', live: true },
  perjury: { scope: 'combat', live: true },
  next_action: { scope: 'combat', live: true },
  next_lap: { scope: 'combat', live: true },
  on_kill: { scope: 'combat', live: true },
  salt: { scope: 'combat', live: true },
  spend_salt: { scope: 'combat', live: true },
  steal_guard: { scope: 'combat', live: true },
  reveal_intents: { scope: 'combat', live: true },
  empower_next: { scope: 'combat', live: true },
  lap_boon: { scope: 'combat', live: true },
  return_last: { scope: 'combat', live: true },
  copy_intent: { scope: 'combat', live: true },
  remove_compound: { scope: 'combat', live: true },
  purge_compounds: { scope: 'combat', live: true },
  add_compound: { scope: 'combat', live: true },
  seed_discard: { scope: 'combat', live: true },
  survive_lethal: { scope: 'combat', live: true },
  vulnerable: { scope: 'combat', live: true },
  steal_salt: { scope: 'combat', live: true },
  ally_damage: { scope: 'combat', live: true },
  /** Lamp Oil looks at the map, which combat cannot see. */
  reveal_nodes: { scope: 'run', live: false, owner: 'phase 4, the map' },
};

export const MOD_VOCAB: Readonly<Record<ModKind, VocabEntry>> = {
  // Flat numbers the Tally reads as it works.
  attack_damage: { scope: 'combat', live: true },
  attack_damage_per: { scope: 'combat', live: true },
  first_attack_damage: { scope: 'combat', live: true },
  second_hit_damage: { scope: 'combat', live: true },
  guard_gain: { scope: 'combat', live: true },
  guard_decay: { scope: 'combat', live: true },
  slip_bonus: { scope: 'combat', live: true },
  haste_bonus: { scope: 'combat', live: true },
  bleed_bonus: { scope: 'combat', live: true },
  pierce: { scope: 'combat', live: true },
  hand_cap: { scope: 'combat', live: true },
  max_hp: { scope: 'combat', live: true },
  combat_start_draw: { scope: 'combat', live: true },
  lap_draw: { scope: 'combat', live: true },
  perjury_sooner: { scope: 'combat', live: true },
  perjury_damage_pct: { scope: 'combat', live: true },
  enemies_start_slipped: { scope: 'combat', live: true },
  guard_no_decay_first_lap: { scope: 'combat', live: true },
  lap_first_guard_frozen: { scope: 'combat', live: true },
  lap_first_enemy_slip: { scope: 'combat', live: true },
  lap_discount: { scope: 'combat', live: true },
  lap_nth_card: { scope: 'combat', live: true },
  idle_guard: { scope: 'combat', live: true },
  intent_horizon: { scope: 'combat', live: true },

  // Triggers.
  on_combat_start: { scope: 'combat', live: true },
  on_lap_start: { scope: 'combat', live: true },
  on_lap_end: { scope: 'combat', live: true },
  on_kill: { scope: 'combat', live: true },
  on_discard: { scope: 'combat', live: true },
  on_draw: { scope: 'combat', live: true },
  below_hp_pct: { scope: 'combat', live: true },
  /**
   * Unsaid and Blank Page are both "once per combat, when you decide". They need a
   * button, so they wait for the phase that has buttons rather than firing on their own
   * at a beat the player did not pick.
   */
  once_per_combat: { scope: 'combat', live: false, owner: 'phase 3, activated abilities' },

  // Cards being unpleasant from inside your hand.
  in_hand_no_guard: { scope: 'combat', live: true },
  in_hand_lap_end: { scope: 'combat', live: true },

  // Enemy traits.
  mirror_last_card: { scope: 'combat', live: true },
  punish_heavy: { scope: 'combat', live: true },
  shielded_by: { scope: 'combat', live: true },
  on_ally_death_double: { scope: 'combat', live: true },
  salt_hoard_decay: { scope: 'combat', live: true },
  phase_at_hp_pct: { scope: 'combat', live: true },
  countersign: { scope: 'combat', live: false, owner: 'phase 5, the Notary' },
  stamp_marks: { scope: 'combat', live: false, owner: 'phase 5, the Notary' },

  // Threefold rewrites how a perjury resolves rather than scaling it, so it waits for
  // the Marks to actually be grantable.
  perjury_split: { scope: 'combat', live: false, owner: 'phase 4, Settling' },

  // The run above combat.
  mark_slots: { scope: 'run', live: false, owner: 'phase 4, Reckoning' },
  card_load: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  interest_compounds: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  interest_period: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  assay_discount_pct: { scope: 'run', live: false, owner: 'phase 4, the Assay' },
  purchase_fails_one_in: { scope: 'run', live: false, owner: 'phase 4, the Assay' },
  salt_per_win: { scope: 'run', live: false, owner: 'phase 4, the run' },
  salt_per_lap: { scope: 'run', live: false, owner: 'phase 4, the run' },
  on_settle: { scope: 'run', live: false, owner: 'phase 4, Reckoning' },
  on_combat_won: { scope: 'run', live: false, owner: 'phase 4, the run' },
  on_collector_won: { scope: 'run', live: false, owner: 'phase 4, the run' },
  survive_lethal_run: { scope: 'run', live: false, owner: 'phase 4, the run' },
  reveal_map_layer: { scope: 'run', live: false, owner: 'phase 4, the map' },
  reveal_elite_intents: { scope: 'run', live: false, owner: 'phase 4, the map' },
  first_compound_becomes: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  compound_playable_as: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  compound_discard_free: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  replicates: { scope: 'run', live: false, owner: 'phase 5, Interest' },
  irremovable: { scope: 'run', live: false, owner: 'phase 4, Reckoning' },
  compound_phase: { scope: 'run', live: false, owner: 'milestone E, the Inversion' },
};

export const EFFECT_KINDS = Object.keys(EFFECT_VOCAB) as readonly EffectKind[];
export const MOD_KINDS = Object.keys(MOD_VOCAB) as readonly ModKind[];

export function isEffectKind(value: string): value is EffectKind {
  return Object.hasOwn(EFFECT_VOCAB, value);
}

export function isModKind(value: string): value is ModKind {
  return Object.hasOwn(MOD_VOCAB, value);
}

/** Everything the Tally does not resolve yet, so the sim can say so out loud. */
export function dormantKinds(): { effects: EffectKind[]; mods: ModKind[] } {
  return {
    effects: EFFECT_KINDS.filter((k) => !EFFECT_VOCAB[k].live),
    mods: MOD_KINDS.filter((k) => !MOD_VOCAB[k].live),
  };
}
