/**
 * The run. `(state, action) => state`, same contract as the Tally, one layer up.
 *
 * Combat lives *inside* this: a fight node puts a `CombatState` in `state.combat` and
 * forwards `{ k: 'combat', action }` into `reduce`. One action log for the whole run, which
 * is the property that makes mid-combat resume fall out for free rather than needing a
 * second save format. A save is a seed plus that log. Nothing else.
 *
 * Everything between fights is a *prompt* and an *answer*. A Hollow, a shop, a Wake and a
 * card reward are all "here is a thing, choose", so there is one queue and four actions
 * rather than a case per screen. A Hollow that gives you a card and takes one pushes two
 * prompts and the player answers them in order.
 *
 * Illegal actions throw. The view has `legalRunActions` and answers off the live prompt, so
 * an illegal action is a bug, and a silent no-op is how a bug becomes a save file nobody can
 * replay.
 */
import { createCombat, reduce } from './combat';
import { generateMap, nodeAt, reachableFrom, visibleThroughLayer } from './map';
import { collectRunMods, noRunPassives } from './runmods';
import type { RunPassives } from './runmods';
import { makeRng, makeRngStreams, nextInt, nextUint32, shuffle } from './rng';
import type { Rng, RngStream } from './rng';
import type {
  DeckOp,
  RunAction,
  RunCard,
  RunContent,
  RunEffect,
  RunNode,
  RunOption,
  RunPrompt,
  RunSave,
  RunState,
  ShopItem,
} from './runtypes';
import { isAlive } from './tally';
import type { CardDef, CombatSetup, Effect, Mod, RunLogEntry } from './types';
import { heavierId, parseVariantId, upgradedId, withVariants } from './variants';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type Draft = Mutable<Omit<RunState, 'rng'>> & { rng: Record<RngStream, Rng> };

function cloneRun(state: RunState): Draft {
  return {
    seed: state.seed,
    actions: [...state.actions],
    content: state.content,
    library: state.library,
    map: state.map,
    at: state.at,
    visited: [...state.visited],
    hp: state.hp,
    maxHp: state.maxHp,
    salt: state.salt,
    deck: [...state.deck],
    marks: [...state.marks],
    markSlots: state.markSlots,
    blockedMarks: [...state.blockedMarks],
    tokens: [...state.tokens],
    combat: state.combat,
    lastCombat: state.lastCombat,
    prompts: [...state.prompts],
    owed: state.owed,
    rng: { ...state.rng },
    runLog: [...state.runLog],
    outcome: state.outcome,
    revealedLayers: state.revealedLayers,
    bossIntentKnown: state.bossIntentKnown,
    compoundPhases: state.compoundPhases,
    lethalWardSpent: state.lethalWardSpent,
    uidSeq: state.uidSeq,
  };
}

function roll(draft: Draft, stream: RngStream, maxExclusive: number): number {
  const [value, next] = nextInt(draft.rng[stream], maxExclusive);
  draft.rng = { ...draft.rng, [stream]: next };
  return value;
}

function shuffled<T>(draft: Draft, stream: RngStream, items: readonly T[]): T[] {
  const [out, next] = shuffle(draft.rng[stream], items);
  draft.rng = { ...draft.rng, [stream]: next };
  return out;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Marks and Tokens, flattened. The one list both aggregators read. */
export function runMods(state: RunState): Mod[] {
  const mods: Mod[] = [];
  for (const id of state.marks) mods.push(...(state.content.markMods[id] ?? []));
  for (const id of state.tokens) mods.push(...(state.content.tokenMods[id] ?? []));
  return mods;
}

export function runPassives(state: RunState): RunPassives {
  const mods = runMods(state);
  return mods.length === 0 ? noRunPassives() : collectRunMods(mods);
}

export function markSlotsOf(state: RunState): number {
  const total = state.markSlots + runPassives(state).markSlots;
  return Math.min(state.content.maxMarkSlots, total);
}

/** Deck Load, which Interest bills you for once phase 5 wires it up. §4.1. */
export function deckLoadOf(state: RunState): number {
  const extra = runPassives(state).cardLoad;
  return state.deck.reduce((total, card) => {
    const def = state.library[card.cardId];
    if (!def) return total;
    return total + (def.load ?? def.weight) + extra;
  }, 0);
}

/** The Mark a deck card would Settle into, or null. Variants Settle as their base card. */
export function markIdFor(state: RunState, cardId: string): string | null {
  return state.content.cardMarks[parseVariantId(cardId).baseId] ?? null;
}

export function currentPrompt(state: RunState): RunPrompt | null {
  return state.prompts[0] ?? null;
}

export function reachable(state: RunState): readonly string[] {
  if (state.outcome !== 'ongoing' || state.combat !== null || state.prompts.length > 0) return [];
  return reachableFrom(state.map, state.at);
}

export function visibleLayers(state: RunState): number {
  const revealed = state.revealedLayers + (runPassives(state).revealMapLayer ? 1 : 0);
  return visibleThroughLayer(state.map, state.at, revealed);
}

export function isCollector(state: RunState, encounterId: string): boolean {
  return state.content.encounters.collector.includes(encounterId);
}

/** Cards that may be Settled right now: a free slot, a Mark you lack, nothing burned. */
export function settleableUids(state: RunState): string[] {
  if (state.marks.length >= markSlotsOf(state)) return [];
  return state.deck
    .filter((card) => {
      const markId = markIdFor(state, card.cardId);
      if (!markId) return false;
      return !state.marks.includes(markId) && !state.blockedMarks.includes(markId);
    })
    .map((card) => card.uid);
}

/**
 * Cards that may leave the deck.
 *
 * The floor is not flavour. Settling and the Weighing Room both delete cards and the arc
 * §4.3 describes ends at eight, so a run that can reach zero cards is a run that can reach
 * a fight it cannot act in.
 */
export function removableUids(state: RunState): string[] {
  if (state.deck.length <= state.content.economy.minDeckSize) return [];
  return state.deck
    .filter((card) => !(state.library[card.cardId]?.mods ?? []).some((mod) => mod.k === 'irremovable'))
    .map((card) => card.uid);
}

export function upgradeableUids(state: RunState): string[] {
  return state.deck
    .filter((card) => {
      const def = state.library[card.cardId];
      if (!def || def.playable === false) return false;
      return upgradedId(card.cardId) !== null;
    })
    .map((card) => card.uid);
}

/** Whether a Hollow option can be taken. HP costs are gated, so no event can kill you. */
export function optionAvailable(state: RunState, option: RunOption): boolean {
  const needSalt = option.requires?.salt ?? 0;
  const needCards = option.requires?.cards ?? 0;
  if (state.salt < needSalt) return false;
  if (needCards > 0 && removableUids(state).length < needCards) return false;

  let cost = 0;
  for (const outcome of option.outcomes) {
    if (outcome.k === 'spend_salt' && state.salt < outcome.n) return false;
    if (outcome.k === 'lose_hp' || outcome.k === 'lose_max_hp') cost += outcome.n;
  }
  return cost < state.hp;
}

/**
 * Every action the player may legally take. The view answers off this, the same way the
 * combat UI answers off `legalActions`.
 */
export function legalRunActions(state: RunState): RunAction[] {
  if (state.outcome !== 'ongoing') return [];
  if (state.combat !== null) return [];

  const prompt = currentPrompt(state);
  if (!prompt) {
    return reachable(state).map((nodeId) => ({ k: 'travel', nodeId }) as RunAction);
  }

  const out: RunAction[] = [];
  switch (prompt.k) {
    case 'shop':
      for (const item of prompt.items) {
        if (item.sold) continue;
        if (state.salt >= item.salt) out.push({ k: 'answer', id: item.id, pay: 'salt' });
        if (item.cards !== null && removableUids(state).length >= item.cards) {
          out.push({ k: 'answer', id: item.id, pay: 'cards' });
        }
      }
      out.push({ k: 'decline' });
      break;
    case 'wake':
      out.push({ k: 'answer', id: 'rest' });
      if (prompt.canUpgrade) out.push({ k: 'answer', id: 'upgrade' });
      if (state.salt >= state.content.economy.wakeSlotSalt && markSlotsOf(state) < state.content.maxMarkSlots) {
        out.push({ k: 'answer', id: 'slot' });
      }
      break;
    case 'hollow': {
      const hollow = state.content.hollows[prompt.hollowId];
      for (const option of hollow?.options ?? []) {
        if (optionAvailable(state, option)) out.push({ k: 'answer', id: option.id });
      }
      break;
    }
    case 'gain_card':
    case 'gain_token':
      for (const id of prompt.ids) out.push({ k: 'answer', id });
      if (prompt.skippable) out.push({ k: 'decline' });
      break;
    case 'pick_deck_card':
      for (const uid of prompt.uids) out.push({ k: 'answer', id: uid });
      if (prompt.skippable) out.push({ k: 'decline' });
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * A combat's seed, derived from the run seed and the node.
 *
 * Derived rather than counted, so the shuffle in the fight at layer 7 does not depend on
 * whether you took the left branch at layer 3. Change one decision and only that decision's
 * consequences move.
 */
export function combatSeedFor(runSeed: number, nodeId: string): number {
  const [value] = nextUint32(makeRng(runSeed, `combat:${nodeId}`));
  return value;
}

export function createRun(content: RunContent, seed: number): RunState {
  const streams = makeRngStreams(seed);
  const [map, mapRng] = generateMap(content, streams.map);

  let uidSeq = 0;
  const deck: RunCard[] = content.character.deck.map((cardId) => {
    uidSeq += 1;
    return { uid: `d${String(uidSeq)}`, cardId };
  });

  return {
    seed,
    actions: [],
    content,
    library: withVariants(content.library, deck.map((c) => c.cardId)),
    map,
    at: null,
    visited: [],
    hp: content.character.hp,
    maxHp: content.character.hp,
    salt: 0,
    deck,
    marks: [],
    markSlots: content.character.markSlots,
    blockedMarks: [],
    tokens: [],
    combat: null,
    lastCombat: null,
    prompts: [],
    owed: null,
    rng: { ...streams, map: mapRng },
    runLog: [],
    outcome: 'ongoing',
    revealedLayers: 0,
    bossIntentKnown: false,
    compoundPhases: 0,
    lethalWardSpent: false,
    uidSeq,
  };
}

/**
 * The setup for the fight at a node.
 *
 * The once-per-run escape is armed here as an ordinary combat ward, because "survive lethal"
 * is a thing that happens on a beat and the run has no beats. `finishCombat` reads the log
 * to find out whether it went off.
 */
export function combatSetupAt(state: RunState, node: RunNode): CombatSetup {
  if (!node.encounterId) throw new Error(`node ${node.id} is not a fight`);
  const enemies = state.content.encounterSetups[node.encounterId];
  if (!enemies) throw new Error(`no encounter called ${node.encounterId}`);

  const mods = runMods(state);
  const passives = collectRunMods(mods);
  const ward: Mod[] =
    passives.surviveLethalHp > 0 && !state.lethalWardSpent
      ? [{ k: 'on_combat_start', effects: [{ k: 'survive_lethal', heal: passives.surviveLethalHp }] }]
      : [];

  return {
    seed: combatSeedFor(state.seed, node.id),
    library: state.library,
    player: {
      id: state.content.character.id,
      name: state.content.character.name,
      hp: state.hp,
      maxHp: state.maxHp,
      mods: [...mods, ...ward],
      salt: state.salt,
    },
    enemies,
    deck: state.deck.map((card) => card.cardId),
  };
}

// ---------------------------------------------------------------------------
// Deck bookkeeping
// ---------------------------------------------------------------------------

function refreshLibrary(draft: Draft): void {
  draft.library = withVariants(
    draft.content.library,
    draft.deck.map((card) => card.cardId),
  );
}

function addCard(draft: Draft, cardId: string): void {
  draft.uidSeq += 1;
  draft.deck = [...draft.deck, { uid: `d${String(draft.uidSeq)}`, cardId }];
  refreshLibrary(draft);
}

function cardAt(draft: Draft, uid: string): RunCard {
  const found = draft.deck.find((card) => card.uid === uid);
  if (!found) throw new Error(`no card in the deck with uid ${uid}`);
  return found;
}

function replaceCard(draft: Draft, uid: string, cardId: string): void {
  draft.deck = draft.deck.map((card) => (card.uid === uid ? { uid, cardId } : card));
  refreshLibrary(draft);
}

function dropCard(draft: Draft, uid: string): RunCard {
  const card = cardAt(draft, uid);
  draft.deck = draft.deck.filter((c) => c.uid !== uid);
  refreshLibrary(draft);
  return card;
}

function log(draft: Draft, entry: RunLogEntry): void {
  draft.runLog = [...draft.runLog, entry];
}

function heal(draft: Draft, n: number): void {
  draft.hp = Math.min(draft.maxHp, draft.hp + n);
}

function hurt(draft: Draft, n: number): void {
  draft.hp = Math.max(0, draft.hp - n);
  if (draft.hp === 0) draft.outcome = 'lost';
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function push(draft: Draft, prompt: RunPrompt): void {
  draft.prompts = [...draft.prompts, prompt];
}

/** In front of whatever is already queued. A purchase paid in paper interrupts the shop. */
function unshift(draft: Draft, prompt: RunPrompt): void {
  draft.prompts = [prompt, ...draft.prompts];
}

function pop(draft: Draft): void {
  draft.prompts = draft.prompts.slice(1);
}

/**
 * Cards to offer, weighted by rarity and without repeats inside one offer.
 *
 * Drawn off the `rewards` stream, so rerolling the map does not change what a fight pays
 * out and vice versa.
 */
function offerCards(draft: Draft, count: number, pool: 'any' | 'rare'): string[] {
  const weights = draft.content.economy.draftWeights;
  const candidates = draft.content.draftableIds.filter((id) => {
    const rarity = draft.content.cardRarity[id] ?? '';
    if (pool === 'rare') return rarity === 'rare';
    return (weights[rarity] ?? 0) > 0;
  });

  const out: string[] = [];
  const remaining = [...candidates];
  while (out.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, id) => sum + (weights[draft.content.cardRarity[id] ?? ''] ?? 1), 0);
    let ticket = roll(draft, 'rewards', Math.max(1, total));
    let taken = remaining.length - 1;
    for (const [index, id] of remaining.entries()) {
      ticket -= weights[draft.content.cardRarity[id] ?? ''] ?? 1;
      if (ticket < 0) {
        taken = index;
        break;
      }
    }
    out.push(remaining[taken] as string);
    remaining.splice(taken, 1);
  }
  return out;
}

function offerTokens(draft: Draft, count: number): string[] {
  const available = draft.content.tokenIds.filter((id) => !draft.tokens.includes(id));
  return shuffled(draft, 'rewards', available).slice(0, count);
}

function pushCardOffer(draft: Draft, pool: 'any' | 'rare', skippable: boolean): void {
  const ids = offerCards(draft, draft.content.economy.rewardCards, pool);
  if (ids.length === 0) return;
  push(draft, { k: 'gain_card', ids, skippable });
}

function pushTokenOffer(draft: Draft, skippable: boolean): void {
  // Three to choose between, or whatever is left. Twenty Tokens and one run means the list
  // does not run dry in the demo, but a Vault that offers nothing would be a dead screen.
  const ids = offerTokens(draft, 3);
  if (ids.length === 0) return;
  push(draft, { k: 'gain_token', ids, skippable });
}

/** Which cards a given operation may be pointed at. */
export function eligibleUids(state: RunState, op: DeckOp): string[] {
  switch (op) {
    case 'settle':
      return settleableUids(state);
    case 'remove':
      return removableUids(state);
    case 'upgrade':
      return upgradeableUids(state);
    // The Ink Well takes anything you can actually play. An already-upgraded card just
    // comes out heavier, which is the trade the well is offering either way.
    case 'dip':
    case 'add_load':
      return state.deck.filter((card) => state.library[card.cardId]?.playable !== false).map((card) => card.uid);
  }
}

function pushDeckPick(
  draft: Draft,
  op: DeckOp,
  options: { skippable: boolean; destroysMark?: boolean; front?: boolean },
): boolean {
  const uids = eligibleUids(draft, op);
  if (uids.length === 0) return false;
  const prompt: RunPrompt = {
    k: 'pick_deck_card',
    op,
    uids,
    skippable: options.skippable,
    destroysMark: options.destroysMark ?? false,
  };
  if (options.front) unshift(draft, prompt);
  else push(draft, prompt);
  return true;
}

// ---------------------------------------------------------------------------
// Run-level effects
// ---------------------------------------------------------------------------

/**
 * The handful of combat atoms that also mean something between fights.
 *
 * Marks and Tokens hang `Effect` lists off `on_settle` and `on_combat_won`, and the ones the
 * demo uses are heal and Salt. Anything that needs a beat to happen on is skipped rather
 * than approximated: a Guard trigger outside combat has nothing to decay against.
 */
function applyRunTrigger(draft: Draft, effects: readonly Effect[]): void {
  for (const effect of effects) {
    switch (effect.k) {
      case 'heal':
        heal(draft, effect.n);
        break;
      case 'salt':
        draft.salt += effect.n;
        break;
      case 'self_damage':
        hurt(draft, effect.n);
        break;
      case 'reveal_nodes':
        draft.revealedLayers = Math.max(draft.revealedLayers, effect.n);
        break;
      default:
        break;
    }
  }
}

function addCompounds(draft: Draft, n: number): void {
  const pool = draft.content.compoundIds;
  if (pool.length === 0) return;
  for (let i = 0; i < n; i += 1) {
    const index = roll(draft, 'rewards', pool.length);
    addCard(draft, pool[index] as string);
  }
}

/** One Hollow outcome. Anything needing a choice becomes a prompt instead of a guess. */
function applyRunEffect(draft: Draft, effect: RunEffect): void {
  switch (effect.k) {
    case 'gain_card':
      for (let i = 0; i < effect.n; i += 1) pushCardOffer(draft, effect.pool, false);
      break;
    case 'remove_card':
      for (let i = 0; i < effect.n; i += 1) {
        pushDeckPick(draft, 'remove', { skippable: false, destroysMark: effect.destroysMark ?? false });
      }
      break;
    case 'upgrade_card':
      for (let i = 0; i < effect.n; i += 1) {
        pushDeckPick(draft, (effect.load ?? 0) > 0 ? 'dip' : 'upgrade', { skippable: false });
      }
      break;
    case 'add_card_load':
      for (let i = 0; i < effect.n; i += 1) pushDeckPick(draft, 'add_load', { skippable: false });
      break;
    case 'gain_token':
      for (let i = 0; i < effect.n; i += 1) pushTokenOffer(draft, false);
      break;
    case 'gain_salt':
      draft.salt += effect.n;
      break;
    case 'spend_salt':
      draft.salt = Math.max(0, draft.salt - effect.n);
      break;
    case 'gain_mark_slot':
      draft.markSlots = Math.min(draft.content.maxMarkSlots, draft.markSlots + effect.n);
      break;
    case 'lose_hp':
      hurt(draft, effect.n);
      break;
    case 'lose_max_hp':
      draft.maxHp = Math.max(1, draft.maxHp - effect.n);
      draft.hp = Math.min(draft.hp, draft.maxHp);
      break;
    case 'heal':
      heal(draft, effect.n);
      break;
    case 'add_compound':
      addCompounds(draft, effect.n);
      break;
    case 'reveal_nodes':
      draft.revealedLayers = Math.max(draft.revealedLayers, effect.n);
      break;
    case 'reveal_boss_intent':
      draft.bossIntentKnown = true;
      break;
    case 'compound_phase':
      draft.compoundPhases += effect.n;
      break;
    case 'nothing':
      break;
  }
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function shopStock(draft: Draft): ShopItem[] {
  const economy = draft.content.economy;
  const discount = collectRunMods(runMods(draft)).assayDiscountPct;
  const priced = (salt: number): number => Math.max(1, Math.round((salt * (100 - discount)) / 100));
  const inPaper = (salt: number): number => Math.max(1, Math.ceil(salt / economy.saltPerCardPaid));

  const items: ShopItem[] = [];
  for (const cardId of offerCards(draft, economy.assayCards, 'any')) {
    const rarity = draft.content.cardRarity[cardId] ?? 'common';
    const salt = priced(economy.assayCardSalt[rarity] ?? economy.assayCardSalt['common'] ?? 40);
    items.push({ id: `card:${cardId}`, kind: 'card', refId: cardId, salt, cards: inPaper(salt), sold: false });
  }
  for (const tokenId of offerTokens(draft, economy.assayTokens)) {
    const salt = priced(economy.assayTokenSalt);
    items.push({ id: `token:${tokenId}`, kind: 'token', refId: tokenId, salt, cards: inPaper(salt), sold: false });
  }
  if (markSlotsOf(draft) < draft.content.maxMarkSlots) {
    const salt = priced(economy.assaySlotSalt);
    items.push({ id: 'slot', kind: 'slot', refId: null, salt, cards: inPaper(salt), sold: false });
  }
  // Paying a card to delete a card is not a trade, so this one is Salt only.
  items.push({ id: 'remove', kind: 'remove', refId: null, salt: priced(economy.assayRemoveSalt), cards: null, sold: false });
  return items;
}

function enterNode(draft: Draft, node: RunNode): void {
  switch (node.kind) {
    case 'debtor':
    case 'collector':
    case 'boss':
      draft.combat = createCombat(combatSetupAt(draft, node));
      // A fight that resolves itself before the player acts is possible in principle.
      if (draft.combat.outcome !== 'ongoing') finishCombat(draft, node);
      break;
    case 'assay':
      push(draft, { k: 'shop', items: shopStock(draft) });
      break;
    case 'reckoning':
      /*
       * Always a screen, even with nothing on it.
       *
       * A full sheet, or a deck holding no Mark you lack, means there is nothing to Settle.
       * The empty prompt is still pushed, because a Reckoning that silently drops you back on
       * the map reads as a bug: the player needs to be told *why* the node did nothing.
       */
      push(draft, {
        k: 'pick_deck_card',
        op: 'settle',
        uids: settleableUids(draft),
        skippable: true,
        destroysMark: false,
      });
      break;
    case 'wake':
      push(draft, { k: 'wake', canUpgrade: upgradeableUids(draft).length > 0 });
      break;
    case 'vault':
      draft.salt += draft.content.economy.saltPerVault;
      pushTokenOffer(draft, false);
      break;
    case 'hollow':
      if (node.hollowId) push(draft, { k: 'hollow', hollowId: node.hollowId });
      break;
  }
}

/**
 * Bank a finished fight.
 *
 * HP and Salt come out of the combat rather than being tracked in parallel, because the
 * combat is the thing that knows about Hush Money and the Tithe-Wolf. The combat's run log
 * is appended whole: it records what got Exhausted, which nothing reads yet and which Act 4
 * is built out of.
 */
function finishCombat(draft: Draft, node: RunNode): void {
  const combat = draft.combat;
  if (!combat) return;
  const player = combat.combatants.find((c) => c.team === 'player');

  draft.hp = player ? Math.max(0, player.hp) : 0;
  draft.salt = combat.salt;
  draft.runLog = [...draft.runLog, ...combat.runLog];
  // Only the sheet's ward is once per *run*. A card spending its own is a card doing its job.
  if (combat.log.some((entry) => entry.event.k === 'ward_spent' && !entry.event.fromCard)) {
    draft.lethalWardSpent = true;
  }

  const outcome = combat.outcome;
  draft.combat = null;
  draft.lastCombat = combat;

  if (outcome === 'lost' || !player || !isAlive(player)) {
    draft.outcome = 'lost';
    return;
  }

  const economy = draft.content.economy;
  const passives = collectRunMods(runMods(draft));
  const collector = node.encounterId !== null && isCollector(draft, node.encounterId);

  draft.salt += (collector ? economy.saltPerCollector : economy.saltPerDebtor) + passives.saltPerWin;
  for (const trigger of passives.onCombatWon) applyRunTrigger(draft, trigger.effects);
  if (collector) for (const trigger of passives.onCollectorWon) applyRunTrigger(draft, trigger.effects);

  if (node.kind === 'boss') {
    // Phase 5 owns the win screen and the run summary. Reaching here is the act being over.
    draft.outcome = 'won';
    return;
  }

  pushCardOffer(draft, 'any', true);
  // §5.1: a Collector always drops a Token.
  if (collector) pushTokenOffer(draft, false);
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function settle(draft: Draft, uid: string): void {
  const card = cardAt(draft, uid);
  const markId = markIdFor(draft, card.cardId);
  if (!markId) throw new Error(`${card.cardId} Settles into nothing`);
  if (draft.marks.includes(markId)) throw new Error(`${markId} is already on the sheet`);
  if (draft.blockedMarks.includes(markId)) throw new Error(`${markId} was burned this run`);
  if (draft.marks.length >= markSlotsOf(draft)) throw new Error('no free Mark slot');

  dropCard(draft, uid);
  draft.marks = [...draft.marks, markId];
  log(draft, { k: 'card_settled', cardId: card.cardId, markId });
  for (const trigger of collectRunMods(runMods(draft)).onSettle) applyRunTrigger(draft, trigger.effects);
}

function grant(draft: Draft, item: ShopItem): void {
  switch (item.kind) {
    case 'card':
      if (item.refId) addCard(draft, item.refId);
      break;
    case 'token':
      if (item.refId) draft.tokens = [...draft.tokens, item.refId];
      break;
    case 'slot':
      draft.markSlots = Math.min(draft.content.maxMarkSlots, draft.markSlots + 1);
      break;
    case 'remove':
      pushDeckPick(draft, 'remove', { skippable: false, front: true });
      break;
  }
}

function markSold(draft: Draft, itemId: string): void {
  const prompt = draft.prompts.find((p) => p.k === 'shop');
  if (!prompt || prompt.k !== 'shop') return;
  const updated: RunPrompt = {
    k: 'shop',
    items: prompt.items.map((item) => (item.id === itemId ? { ...item, sold: true } : item)),
  };
  draft.prompts = draft.prompts.map((p) => (p === prompt ? updated : p));
}

function buy(draft: Draft, itemId: string, pay: 'salt' | 'cards'): void {
  const prompt = currentPrompt(draft);
  if (prompt?.k !== 'shop') throw new Error('not at a shop');
  const item = prompt.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`nothing on the shelf called ${itemId}`);
  if (item.sold) throw new Error(`${itemId} is already sold`);

  if (pay === 'cards') {
    if (item.cards === null) throw new Error(`${itemId} is not sold for paper`);
    if (removableUids(draft).length < item.cards) throw new Error('not enough paper to pay with');
    markSold(draft, itemId);
    draft.owed = { item, cardsLeft: item.cards };
    pushDeckPick(draft, 'remove', { skippable: false, front: true });
    return;
  }

  if (draft.salt < item.salt) throw new Error('not enough Salt');
  draft.salt -= item.salt;
  markSold(draft, itemId);

  // Counterfeit Sixpence. One purchase in six silently fails, and silently means the log
  // says nothing and the screen says nothing: you find out by not having the thing.
  const oneIn = collectRunMods(runMods(draft)).purchaseFailsOneIn;
  if (oneIn > 0 && roll(draft, 'rewards', oneIn) === 0) return;
  grant(draft, item);
}

function finishOwed(draft: Draft): void {
  const owed = draft.owed;
  if (!owed) return;
  const left = owed.cardsLeft - 1;
  if (left > 0) {
    draft.owed = { ...owed, cardsLeft: left };
    pushDeckPick(draft, 'remove', { skippable: false, front: true });
    return;
  }
  draft.owed = null;
  grant(draft, owed.item);
}

function answerDeckPick(draft: Draft, prompt: Extract<RunPrompt, { k: 'pick_deck_card' }>, uid: string): void {
  if (!prompt.uids.includes(uid)) throw new Error(`${uid} is not one of the choices`);
  pop(draft);

  switch (prompt.op) {
    case 'settle':
      settle(draft, uid);
      break;
    case 'remove': {
      const card = dropCard(draft, uid);
      log(draft, { k: 'card_removed', cardId: card.cardId });
      if (prompt.destroysMark) {
        const markId = markIdFor(draft, card.cardId);
        if (markId && !draft.blockedMarks.includes(markId)) draft.blockedMarks = [...draft.blockedMarks, markId];
      }
      finishOwed(draft);
      break;
    }
    case 'upgrade': {
      const card = cardAt(draft, uid);
      const next = upgradedId(card.cardId);
      if (!next) throw new Error(`${card.cardId} is already upgraded`);
      replaceCard(draft, uid, next);
      break;
    }
    case 'dip': {
      const card = cardAt(draft, uid);
      replaceCard(draft, uid, heavierId(upgradedId(card.cardId) ?? card.cardId));
      break;
    }
    case 'add_load':
      replaceCard(draft, uid, heavierId(cardAt(draft, uid).cardId));
      break;
  }
}

function answerWake(draft: Draft, prompt: Extract<RunPrompt, { k: 'wake' }>, id: string): void {
  const economy = draft.content.economy;
  switch (id) {
    case 'rest':
      pop(draft);
      heal(draft, Math.max(1, Math.round((draft.maxHp * economy.wakeHealPct) / 100)));
      break;
    case 'upgrade':
      if (!prompt.canUpgrade) throw new Error('nothing here can be upgraded');
      pop(draft);
      pushDeckPick(draft, 'upgrade', { skippable: false, front: true });
      break;
    case 'slot':
      if (draft.salt < economy.wakeSlotSalt) throw new Error('not enough Salt');
      if (markSlotsOf(draft) >= draft.content.maxMarkSlots) throw new Error('the sheet is full');
      pop(draft);
      draft.salt -= economy.wakeSlotSalt;
      draft.markSlots += 1;
      break;
    default:
      throw new Error(`a Wake has nothing called ${id}`);
  }
}

function answerHollow(draft: Draft, prompt: Extract<RunPrompt, { k: 'hollow' }>, id: string): void {
  const hollow = draft.content.hollows[prompt.hollowId];
  if (!hollow) throw new Error(`no Hollow called ${prompt.hollowId}`);
  const option = hollow.options.find((o) => o.id === id);
  if (!option) throw new Error(`${prompt.hollowId} has no option called ${id}`);
  if (!optionAvailable(draft, option)) throw new Error(`${id} is not available`);

  pop(draft);
  // Refusals go in the run log, per §12. Nothing reads it. Act 4 is built out of it.
  if (option.refusal) log(draft, { k: 'option_refused', eventId: hollow.id, optionId: option.id });
  for (const outcome of option.outcomes) applyRunEffect(draft, outcome);
}

function answer(draft: Draft, id: string, pay: 'salt' | 'cards' | undefined): void {
  const prompt = currentPrompt(draft);
  if (!prompt) throw new Error('nothing is being asked');

  switch (prompt.k) {
    case 'shop':
      buy(draft, id, pay ?? 'salt');
      break;
    case 'wake':
      answerWake(draft, prompt, id);
      break;
    case 'hollow':
      answerHollow(draft, prompt, id);
      break;
    case 'gain_card':
      if (!prompt.ids.includes(id)) throw new Error(`${id} was not on offer`);
      pop(draft);
      addCard(draft, id);
      break;
    case 'gain_token':
      if (!prompt.ids.includes(id)) throw new Error(`${id} was not on offer`);
      pop(draft);
      draft.tokens = [...draft.tokens, id];
      break;
    case 'pick_deck_card':
      answerDeckPick(draft, prompt, id);
      break;
  }
}

function decline(draft: Draft): void {
  const prompt = currentPrompt(draft);
  if (!prompt) throw new Error('nothing to decline');
  if (prompt.k === 'shop') {
    pop(draft);
    return;
  }
  if (prompt.k === 'wake' || prompt.k === 'hollow') throw new Error(`a ${prompt.k} has to be answered`);
  if (!prompt.skippable) throw new Error('that one is not optional');
  pop(draft);
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function runReduce(state: RunState, action: RunAction): RunState {
  if (state.outcome !== 'ongoing') return state;

  const draft = cloneRun(state);
  draft.actions = [...draft.actions, action];

  switch (action.k) {
    case 'travel': {
      if (draft.combat !== null) throw new Error('there is a fight on');
      if (draft.prompts.length > 0) throw new Error('answer the room first');
      if (!reachableFrom(draft.map, draft.at).includes(action.nodeId)) {
        throw new Error(`${action.nodeId} is not a step from here`);
      }
      draft.at = action.nodeId;
      draft.visited = [...draft.visited, action.nodeId];
      draft.lastCombat = null;
      enterNode(draft, nodeAt(draft.map, action.nodeId));
      break;
    }
    case 'combat': {
      const combat = draft.combat;
      const at = draft.at;
      if (!combat || at === null) throw new Error('no fight to act in');
      draft.combat = reduce(combat, action.action);
      if (draft.combat.outcome !== 'ongoing') finishCombat(draft, nodeAt(draft.map, at));
      break;
    }
    case 'answer':
      answer(draft, action.id, action.pay);
      break;
    case 'decline':
      decline(draft);
      break;
  }

  return draft;
}

// ---------------------------------------------------------------------------
// Save and resume
// ---------------------------------------------------------------------------

export function saveOf(state: RunState): RunSave {
  return { v: 1, seed: state.seed, actions: state.actions };
}

/**
 * A save file, played back.
 *
 * This is the whole of save and resume, and the reason the determinism rules in the brief
 * were worth insisting on up front. Mid-combat is not a special case: a combat action is an
 * action, so a run reopened halfway through a fight against the Chalk Hound lands on the
 * same beat, the same hand and the same shuffle it left on.
 */
export function replayRun(content: RunContent, save: RunSave): RunState {
  let state = createRun(content, save.seed);
  for (const action of save.actions) state = runReduce(state, action);
  return state;
}

/** Every deck card as `{ uid, def }`, for the deck viewer and the sheet. */
export function deckView(state: RunState): { uid: string; cardId: string; def: CardDef }[] {
  return state.deck.flatMap((card) => {
    const def = state.library[card.cardId];
    return def ? [{ uid: card.uid, cardId: card.cardId, def }] : [];
  });
}
