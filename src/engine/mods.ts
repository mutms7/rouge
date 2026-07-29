/**
 * Passives, flattened.
 *
 * A Mark, a Token and an enemy trait are the same shape: a list of `Mod`s. Aggregating
 * them once per read means the rest of the engine asks "how much extra damage do attacks
 * do" instead of walking a list and switching on kinds in six places.
 *
 * Stacking is additive everywhere, deliberately. Two Marks that each give +1 attack give
 * +2, and there is no multiplicative interaction anywhere in the demo. That is a balance
 * decision as much as a code one: multiplicative passives are where deckbuilders go to
 * die, and the sim can only reason about numbers it can add.
 *
 * Triggered mods keep a stable `key` built from their kind and their index in the list,
 * so a once-per-combat mod can be spent without needing an identity of its own.
 */
import type { CardBoon, Countable, Effect, Mod } from './types';

export type ScaledBonus = {
  readonly n: number;
  readonly per: Countable;
  readonly divide: number;
  readonly max?: number;
};

export type NthCardBoon = {
  readonly n: number;
  readonly boon: CardBoon;
  readonly repeating: boolean;
};

export type KeyedEffects = {
  /** Stable within a combat: `<kind>#<index in the mod list>`. */
  readonly key: string;
  readonly effects: readonly Effect[];
};

export type HpTrigger = KeyedEffects & { readonly pct: number };

export type Passives = {
  readonly attackDamage: number;
  readonly attackDamagePer: readonly ScaledBonus[];
  readonly firstAttackDamage: number;
  readonly secondHitDamage: number;
  readonly guardGain: number;
  /** Beats per beat that Guard does *not* melt. Drawn Line is 1. */
  readonly guardDecaySlower: number;
  readonly slipBonus: number;
  readonly hasteBonus: number;
  readonly bleedBonus: number;
  readonly pierce: number;
  readonly handCap: number;
  readonly maxHp: number;
  readonly combatStartDraw: number;
  readonly lapDraw: number;
  readonly perjurySooner: number;
  readonly perjuryDamagePct: number;
  /** Threefold: a sworn thing resolves twice, at half value each. */
  readonly perjurySplit: boolean;
  /** Usury. Lap income, so it belongs to the Tally even though the Salt outlives it. */
  readonly saltPerLap: number;
  readonly enemiesStartSlipped: number;
  readonly guardNoDecayFirstLap: boolean;
  readonly lapFirstGuardFrozen: number;
  readonly lapFirstEnemySlip: number;
  readonly lapDiscount: number;
  readonly lapNthCard: readonly NthCardBoon[];
  readonly idleGuard: readonly { readonly beats: number; readonly n: number }[];
  readonly intentHorizon: number;
  /** Phase-five economy and Compound hooks read in-combat. */
  readonly cardLoad: number;
  readonly interestCompounds: number;
  readonly interestPeriod: number;
  readonly firstCompoundBecomes: readonly string[];
  readonly compoundPlayableAs: readonly Effect[];
  readonly compoundDiscardFree: boolean;
  readonly countersign: boolean;
  readonly stampMarks: number;

  readonly onCombatStart: readonly KeyedEffects[];
  readonly onLapStart: readonly KeyedEffects[];
  readonly onLapEnd: readonly KeyedEffects[];
  readonly onKill: readonly KeyedEffects[];
  readonly onDiscard: readonly KeyedEffects[];
  readonly onDraw: readonly KeyedEffects[];
  readonly belowHpPct: readonly HpTrigger[];
  readonly oncePerCombat: readonly KeyedEffects[];

  readonly inHandNoGuard: boolean;
  readonly inHandLapEnd: readonly KeyedEffects[];

  readonly mirrorLastCard: boolean;
  readonly punishHeavy: readonly { readonly minWeight: number; readonly n: number }[];
  readonly shieldedBy: readonly { readonly allyId: string; readonly pct: number }[];
  readonly doublesOnAllyDeath: boolean;
  readonly saltHoardDecay: number;
  readonly phaseAtHpPct: readonly number[];
};

const EMPTY: Passives = {
  attackDamage: 0,
  attackDamagePer: [],
  firstAttackDamage: 0,
  secondHitDamage: 0,
  guardGain: 0,
  guardDecaySlower: 0,
  slipBonus: 0,
  hasteBonus: 0,
  bleedBonus: 0,
  pierce: 0,
  handCap: 0,
  maxHp: 0,
  combatStartDraw: 0,
  lapDraw: 0,
  perjurySooner: 0,
  perjuryDamagePct: 0,
  perjurySplit: false,
  saltPerLap: 0,
  enemiesStartSlipped: 0,
  guardNoDecayFirstLap: false,
  lapFirstGuardFrozen: 0,
  lapFirstEnemySlip: 0,
  lapDiscount: 0,
  lapNthCard: [],
  idleGuard: [],
  intentHorizon: 0,
  cardLoad: 0,
  interestCompounds: 0,
  interestPeriod: 0,
  firstCompoundBecomes: [],
  compoundPlayableAs: [],
  compoundDiscardFree: false,
  countersign: false,
  stampMarks: 0,
  onCombatStart: [],
  onLapStart: [],
  onLapEnd: [],
  onKill: [],
  onDiscard: [],
  onDraw: [],
  belowHpPct: [],
  oncePerCombat: [],
  inHandNoGuard: false,
  inHandLapEnd: [],
  mirrorLastCard: false,
  punishHeavy: [],
  shieldedBy: [],
  doublesOnAllyDeath: false,
  saltHoardDecay: 0,
  phaseAtHpPct: [],
};

export function noPassives(): Passives {
  return EMPTY;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Bucket = Mutable<{
  [K in keyof Passives]: Passives[K] extends readonly (infer T)[] ? T[] : Passives[K];
}>;

/**
 * Roll a list of mods into one aggregate.
 *
 * Unknown kinds are impossible: the union is exhaustive and the switch has no default,
 * so adding a `Mod` variant without deciding what it aggregates into is a type error.
 */
export function collectMods(mods: readonly Mod[]): Passives {
  if (mods.length === 0) return EMPTY;

  const p: Bucket = {
    ...EMPTY,
    attackDamagePer: [],
    firstCompoundBecomes: [],
    compoundPlayableAs: [],
    lapNthCard: [],
    idleGuard: [],
    onCombatStart: [],
    onLapStart: [],
    onLapEnd: [],
    onKill: [],
    onDiscard: [],
    onDraw: [],
    belowHpPct: [],
    oncePerCombat: [],
    inHandLapEnd: [],
    punishHeavy: [],
    shieldedBy: [],
    phaseAtHpPct: [],
  };

  for (const [index, mod] of mods.entries()) {
    const key = `${mod.k}#${String(index)}`;
    switch (mod.k) {
      case 'attack_damage':
        p.attackDamage += mod.n;
        break;
      case 'attack_damage_per':
        p.attackDamagePer.push({ n: mod.n, per: mod.per, divide: mod.divide, ...(mod.max === undefined ? {} : { max: mod.max }) });
        break;
      case 'first_attack_damage':
        p.firstAttackDamage += mod.n;
        break;
      case 'second_hit_damage':
        p.secondHitDamage += mod.n;
        break;
      case 'guard_gain':
        p.guardGain += mod.n;
        break;
      case 'guard_decay':
        p.guardDecaySlower += mod.n;
        break;
      case 'slip_bonus':
        p.slipBonus += mod.n;
        break;
      case 'haste_bonus':
        p.hasteBonus += mod.n;
        break;
      case 'bleed_bonus':
        p.bleedBonus += mod.n;
        break;
      case 'pierce':
        p.pierce += mod.n;
        break;
      case 'hand_cap':
        p.handCap += mod.n;
        break;
      case 'max_hp':
        p.maxHp += mod.n;
        break;
      case 'combat_start_draw':
        p.combatStartDraw += mod.n;
        break;
      case 'lap_draw':
        p.lapDraw += mod.n;
        break;
      case 'perjury_sooner':
        p.perjurySooner += mod.n;
        break;
      case 'perjury_damage_pct':
        p.perjuryDamagePct += mod.n;
        break;
      case 'perjury_split':
        p.perjurySplit = true;
        break;
      case 'salt_per_lap':
        p.saltPerLap += mod.n;
        break;
      case 'enemies_start_slipped':
        p.enemiesStartSlipped += mod.n;
        break;
      case 'guard_no_decay_first_lap':
        p.guardNoDecayFirstLap = true;
        break;
      case 'lap_first_guard_frozen':
        p.lapFirstGuardFrozen = Math.max(p.lapFirstGuardFrozen, mod.n);
        break;
      case 'lap_first_enemy_slip':
        p.lapFirstEnemySlip += mod.n;
        break;
      case 'lap_discount':
        p.lapDiscount += mod.n;
        break;
      case 'lap_nth_card':
        p.lapNthCard.push({ n: mod.n, boon: mod.boon, repeating: mod.repeating ?? false });
        break;
      case 'idle_guard':
        p.idleGuard.push({ beats: mod.beats, n: mod.n });
        break;
      case 'intent_horizon':
        p.intentHorizon += mod.n;
        break;
      case 'card_load':
        p.cardLoad += mod.n;
        break;
      case 'interest_compounds':
        p.interestCompounds += mod.n;
        break;
      case 'interest_period':
        p.interestPeriod = Math.max(p.interestPeriod, mod.n);
        break;
      case 'first_compound_becomes':
        p.firstCompoundBecomes.push(mod.cardId);
        break;
      case 'compound_playable_as':
        p.compoundPlayableAs.push(...mod.effects);
        break;
      case 'compound_discard_free':
        p.compoundDiscardFree = true;
        break;

      case 'on_combat_start':
        p.onCombatStart.push({ key, effects: mod.effects });
        break;
      case 'on_lap_start':
        p.onLapStart.push({ key, effects: mod.effects });
        break;
      case 'on_lap_end':
        p.onLapEnd.push({ key, effects: mod.effects });
        break;
      case 'on_kill':
        p.onKill.push({ key, effects: mod.effects });
        break;
      case 'on_discard':
        p.onDiscard.push({ key, effects: mod.effects });
        break;
      case 'on_draw':
        p.onDraw.push({ key, effects: mod.effects });
        break;
      case 'below_hp_pct':
        p.belowHpPct.push({ key, pct: mod.pct, effects: mod.effects });
        break;
      case 'once_per_combat':
        p.oncePerCombat.push({ key, effects: mod.effects });
        break;

      case 'in_hand_no_guard':
        p.inHandNoGuard = true;
        break;
      case 'in_hand_lap_end':
        p.inHandLapEnd.push({ key, effects: mod.effects });
        break;

      case 'mirror_last_card':
        p.mirrorLastCard = true;
        break;
      case 'punish_heavy':
        p.punishHeavy.push({ minWeight: mod.minWeight, n: mod.n });
        break;
      case 'shielded_by':
        p.shieldedBy.push({ allyId: mod.allyId, pct: mod.pct });
        break;
      case 'on_ally_death_double':
        p.doublesOnAllyDeath = true;
        break;
      case 'salt_hoard_decay':
        p.saltHoardDecay += mod.n;
        break;
      case 'phase_at_hp_pct':
        p.phaseAtHpPct.push(mod.pct);
        break;
      case 'countersign':
        p.countersign = true;
        break;
      case 'stamp_marks':
        p.stampMarks += mod.n;
        break;

      // Encoded for the layer above combat. `vocabulary.ts` says which phase collects
      // them; the Tally deliberately does nothing with them.
      case 'mark_slots':
      case 'assay_discount_pct':
      case 'purchase_fails_one_in':
      case 'salt_per_win':
      case 'on_settle':
      case 'on_combat_won':
      case 'on_collector_won':
      case 'survive_lethal_run':
      case 'reveal_map_layer':
      case 'reveal_elite_intents':
      case 'replicates':
      case 'irremovable':
      case 'compound_phase':
        break;
    }
  }

  return p;
}

/** A scaled bonus, resolved against a count. Weighted Purse caps at +4. */
export function scaledValue(bonus: ScaledBonus, count: number): number {
  const raw = Math.floor(count / Math.max(1, bonus.divide)) * bonus.n;
  return bonus.max === undefined ? raw : Math.min(raw, bonus.max);
}
