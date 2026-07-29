/**
 * Content validation, for the things types cannot catch.
 *
 * TypeScript already refuses a card with a misspelled atom kind or a missing field, so
 * this deliberately does not re-check the shapes. It checks the *relationships*, which is
 * where the real bugs live:
 *
 * - duplicate IDs across a table, or across tables that share an art namespace
 * - Marks referenced by nothing, or referenced twice, or referenced but not defined
 * - Tokens and Marks reaching for effect atoms that do not exist in the vocabulary
 * - encounters pointing at bodies that are not there
 * - ids that do not match the art contract's `lower_snake_case`
 * - the counts the design doc commits to: 45 cards, 20 Tokens, 8 Hollows, 129 assets
 *
 * Build time only, never shipped. Zod earns its keep here because a dangling reference is
 * exactly the class of mistake that types cannot see and a playtest finds three hours in.
 */
import { z } from 'zod';
import { EFFECT_VOCAB, MOD_VOCAB } from '../engine/vocabulary';
import type { Effect, Mod } from '../engine/types';
import { ART_ID_PATTERN, expectedArtIds } from './art';
import { CARD_LIST, COMPOUND_IDS, DRAFTABLE_IDS } from './cards';
import { ENCOUNTERS, ENEMY_LIST } from './enemies';
import { HOLLOW_LIST } from './hollows';
import { MARKS } from './marks';
import { cardText, wordCount } from './rules-text';
import { BRAND_ASSET_IDS, ICON_IDS, NODES, NODE_IDS, STORE_ASSET_IDS, STRATA, WICK } from './run';
import { TOKEN_LIST } from './tokens';
import { effectsDeep, modEffects } from './types';

/** The counts §5 of the art contract and §9 to §12 of the design doc commit to. */
export const EXPECTED_COUNTS = {
  cards: 45,
  compounds: 7,
  draftable: 38,
  tokens: 20,
  /**
   * 13 bodies across 11 fights. §11 counts fights and says "11 enemies"; the art brief
   * counts drawings and says 12 in `enemies/` plus 2 boss phases. Both are right: the
   * Notary is a body but its art lives in `bosses/`, and Fined arrives with its paperwork.
   */
  bodies: 13,
  enemyArt: 12,
  encounters: 11,
  hollows: 8,
  nodes: 8,
  icons: 24,
  storeAssets: 9,
  art: 129,
} as const;

const artId = z.string().regex(ART_ID_PATTERN, 'ids are lower_snake_case and must match the art files exactly');

export type Problem = { readonly where: string; readonly message: string };

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes].sort();
}

function checkIds(problems: Problem[], where: string, ids: readonly string[]): void {
  for (const id of duplicates(ids)) problems.push({ where, message: `duplicate id "${id}"` });
  for (const id of ids) {
    const parsed = artId.safeParse(id);
    if (!parsed.success) problems.push({ where, message: `bad id "${id}": ${parsed.error.issues[0]?.message ?? ''}` });
  }
}

function checkEffects(problems: Problem[], where: string, effects: readonly Effect[]): void {
  for (const effect of effectsDeep(effects)) {
    if (!Object.hasOwn(EFFECT_VOCAB, effect.k)) {
      problems.push({ where, message: `unknown effect atom "${effect.k}"` });
    }
  }
}

function checkMods(problems: Problem[], where: string, mods: readonly Mod[]): void {
  for (const mod of mods) {
    if (!Object.hasOwn(MOD_VOCAB, mod.k)) problems.push({ where, message: `unknown mod "${mod.k}"` });
  }
  checkEffects(problems, where, modEffects(mods));
}

function count(problems: Problem[], where: string, actual: number, expected: number): void {
  if (actual !== expected) problems.push({ where, message: `expected ${String(expected)}, found ${String(actual)}` });
}

/**
 * Everything wrong with the content, as a list.
 *
 * Returns rather than throws, so the script can print all of it at once. A validator that
 * dies on the first problem turns one fix into fifteen runs.
 */
export function validateContent(): Problem[] {
  const problems: Problem[] = [];

  // --- cards -------------------------------------------------------------
  checkIds(problems, 'cards', CARD_LIST.map((c) => c.id));
  count(problems, 'cards', CARD_LIST.length, EXPECTED_COUNTS.cards);
  count(problems, 'cards/compound', COMPOUND_IDS.length, EXPECTED_COUNTS.compounds);
  count(problems, 'cards/draftable', DRAFTABLE_IDS.length, EXPECTED_COUNTS.draftable);

  for (const card of CARD_LIST) {
    const where = `cards/${card.id}`;
    checkEffects(problems, where, card.effects);
    checkMods(problems, where, card.mods ?? []);

    if (card.weight < 0 || card.weight > 5) problems.push({ where, message: `Weight ${String(card.weight)} is outside 0 to 5` });
    if (card.rarity === 'compound' && card.mark !== null) {
      problems.push({ where, message: 'a Compound Settles into nothing: it should have no Mark' });
    }
    if (card.rarity !== 'compound' && card.mark === null) {
      problems.push({ where, message: 'every draftable card Settles into a Mark' });
    }
    if (card.mark && MARKS[card.mark.id] !== card.mark) {
      problems.push({ where, message: `Mark "${card.mark.id}" is not the one in the Mark table` });
    }
    if (card.playable === false && card.effects.length > 0) {
      problems.push({ where, message: 'an unplayable card cannot have effects: it just sits there' });
    }
    const text = cardText(card);
    if (text.trim().length === 0) problems.push({ where, message: 'renders no rules text at all' });
    // §13 wants card text under 12 words "where you can manage it". A warning would be
    // ignored, so this is a hard bound with a little slack for the scaling cards.
    if (wordCount(text) > 18) {
      problems.push({ where, message: `rules text is ${String(wordCount(text))} words: "${text}"` });
    }
  }

  // --- Marks -------------------------------------------------------------
  const markIds = Object.keys(MARKS);
  checkIds(problems, 'marks', markIds);
  for (const [id, mark] of Object.entries(MARKS)) {
    const where = `marks/${id}`;
    if (mark.id !== id) problems.push({ where, message: `keyed as "${id}" but its id is "${mark.id}"` });
    if (mark.mods.length === 0) problems.push({ where, message: 'a Mark with no mods does nothing' });
    if (mark.text.trim().length === 0) problems.push({ where, message: 'has no text' });
    checkMods(problems, where, mark.mods);
  }

  // Every Mark is printed on exactly one card, and every card prints a distinct one.
  // Both halves matter: an orphan Mark is unreachable, and a shared one means Settling
  // two different cards buys the same passive twice.
  const printed = CARD_LIST.flatMap((c) => (c.mark ? [c.mark.id] : []));
  for (const id of duplicates(printed)) {
    problems.push({ where: 'marks', message: `Mark "${id}" is printed on more than one card` });
  }
  for (const id of markIds) {
    if (!printed.includes(id)) problems.push({ where: 'marks', message: `Mark "${id}" is printed on no card` });
  }
  count(problems, 'marks', markIds.length, EXPECTED_COUNTS.draftable);

  // --- Tokens ------------------------------------------------------------
  checkIds(problems, 'tokens', TOKEN_LIST.map((t) => t.id));
  count(problems, 'tokens', TOKEN_LIST.length, EXPECTED_COUNTS.tokens);
  for (const token of TOKEN_LIST) {
    const where = `tokens/${token.id}`;
    if (token.mods.length === 0) problems.push({ where, message: 'a Token with no mods does nothing' });
    if (token.text.trim().length === 0) problems.push({ where, message: 'has no text' });
    checkMods(problems, where, token.mods);
  }
  // The Notary's Nib names a card by id, which is exactly the sort of reference that rots.
  for (const token of TOKEN_LIST) {
    for (const mod of token.mods) {
      if (mod.k !== 'first_compound_becomes') continue;
      if (!CARD_LIST.some((c) => c.id === mod.cardId)) {
        problems.push({ where: `tokens/${token.id}`, message: `names a card that does not exist: "${mod.cardId}"` });
      }
    }
  }
  for (const card of CARD_LIST) {
    for (const mod of card.mods ?? []) {
      if (mod.k !== 'replicates') continue;
      if (!CARD_LIST.some((c) => c.id === mod.cardId)) {
        problems.push({ where: `cards/${card.id}`, message: `replicates a card that does not exist: "${mod.cardId}"` });
      }
    }
  }

  // --- enemies and encounters -------------------------------------------
  checkIds(problems, 'enemies', ENEMY_LIST.map((e) => e.id));
  count(problems, 'enemies/bodies', ENEMY_LIST.length, EXPECTED_COUNTS.bodies);
  count(
    problems,
    'enemies/art',
    ENEMY_LIST.filter((e) => e.artKind !== 'bosses').length,
    EXPECTED_COUNTS.enemyArt,
  );
  for (const enemy of ENEMY_LIST) {
    const where = `enemies/${enemy.id}`;
    if (enemy.hp <= 0) problems.push({ where, message: 'starts a fight alive or not at all' });
    checkMods(problems, where, enemy.mods ?? []);
    const lists = [enemy.intents, ...(enemy.phases ?? [])];
    for (const [phase, intents] of lists.entries()) {
      if (intents.length === 0) problems.push({ where, message: `phase ${String(phase + 1)} has no intents` });
      for (const intent of intents) {
        if (intent.weight < 1) {
          problems.push({ where, message: `intent "${intent.id}" weighs ${String(intent.weight)}: it would never yield the track` });
        }
        checkEffects(problems, where, intent.effects);
      }
    }
    // Fined points at its paperwork by id. If that ever gets renamed, this is how we hear.
    for (const mod of enemy.mods ?? []) {
      if (mod.k !== 'shielded_by') continue;
      if (!ENEMY_LIST.some((e) => e.id === mod.allyId)) {
        problems.push({ where, message: `shielded by a body that does not exist: "${mod.allyId}"` });
      }
    }
    // A phase transition with nowhere to go is a boss that stops working at 50% HP.
    const hasPhases = (enemy.phases ?? []).length > 0;
    const wantsPhases = (enemy.mods ?? []).some((m) => m.k === 'phase_at_hp_pct');
    if (wantsPhases !== hasPhases) {
      problems.push({ where, message: 'phase_at_hp_pct and phases have to arrive together' });
    }
  }

  checkIds(problems, 'encounters', ENCOUNTERS.map((e) => e.id));
  count(problems, 'encounters', ENCOUNTERS.length, EXPECTED_COUNTS.encounters);
  for (const encounter of ENCOUNTERS) {
    const where = `encounters/${encounter.id}`;
    if (encounter.members.length === 0) problems.push({ where, message: 'has nobody in it' });
    checkIds(problems, where, encounter.members.map((m) => m.id));
    for (const member of encounter.members) {
      if (!ENEMY_LIST.some((e) => e.id === member.defId)) {
        problems.push({ where, message: `names a body that does not exist: "${member.defId}"` });
      }
    }
  }
  // Every body appears in a fight, or it is art nobody will ever see.
  const staged = new Set(ENCOUNTERS.flatMap((e) => e.members.map((m) => m.defId)));
  for (const enemy of ENEMY_LIST) {
    if (!staged.has(enemy.id)) problems.push({ where: 'encounters', message: `"${enemy.id}" is in no encounter` });
  }

  // --- Hollows ----------------------------------------------------------
  checkIds(problems, 'hollows', HOLLOW_LIST.map((h) => h.id));
  count(problems, 'hollows', HOLLOW_LIST.length, EXPECTED_COUNTS.hollows);
  for (const hollow of HOLLOW_LIST) {
    const where = `hollows/${hollow.id}`;
    if (hollow.options.length === 0) problems.push({ where, message: 'has no options' });
    checkIds(problems, where, hollow.options.map((o) => o.id));
    // §13: event text under 60 words.
    if (wordCount(hollow.text) > 60) {
      problems.push({ where, message: `text is ${String(wordCount(hollow.text))} words, over the 60-word limit` });
    }
    for (const option of hollow.options) {
      if (option.outcomes.length === 0) {
        problems.push({ where, message: `option "${option.id}" does nothing at all, not even nothing` });
      }
      // An option that spends Salt without requiring it is a negative balance waiting
      // to happen.
      for (const outcome of option.outcomes) {
        if (outcome.k === 'spend_salt' && (option.requires?.salt ?? 0) < outcome.n) {
          problems.push({ where, message: `option "${option.id}" spends ${String(outcome.n)} Salt without requiring it` });
        }
      }
    }
  }

  // --- the run ----------------------------------------------------------
  checkIds(problems, 'nodes', NODES.map((n) => n.id));
  count(problems, 'nodes', NODES.length, EXPECTED_COUNTS.nodes);
  for (const node of NODES) {
    if (node.symbol.trim().length === 0) {
      problems.push({ where: `nodes/${node.id}`, message: 'needs a symbol: never encode information in colour alone' });
    }
  }
  checkIds(problems, 'icons', ICON_IDS);
  count(problems, 'icons', ICON_IDS.length, EXPECTED_COUNTS.icons);
  checkIds(problems, 'store', STORE_ASSET_IDS);
  count(problems, 'store', STORE_ASSET_IDS.length, EXPECTED_COUNTS.storeAssets);
  checkIds(problems, 'brand', BRAND_ASSET_IDS);

  for (const stratum of STRATA) {
    const where = `strata/${stratum.id}`;
    checkIds(problems, where, stratum.backdrops);
    if (!ENCOUNTERS.some((e) => e.id === stratum.bossEncounterId)) {
      problems.push({ where, message: `boss encounter "${stratum.bossEncounterId}" does not exist` });
    }

    /*
     * The map layout, which types cannot check.
     *
     * A layer with no kinds, a width of zero, or a boss anywhere but the last row are each a
     * map the generator would happily build and nobody could finish. Cheap here, miserable to
     * find at node nine with the seed already lost.
     */
    if (stratum.layers.length !== stratum.nodes) {
      problems.push({
        where,
        message: `${String(stratum.layers.length)} layers for ${String(stratum.nodes)} nodes: one layer is one step`,
      });
    }
    for (const [index, layer] of stratum.layers.entries()) {
      const at = `${where}/layer${String(index)}`;
      const [min, max] = layer.width;
      if (min < 1 || max < min) problems.push({ where: at, message: `width ${String(min)}..${String(max)} is not a range` });
      if (layer.kinds.length === 0) problems.push({ where: at, message: 'no node kinds: nothing to put on the row' });
      for (const kind of layer.kinds) {
        if (!NODE_IDS.includes(kind)) problems.push({ where: at, message: `unknown node kind "${kind}"` });
      }
      const last = index === stratum.layers.length - 1;
      const boss = layer.kinds.includes('boss');
      if (last && !(boss && layer.kinds.length === 1 && max === 1)) {
        problems.push({ where: at, message: 'the last layer is exactly one boss node' });
      }
      if (!last && boss) problems.push({ where: at, message: 'a boss in the middle of the act' });
    }
  }

  if (WICK.deck.length !== 10) {
    problems.push({ where: 'characters/wick', message: `starter deck is ${String(WICK.deck.length)} cards, should be 10` });
  }
  for (const id of WICK.deck) {
    if (!CARD_LIST.some((c) => c.id === id)) {
      problems.push({ where: 'characters/wick', message: `starter deck names a card that does not exist: "${id}"` });
    }
  }

  // --- art --------------------------------------------------------------
  const expected = expectedArtIds();
  let artTotal = 0;
  for (const [kind, ids] of Object.entries(expected)) {
    artTotal += ids.length;
    checkIds(problems, `art/${kind}`, ids);
  }
  count(problems, 'art', artTotal, EXPECTED_COUNTS.art);

  return problems;
}

export function formatProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `  ${p.where.padEnd(34)}${p.message}`).join('\n');
}
