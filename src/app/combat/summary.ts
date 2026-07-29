/**
 * Effects, as chips small enough to pin to a beat.
 *
 * `content/rules-text.ts` writes the sentence that goes on a card face. This writes the
 * two or three characters that go on a 60-pixel intent chip, which is a different job:
 * on the track you are scanning a dozen of these at once and the only questions are
 * "what kind of thing is it" and "how big".
 *
 * The codes are ledger shorthand in mono caps, not icons and not colour. That is the
 * colourblind rule from the brief taken seriously: shape and text carry the meaning, the
 * oxblood is only ever there to say *this one is aimed at you*. Every chip also carries
 * the full generated sentence for its tooltip and its screen-reader label, so nothing is
 * only available to someone who has learned the abbreviations.
 */
import { describeEffect } from '../../content/rules-text';
import type { Effect, EffectKind } from '../../engine/types';

/** Ledger shorthand. Five characters is the most a chip can hold at 1280 wide. */
const CODES: Record<EffectKind, string> = {
  damage: 'DMG',
  damage_per: 'DMG',
  damage_random: 'DMG',
  self_damage: 'SELF',
  guard: 'GRD',
  heal: 'HEAL',
  draw: 'DRAW',
  discard: 'DISC',
  slip: 'SLIP',
  haste: 'HASTE',
  enemy_haste: 'HASTE',
  bleed: 'BLEED',
  strain: 'STRN',
  echo: 'ECHO',
  exhaust: 'EXH',
  perjury: 'PERJ',
  next_action: 'THEN',
  next_lap: 'LAP',
  on_kill: 'KILL',
  salt: 'SALT',
  spend_salt: 'SALT',
  steal_guard: 'GRD',
  reveal_intents: 'READ',
  empower_next: 'FREE',
  lap_boon: 'FREE',
  return_last: 'BACK',
  copy_intent: 'COPY',
  remove_compound: 'PURGE',
  purge_compounds: 'PURGE',
  add_compound: 'CMPD',
  seed_discard: 'DISC',
  survive_lethal: 'WARD',
  vulnerable: 'VULN',
  steal_salt: 'SALT',
  ally_damage: 'BUFF',
  reveal_nodes: 'MAP',
};

/** The atoms that land on whoever is on the other end of the action. */
const AIMED_OUTWARD: readonly EffectKind[] = [
  'damage',
  'damage_per',
  'damage_random',
  'slip',
  'bleed',
  'steal_salt',
];

export type Chip = {
  readonly kind: EffectKind;
  readonly code: string;
  /** The number on the chip, or null for atoms that are just a flag (Echo, Exhaust). */
  readonly n: number | null;
  /** The generated sentence. Tooltip and `aria-label`. */
  readonly label: string;
  /** True when this one takes something off the player. The only thing allowed oxblood. */
  readonly hostile: boolean;
  /** Sworn rather than done. Rendered dashed, because it can still be caught out. */
  readonly promised: boolean;
};

/** The number a chip shows, when the atom has one worth showing. */
function amountOf(effect: Effect): number | null {
  if ('n' in effect && typeof effect.n === 'number') return effect.n;
  if (effect.k === 'perjury') return effect.in;
  if (effect.k === 'survive_lethal') return effect.heal;
  if (effect.k === 'vulnerable') return effect.multiplier;
  return null;
}

export type SummaryOptions = {
  /**
   * Who is doing it. An intent's `damage` is pointed at you; a card's is pointed away.
   * Nothing else about the summary changes, which is why this is one flag and not two
   * functions.
   */
  readonly by: 'player' | 'enemy';
};

/**
 * Flatten a list of effects into chips.
 *
 * Wrappers unwrap: a Perjury is not its own chip, it is the chips inside it drawn dashed,
 * because "Perjury 8" tells you nothing on a track where the beat is already the answer.
 * The one exception is a bare wrapper with nothing in it, which cannot happen in the
 * content but would otherwise render as silence.
 */
export function summarize(effects: readonly Effect[], options: SummaryOptions): Chip[] {
  const out: Chip[] = [];

  const walk = (list: readonly Effect[], promised: boolean): void => {
    for (const effect of list) {
      if (effect.k === 'perjury') {
        walk(effect.effects, true);
        continue;
      }
      if (effect.k === 'next_action' || effect.k === 'next_lap' || effect.k === 'on_kill') {
        walk(effect.effects, promised);
        continue;
      }
      if (effect.k === 'spend_salt') {
        walk(effect.effects, promised);
        continue;
      }
      const outward = AIMED_OUTWARD.includes(effect.k);
      out.push({
        kind: effect.k,
        code: CODES[effect.k],
        n: amountOf(effect),
        label: describeEffect(effect) ?? effect.k,
        hostile: effect.k === 'self_damage' ? options.by === 'player' : outward && options.by === 'enemy',
        promised,
      });
    }
  };

  walk(effects, false);
  return out;
}

/** Damage an intent will put on the player, read straight off its atoms. */
export function intentDamage(effects: readonly Effect[]): number {
  let total = 0;
  for (const effect of effects) {
    if (effect.k === 'damage') total += effect.n;
    if (effect.k === 'perjury' || effect.k === 'next_action' || effect.k === 'next_lap') {
      total += intentDamage(effect.effects);
    }
  }
  return total;
}
