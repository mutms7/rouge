/**
 * The other half of `mods.ts`: the passives that only make sense between fights.
 *
 * Two aggregators rather than one because the two questions are asked at different times by
 * different code. The Tally wants "how much extra damage do attacks do" on every hit;
 * the run wants "what does a Mark slot cost me" once, at a shop. Keeping them apart means
 * neither `Passives` nor `RunPassives` carries a field its reader can never use, and the
 * exhaustive switch in each one makes forgetting to decide a type error.
 *
 * `vocabulary.ts` is the index of which is which.
 */
import type { Mod } from './types';
import type { RunTrigger } from './runtypes';

export type RunPassives = {
  readonly markSlots: number;
  /** Borrowed Coat. Every card in the deck is heavier to carry. §4.1. */
  readonly cardLoad: number;
  readonly interestCompounds: number;
  /** Beats per Interest cycle, relative to the 24-beat lap. Interest Table is +6. */
  readonly interestPeriod: number;
  readonly assayDiscountPct: number;
  /** Counterfeit Sixpence: one purchase in six silently fails. 0 means never. */
  readonly purchaseFailsOneIn: number;
  readonly saltPerWin: number;
  readonly onSettle: readonly RunTrigger[];
  readonly onCombatWon: readonly RunTrigger[];
  readonly onCollectorWon: readonly RunTrigger[];
  /** The Rope You Kept, Deadman. HP you come back at, or 0 for no ward. */
  readonly surviveLethalHp: number;
  readonly revealMapLayer: boolean;
  readonly revealEliteIntents: boolean;
  readonly compoundPhases: number;
  /** Phase 5 reads these. Aggregated now so nothing has to walk the list twice. */
  readonly firstCompoundBecomes: readonly string[];
  readonly compoundDiscardFree: boolean;
};

const EMPTY: RunPassives = {
  markSlots: 0,
  cardLoad: 0,
  interestCompounds: 0,
  interestPeriod: 0,
  assayDiscountPct: 0,
  purchaseFailsOneIn: 0,
  saltPerWin: 0,
  onSettle: [],
  onCombatWon: [],
  onCollectorWon: [],
  surviveLethalHp: 0,
  revealMapLayer: false,
  revealEliteIntents: false,
  compoundPhases: 0,
  firstCompoundBecomes: [],
  compoundDiscardFree: false,
};

export function noRunPassives(): RunPassives {
  return EMPTY;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Bucket = Mutable<{
  [K in keyof RunPassives]: RunPassives[K] extends readonly (infer T)[] ? T[] : RunPassives[K];
}>;

export function collectRunMods(mods: readonly Mod[]): RunPassives {
  if (mods.length === 0) return EMPTY;

  const p: Bucket = {
    ...EMPTY,
    onSettle: [],
    onCombatWon: [],
    onCollectorWon: [],
    firstCompoundBecomes: [],
  };

  for (const [index, mod] of mods.entries()) {
    const key = `${mod.k}#${String(index)}`;
    switch (mod.k) {
      case 'mark_slots':
        p.markSlots += mod.n;
        break;
      case 'card_load':
        p.cardLoad += mod.n;
        break;
      case 'interest_compounds':
        p.interestCompounds += mod.n;
        break;
      case 'interest_period':
        p.interestPeriod += mod.n;
        break;
      case 'assay_discount_pct':
        p.assayDiscountPct += mod.n;
        break;
      case 'purchase_fails_one_in':
        // The stingiest one wins. Two of these is not a thing in the demo, and stacking
        // "one in six" with "one in ten" into "one in sixteen" would be a buff.
        p.purchaseFailsOneIn = p.purchaseFailsOneIn === 0 ? mod.n : Math.min(p.purchaseFailsOneIn, mod.n);
        break;
      case 'salt_per_win':
        p.saltPerWin += mod.n;
        break;
      case 'on_settle':
        p.onSettle.push({ key, effects: mod.effects });
        break;
      case 'on_combat_won':
        p.onCombatWon.push({ key, effects: mod.effects });
        break;
      case 'on_collector_won':
        p.onCollectorWon.push({ key, effects: mod.effects });
        break;
      case 'survive_lethal_run':
        p.surviveLethalHp = Math.max(p.surviveLethalHp, mod.hp);
        break;
      case 'reveal_map_layer':
        p.revealMapLayer = true;
        break;
      case 'reveal_elite_intents':
        p.revealEliteIntents = true;
        break;
      case 'compound_phase':
        p.compoundPhases += mod.n;
        break;
      case 'first_compound_becomes':
        p.firstCompoundBecomes.push(mod.cardId);
        break;
      case 'compound_discard_free':
        p.compoundDiscardFree = true;
        break;

      // Everything the Tally owns. `mods.ts` aggregates these; the run does not read them
      // and the exhaustive switch is what stops one going missing on both sides.
      case 'attack_damage':
      case 'attack_damage_per':
      case 'first_attack_damage':
      case 'second_hit_damage':
      case 'guard_gain':
      case 'guard_decay':
      case 'slip_bonus':
      case 'haste_bonus':
      case 'bleed_bonus':
      case 'pierce':
      case 'hand_cap':
      case 'max_hp':
      case 'combat_start_draw':
      case 'lap_draw':
      case 'perjury_sooner':
      case 'perjury_damage_pct':
      case 'perjury_split':
      case 'enemies_start_slipped':
      case 'guard_no_decay_first_lap':
      case 'lap_first_guard_frozen':
      case 'lap_first_enemy_slip':
      case 'lap_discount':
      case 'lap_nth_card':
      case 'idle_guard':
      case 'intent_horizon':
      case 'on_combat_start':
      case 'on_lap_start':
      case 'on_lap_end':
      case 'on_kill':
      case 'on_discard':
      case 'on_draw':
      case 'below_hp_pct':
      case 'once_per_combat':
      case 'in_hand_no_guard':
      case 'in_hand_lap_end':
      case 'mirror_last_card':
      case 'punish_heavy':
      case 'shielded_by':
      case 'on_ally_death_double':
      case 'salt_hoard_decay':
      case 'phase_at_hp_pct':
      case 'countersign':
      case 'stamp_marks':
      case 'salt_per_lap':
      case 'compound_playable_as':
      case 'replicates':
      case 'irremovable':
        break;
    }
  }

  return p;
}
