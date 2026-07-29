/**
 * Content, in the shapes the engine asks for.
 *
 * The engine knows nothing about suits, rarity, encounters or Tokens. It wants a card
 * library, a list of enemy setups, and a flat list of mods for the player. This file is
 * the only place that translation happens, which keeps the conversion out of both the sim
 * and the view and means there is exactly one answer to "what does this fight look like".
 */
import type { RunContent } from '../engine/runtypes';
import type { CardDef, CombatSetup, EnemySetup, Mod } from '../engine/types';
import { CARDS, CARD_LIST, COMPOUND_IDS, DRAFTABLE_IDS, cardOf } from './cards';
import { ENCOUNTERS, enemyOf } from './enemies';
import { HOLLOWS, HOLLOW_IDS } from './hollows';
import { markOf } from './marks';
import { CHALK_WARDS, ECONOMY, MARK_SLOTS, WICK } from './run';
import { TOKEN_IDS, TOKEN_LIST, tokenOf } from './tokens';
import { loadOf } from './types';
import type { EncounterDef } from './types';

/**
 * Every card, as the engine sees them.
 *
 * `Card` extends `CardDef`, so this is a widening rather than a conversion. Handing the
 * engine the whole set rather than just the deck matters: Interest generates Compounds
 * mid-combat, Witness invents a card, and neither can look up something that is not here.
 */
export const CARD_LIBRARY: Readonly<Record<string, CardDef>> = CARDS;

/** One fight's worth of bodies, positioned and phased. */
export function enemySetups(encounter: EncounterDef): EnemySetup[] {
  return encounter.members.map((member) => {
    const def = enemyOf(member.defId);
    return {
      id: member.id,
      name: def.name,
      hp: def.hp,
      intents: def.intents,
      ...(def.phases ? { phases: def.phases } : {}),
      ...(def.mods ? { mods: def.mods } : {}),
      ...(member.startBeat === undefined ? {} : { startBeat: member.startBeat }),
      ...(member.intentOffset === undefined ? {} : { intentOffset: member.intentOffset }),
    };
  });
}

/**
 * Marks and Tokens, flattened into the one list the engine reads.
 *
 * Flattening here rather than in the engine is the point of the split: a Mark and a Token
 * are different things to the player and the same thing to the Tally.
 */
export function passivesFor(options: { marks?: readonly string[]; tokens?: readonly string[] }): Mod[] {
  const mods: Mod[] = [];
  for (const id of options.marks ?? []) mods.push(...markOf(id).mods);
  for (const id of options.tokens ?? []) mods.push(...tokenOf(id).mods);
  return mods;
}

export type FightOptions = {
  readonly seed: number;
  readonly encounterId: string;
  readonly deck?: readonly string[];
  readonly hp?: number;
  readonly maxHp?: number;
  readonly marks?: readonly string[];
  readonly tokens?: readonly string[];
  readonly salt?: number;
};

/** A combat, ready for `createCombat`. Wick's starter deck unless told otherwise. */
export function fightSetup(options: FightOptions): CombatSetup {
  const encounter = ENCOUNTERS.find((e) => e.id === options.encounterId);
  if (!encounter) throw new Error(`no encounter called ${options.encounterId}`);
  const mods = passivesFor(options);

  return {
    seed: options.seed,
    library: CARD_LIBRARY,
    player: {
      id: WICK.id,
      name: WICK.name,
      hp: options.hp ?? WICK.hp,
      maxHp: options.maxHp ?? WICK.hp,
      ...(mods.length > 0 ? { mods } : {}),
      ...(options.salt === undefined ? {} : { salt: options.salt }),
    },
    enemies: enemySetups(encounter),
    deck: options.deck ?? WICK.deck,
  };
}

/** Deck Load, which Interest bills you for. §4.1. */
export function deckLoad(deck: readonly string[]): number {
  return deck.reduce((total, id) => total + loadOf(cardOf(id)), 0);
}

/** Encounters by tier, which is what the map generator deals from. */
function encounterIdsByTier(tier: EncounterDef['tier']): string[] {
  return ENCOUNTERS.filter((e) => e.tier === tier).map((e) => e.id);
}

/**
 * Everything a run needs, in the shapes `engine/run.ts` asks for.
 *
 * Same seam as `CARD_LIBRARY`, one layer up: the engine may not import `content/`, so a run
 * is handed its content as a value. Which is also what makes the whole layer testable
 * against a three-card library and a two-layer map instead of against the real act.
 *
 * Derived, never written down twice. Adding a Hollow to `hollows.ts` puts it in the map
 * rotation with no second edit.
 */
export function runContent(): RunContent {
  const cardMarks: Record<string, string> = {};
  const cardRarity: Record<string, string> = {};
  for (const card of CARD_LIST) {
    cardRarity[card.id] = card.rarity;
    if (card.mark) cardMarks[card.id] = card.mark.id;
  }

  const markMods: Record<string, readonly Mod[]> = {};
  for (const card of CARD_LIST) {
    if (card.mark) markMods[card.mark.id] = card.mark.mods;
  }

  const tokenMods: Record<string, readonly Mod[]> = {};
  for (const token of TOKEN_LIST) tokenMods[token.id] = token.mods;

  const encounterSetups: Record<string, readonly EnemySetup[]> = {};
  for (const encounter of ENCOUNTERS) encounterSetups[encounter.id] = enemySetups(encounter);

  return {
    library: CARD_LIBRARY,
    cardMarks,
    cardRarity,
    markMods,
    tokenMods,
    tokenIds: TOKEN_IDS,
    draftableIds: DRAFTABLE_IDS,
    hollows: HOLLOWS,
    hollowIds: HOLLOW_IDS,
    compoundIds: COMPOUND_IDS,
    encounters: {
      normal: encounterIdsByTier('normal'),
      collector: encounterIdsByTier('collector'),
      boss: CHALK_WARDS.bossEncounterId,
      // §11: the tutorial body. Fight one is always this one.
      tutorial: 'chalk_debtor',
    },
    encounterSetups,
    layers: CHALK_WARDS.layers,
    economy: ECONOMY,
    character: {
      id: WICK.id,
      name: WICK.name,
      hp: WICK.hp,
      markSlots: WICK.markSlots,
      deck: WICK.deck,
    },
    maxMarkSlots: MARK_SLOTS.max,
  };
}

/** Built once. Content is frozen data, so there is nothing to invalidate. */
export const RUN_CONTENT: RunContent = runContent();
