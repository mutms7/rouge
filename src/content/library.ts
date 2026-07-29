/**
 * Content, in the shapes the engine asks for.
 *
 * The engine knows nothing about suits, rarity, encounters or Tokens. It wants a card
 * library, a list of enemy setups, and a flat list of mods for the player. This file is
 * the only place that translation happens, which keeps the conversion out of both the sim
 * and the view and means there is exactly one answer to "what does this fight look like".
 */
import type { CardDef, CombatSetup, EnemySetup, Mod } from '../engine/types';
import { CARDS, CARD_LIST, cardOf } from './cards';
import { ENCOUNTERS, enemyOf } from './enemies';
import { markOf } from './marks';
import { WICK } from './run';
import { tokenOf } from './tokens';
import { loadOf } from './types';
import type { Card, EncounterDef } from './types';

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

/** Cards a reward screen may offer at a rarity. */
export function poolByRarity(rarity: Card['rarity']): Card[] {
  return CARD_LIST.filter((c) => c.rarity === rarity);
}
