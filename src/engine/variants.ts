/**
 * Upgraded and weighed-down cards, as derived definitions rather than as instance flags.
 *
 * A Wake lets you upgrade a card and the Ink Well makes one heavier, so a run's deck holds
 * cards that no longer match `content/cards.ts`. There were two ways to carry that: a flag
 * on every card instance that every consumer has to remember to apply, or a derived
 * `CardDef` in the run's own library under its own id. This is the second one, and the
 * reason is that the Tally already looks every card up by id, so a variant costs the engine
 * nothing and costs the view one fallback.
 *
 * The id is the spec: `paper_cut` upgraded once is `paper_cut+`, dipped in the Ink Well is
 * `paper_cut+^`. Base ids are `lower_snake_case` by the art contract, so `+` and `^` can
 * never collide with one, and `baseIdOf` gets you back to the card the art is filed under.
 *
 * Upgrades are once per card. Not a rule the design doc states, but the alternative is a
 * card you can pour every Wake into, and "which card" is a more interesting question than
 * "how many times".
 */
import type { CardDef, Effect } from './types';

/** How far a card has drifted from the one printed in `content/cards.ts`. */
export type VariantSpec = {
  readonly baseId: string;
  readonly upgraded: boolean;
  /** Extra deck Load the card has picked up. The Ink Well is the only source. */
  readonly load: number;
};

const UPGRADE_MARK = '+';
const LOAD_MARK = '^';

export function variantId(spec: VariantSpec): string {
  return `${spec.baseId}${spec.upgraded ? UPGRADE_MARK : ''}${LOAD_MARK.repeat(Math.max(0, spec.load))}`;
}

export function parseVariantId(id: string): VariantSpec {
  const cut = id.search(/[+^]/);
  if (cut < 0) return { baseId: id, upgraded: false, load: 0 };
  const baseId = id.slice(0, cut);
  const suffix = id.slice(cut);
  return {
    baseId,
    upgraded: suffix.includes(UPGRADE_MARK),
    load: [...suffix].filter((c) => c === LOAD_MARK).length,
  };
}

/** The card the art, suit and Mark are filed under. Identity for anything but the Tally. */
export function baseIdOf(id: string): string {
  return parseVariantId(id).baseId;
}

export function isVariantId(id: string): boolean {
  return id !== baseIdOf(id);
}

/**
 * What an upgrade does to one atom.
 *
 * Flat bumps rather than percentages, because the sim can only reason about numbers it can
 * add and because "+2" reads off a card. Drawbacks go the other way: upgrading a card that
 * strains you strains you less, which is the only sensible direction for a reward.
 */
function upgradeEffect(effect: Effect): Effect {
  switch (effect.k) {
    case 'damage':
      return { ...effect, n: effect.n + 2 };
    case 'damage_per':
    case 'damage_random':
      return { ...effect, n: effect.n + 1 };
    case 'guard':
      return { ...effect, n: effect.n + 3 };
    case 'heal':
      return { ...effect, n: effect.n + 2 };
    case 'draw':
      return { ...effect, n: effect.n + 1 };
    case 'slip':
    case 'haste':
    case 'bleed':
      return { ...effect, n: effect.n + 1 };
    case 'salt':
      return { ...effect, n: effect.n + 4 };
    case 'strain':
    case 'self_damage':
    case 'discard':
      return { ...effect, n: Math.max(0, effect.n - 1) };
    // A perjury upgrades what it swears, and resolves a beat sooner while it is at it.
    case 'perjury':
      return { ...effect, in: Math.max(1, effect.in - 1), effects: effect.effects.map(upgradeEffect) };
    case 'next_action':
    case 'next_lap':
    case 'on_kill':
    case 'spend_salt':
      return { ...effect, effects: effect.effects.map(upgradeEffect) };
    case 'remove_compound':
    case 'add_compound':
    case 'seed_discard':
    case 'reveal_intents':
    case 'reveal_nodes':
    case 'steal_salt':
    case 'ally_damage':
    case 'enemy_haste':
    case 'empower_next':
    case 'lap_boon':
    case 'return_last':
    case 'copy_intent':
    case 'purge_compounds':
    case 'survive_lethal':
    case 'steal_guard':
    case 'vulnerable':
    case 'echo':
    case 'exhaust':
      return effect;
  }
}

/** True when an upgrade would change any number on the card. */
function bumpsAnything(effects: readonly Effect[]): boolean {
  return effects.some((effect) => JSON.stringify(upgradeEffect(effect)) !== JSON.stringify(effect));
}

/**
 * The card a spec describes.
 *
 * `load` is always written out explicitly, because `CardDef.load` defaults to `weight` and
 * a card that got cheaper to play must not quietly get cheaper to *carry* as well. That
 * would make upgrading a way to dodge Interest, which is the one tax the game is about.
 */
export function deriveVariant(base: CardDef, spec: VariantSpec): CardDef {
  const baseLoad = base.load ?? base.weight;
  if (!spec.upgraded && spec.load === 0) return base;

  const upgradedEffects = spec.upgraded ? base.effects.map(upgradeEffect) : base.effects;
  // Nothing to bump means the reward is a beat off the cost. Perjury cards, mostly: their
  // payload is the timing, so making them cheaper is the only honest upgrade.
  const cheaper = spec.upgraded && !bumpsAnything(base.effects);

  return {
    ...base,
    id: variantId(spec),
    baseId: spec.baseId,
    name: spec.upgraded ? `${base.name} +` : base.name,
    weight: cheaper ? Math.max(0, base.weight - 1) : base.weight,
    effects: upgradedEffects,
    load: baseLoad + spec.load,
  };
}

/** The id a card ends up with after an upgrade, or null when it is already upgraded. */
export function upgradedId(id: string): string | null {
  const spec = parseVariantId(id);
  if (spec.upgraded) return null;
  return variantId({ ...spec, upgraded: true });
}

/** The id a card ends up with after the Ink Well. */
export function heavierId(id: string): string {
  const spec = parseVariantId(id);
  return variantId({ ...spec, load: spec.load + 1 });
}

/**
 * A library that answers for a variant id, given one that answers for the base.
 *
 * Called on every deck change rather than memoised, because a run's deck is ten cards and
 * a Map lookup is not the thing that will ever be slow here.
 */
export function withVariants(
  base: Readonly<Record<string, CardDef>>,
  cardIds: readonly string[],
): Readonly<Record<string, CardDef>> {
  const out: Record<string, CardDef> = { ...base };
  for (const id of cardIds) {
    if (out[id]) continue;
    const spec = parseVariantId(id);
    const printed = base[spec.baseId];
    if (!printed) continue;
    out[id] = deriveVariant(printed, spec);
  }
  return out;
}
