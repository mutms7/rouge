/**
 * A deterministic whole-Act-1 simulation.
 *
 * The run reducer owns map generation, prompts, rewards and combat bookkeeping. This
 * driver deliberately does not reach around it: every step is a `RunAction` returned by
 * `legalRunActions`, and every fight action is the same `chooseAction` heuristic used by
 * the isolated-combat harness.
 */
import { RUN_CONTENT } from '../content/library';
import {
  createRun,
  currentPrompt,
  deckLoadOf,
  legalRunActions,
  runReduce,
} from '../engine/run';
import type { RunAction, RunContent, RunPrompt, RunState } from '../engine/runtypes';
import type { CardDef, CombatEvent } from '../engine/types';
import { chooseAction } from './policy';
import { cardDefence, cardOffence, cardValue, defenceCount, offenceCount } from './value';

/** Caps are findings, not silent hangs. A run can still be reported as a timeout. */
export const MAX_RUN_ACTIONS = 100_000;
export const MAX_RUN_COMBAT_ACTIONS = 5_000;

export type RunCombatResult = {
  readonly nodeId: string;
  readonly encounterId: string;
  readonly outcome: 'won' | 'lost' | 'timeout';
  readonly beats: number;
  readonly actions: number;
  readonly damageTaken: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly deckLoad: number;
  readonly interestEvents: number;
  readonly interestCompounds: number;
  readonly interestPeriod: number;
  readonly played: Readonly<Record<string, number>>;
  /** Number of combats in which the card was played at least once. */
  readonly playAppearances: Readonly<Record<string, number>>;
  /** Number of those combat appearances that ended in a win. */
  readonly playWins: Readonly<Record<string, number>>;
};

export type RunResult = {
  readonly seed: number;
  readonly outcome: 'won' | 'lost' | 'timeout';
  /** Number of map nodes visited, including a node where a run dies. */
  readonly depth: number;
  readonly actions: number;
  readonly combats: readonly RunCombatResult[];
  readonly totalCombatBeats: number;
  readonly totalDamageTaken: number;
  readonly hpCurve: readonly number[];
  /**
   * HP on arrival at the nth node visited, index 0 being the first node.
   *
   * Per-fight HP hides where a run actually dies, because the Wake and the Hollows sit between
   * the fights and are half the HP economy. Per node is the curve the brief asks for.
   */
  readonly hpAtDepth: readonly number[];
  readonly interestEvents: number;
  readonly interestCompounds: number;
  readonly finalDeckLoad: number;
  readonly finalDeckSize: number;
  /**
   * Times the card was on a reward screen or a shop shelf.
   *
   * The denominator "never picked" needs. Without it a zero in the picked column could mean
   * the policy passed on the card forty times or that the draft never offered it once, and
   * those are opposite findings.
   */
  readonly offered: Readonly<Record<string, number>>;
  readonly picked: Readonly<Record<string, number>>;
  /** Number of runs in which the card was picked at least once. */
  readonly pickAppearances: Readonly<Record<string, number>>;
  /** Number of picked runs that won the Act. */
  readonly pickWins: Readonly<Record<string, number>>;
  readonly played: Readonly<Record<string, number>>;
  readonly playAppearances: Readonly<Record<string, number>>;
  readonly playWins: Readonly<Record<string, number>>;
  readonly timeoutAt: string | null;
};

function addCount(target: Record<string, number>, id: string, n = 1): void {
  target[id] = (target[id] ?? 0) + n;
}

function eventOf(entry: { readonly event: CombatEvent }): CombatEvent {
  return entry.event;
}

function effectValue(prompt: Extract<RunPrompt, { k: 'hollow' }>, state: RunState, id: string): number {
  const event = state.content.hollows[prompt.hollowId];
  const option = event?.options.find((candidate) => candidate.id === id);
  if (!option) return Number.NEGATIVE_INFINITY;
  let value = option.refusal ? -10 : 0;
  for (const outcome of option.outcomes) {
    switch (outcome.k) {
      case 'gain_card':
      case 'gain_token':
        value += 30 * outcome.n;
        break;
      case 'gain_salt':
        value += outcome.n / 4;
        break;
      case 'heal':
      case 'gain_mark_slot':
        value += outcome.n * 2;
        break;
      case 'lose_hp':
      case 'lose_max_hp':
        value -= outcome.n * 4;
        break;
      case 'remove_card':
        value += outcome.n * 8;
        break;
      default:
        break;
    }
  }
  return value;
}

/**
 * Attacks the policy will not trade away.
 *
 * A greedy policy that ranks removals by Weight sells its Paper Cuts first, arrives at the
 * Bailiff holding six Guard cards, and then out-blocks the fight for two thousand actions
 * without ever winning it. That is not a balance finding, it is a policy that cannot lose
 * and cannot win, and it poisons every number in the table. Offence is a floor.
 */
const OFFENCE_FLOOR = 3;

/**
 * And the same floor from the other side.
 *
 * Rate cards by value alone and Flinch is the worst card Wick owns, so the policy sheds all
 * three of them, walks into the Bailiff with eleven attacks and no Guard, and dies on beat
 * twelve. Both floors exist to stop the policy from answering a balance question with a
 * degenerate deck.
 */
const DEFENCE_FLOOR = 2;

/**
 * Deck size the policy will not pay an Assay past, when paying in paper.
 *
 * Trading a junk card for a better card is good play and stays allowed. Buying a Token for
 * two cards, four times in a row, is how a ten-card deck becomes a six-card deck that cannot
 * kill anything.
 */
const PAPER_FLOOR = 9;

function deckDefs(state: RunState): CardDef[] {
  return state.deck.flatMap((card) => {
    const def = state.library[card.cardId];
    return def ? [def] : [];
  });
}

/** Ranked by willingness to part with the card: higher means "take this one". */
function shedScore(state: RunState, def: CardDef): number {
  if (def.playable === false) return 10_000;
  const defs = deckDefs(state);
  const score = -cardValue(def);
  const lastAttack = cardOffence(def) > 0 && offenceCount(defs) <= OFFENCE_FLOOR;
  const lastGuard = cardDefence(def) > 0 && defenceCount(defs) <= DEFENCE_FLOOR;
  return lastAttack || lastGuard ? score - 100 : score;
}

function cardChoiceScore(state: RunState, prompt: Extract<RunPrompt, { k: 'pick_deck_card' }>, uid: string): number {
  const card = state.deck.find((candidate) => candidate.uid === uid);
  if (!card) return Number.NEGATIVE_INFINITY;
  const def = state.library[card.cardId];
  if (!def) return 0;
  switch (prompt.op) {
    // Both hand a card over. Settling pays a Mark for it, removal pays nothing, and either
    // way the card to give up is the one doing the least work.
    case 'remove':
    case 'settle':
      return shedScore(state, def);
    // An upgrade, and the Weighing Room's heavier upgrade, want to land on a card you will
    // actually draw and play.
    case 'upgrade':
    case 'dip':
      return cardValue(def);
    // Pure penalty. Put the extra Load on whatever is already carrying the least.
    case 'add_load':
      return -cardValue(def);
  }
}

/** Stable greedy policy for every layer above combat. */
export function chooseRunAction(state: RunState): RunAction | null {
  if (state.combat !== null) {
    const action = chooseAction(state.combat);
    return action ? { k: 'combat', action } : null;
  }

  const legal = legalRunActions(state);
  if (legal.length === 0) return null;
  const prompt = currentPrompt(state);
  if (!prompt) {
    // `legalRunActions` is already left-to-right and the map guarantees every branch reaches
    // the boss. Preserve that order as the final deterministic tie-break.
    return legal[0] ?? null;
  }

  if (prompt.k === 'shop') {
    const defs = deckDefs(state);
    const worst = [...defs].sort((a, b) => shedScore(state, b) - shedScore(state, a));
    /** Whether a paper price is worth paying, and whether the deck can stand to pay it. */
    const paperIsWorthIt = (item: (typeof prompt.items)[number]): boolean => {
      if (item.cards === null) return false;
      if (state.deck.length - item.cards < PAPER_FLOOR) return false;
      // A card bought in paper has to beat the cards it costs, or the trade is a downgrade
      // wearing a purchase's clothes. Tokens and slots cost paper and add none back, so they
      // are only worth it while the deck is fat, which the floor above already decides.
      if (item.kind !== 'card') return true;
      const bought = item.refId ? state.library[item.refId] : undefined;
      if (!bought) return false;
      const given = worst.slice(0, item.cards);
      return given.every((def) => cardValue(bought) > cardValue(def));
    };

    const rank = (action: RunAction): number => {
      if (action.k !== 'answer') return Number.NEGATIVE_INFINITY;
      const item = prompt.items.find((candidate) => candidate.id === action.id);
      if (!item) return Number.NEGATIVE_INFINITY;
      if (action.pay === 'cards' && !paperIsWorthIt(item)) return Number.NEGATIVE_INFINITY;
      // A card is the best long-term action, then a Token, then a Mark slot. A purchase paid
      // in Salt wins ties over paying with paper, which avoids accidentally hollowing the deck.
      const kind = item.kind === 'card' ? 40 : item.kind === 'token' ? 30 : item.kind === 'slot' ? 20 : 10;
      return kind + (action.pay === 'salt' ? 1 : 0);
    };
    const best = legal
      .filter((action) => action.k === 'answer')
      .reduce<RunAction | null>((current, candidate) => {
        if (rank(candidate) === Number.NEGATIVE_INFINITY) return current;
        if (!current || rank(candidate) > rank(current)) return candidate;
        return current;
      }, null);
    return best ?? legal.find((action) => action.k === 'decline') ?? legal[0] ?? null;
  }

  if (prompt.k === 'hollow') {
    return legal.reduce<RunAction | null>((current, candidate) => {
      if (candidate.k !== 'answer') return current;
      if (!current || current.k !== 'answer') return candidate;
      return effectValue(prompt, state, candidate.id) > effectValue(prompt, state, current.id) ? candidate : current;
    }, null) ?? legal[0] ?? null;
  }

  if (prompt.k === 'wake') {
    const playerFraction = state.hp / Math.max(1, state.maxHp);
    // Heal when bruised; otherwise upgrade the first playable card. A slot is useful but
    // should not strand the run without Salt for cards or Hollows.
    const preferred = playerFraction < 0.75 ? 'rest' : legal.some((a) => a.k === 'answer' && a.id === 'upgrade') ? 'upgrade' : 'rest';
    return legal.find((action) => action.k === 'answer' && action.id === preferred) ?? legal[0] ?? null;
  }

  if (prompt.k === 'pick_deck_card') {
    const choices = legal.filter((action) => action.k === 'answer');
    const best = choices.reduce<RunAction | null>((current, candidate) => {
      if (candidate.k !== 'answer') return current;
      if (!current || current.k !== 'answer') return candidate;
      return cardChoiceScore(state, prompt, candidate.id) > cardChoiceScore(state, prompt, current.id) ? candidate : current;
    }, null);
    return best ?? legal.find((action) => action.k === 'decline') ?? legal[0] ?? null;
  }

  // A reward is always accepted. *Which* one it accepts has to be a judgement rather than
  // "whichever the map listed first", or the pick table measures offer order instead of card
  // quality and "never picked" stops meaning anything.
  if (prompt.k === 'gain_card') {
    const best = legal.reduce<RunAction | null>((current, candidate) => {
      if (candidate.k !== 'answer') return current;
      if (!current || current.k !== 'answer') return candidate;
      const value = (id: string) => {
        const def = state.library[id];
        return def ? cardValue(def) : Number.NEGATIVE_INFINITY;
      };
      return value(candidate.id) > value(current.id) ? candidate : current;
    }, null);
    return best ?? legal[0] ?? null;
  }

  // Tokens are Marks, not cards, and the value model above has nothing to say about them.
  // First offered, deterministically.
  if (prompt.k === 'gain_token') {
    return legal.find((action) => action.k === 'answer') ?? legal[0] ?? null;
  }

  return legal[0] ?? null;
}

function capturePromptPick(state: RunState, action: RunAction, picked: Record<string, number>): void {
  if (action.k !== 'answer') return;
  const prompt = currentPrompt(state);
  if (!prompt) return;
  if (prompt.k === 'gain_card' && prompt.ids.includes(action.id)) addCount(picked, action.id);
  if (prompt.k === 'shop') {
    const item = prompt.items.find((candidate) => candidate.id === action.id);
    if (item?.kind === 'card' && item.refId) addCount(picked, item.refId);
  }
}

/**
 * Every card this prompt put in front of the player, counted once per screen.
 *
 * A shop is one shelf the player walks past once, even though buying from it re-pushes the
 * prompt; counting per action would inflate a shop's stock by however many things got bought.
 */
function captureOffers(state: RunState, offered: Record<string, number>, seenShops: Set<string>): void {
  const prompt = currentPrompt(state);
  if (!prompt) return;
  if (prompt.k === 'gain_card') {
    for (const id of prompt.ids) addCount(offered, id);
    return;
  }
  if (prompt.k === 'shop') {
    const key = `${state.at ?? ''}:${prompt.items.map((item) => item.id).join(',')}`;
    if (seenShops.has(key)) return;
    seenShops.add(key);
    for (const item of prompt.items) {
      if (item.kind === 'card' && item.refId) addCount(offered, item.refId);
    }
  }
}

function combatResult(
  state: RunState,
  nodeId: string,
  encounterId: string,
  hpBefore: number,
  actions: number,
  timedOut: boolean,
): RunCombatResult {
  // A timeout leaves `state.combat` active; `lastCombat` is the previous finished fight.
  // Reading the latter silently reports stale beats, damage and cards for the timeout.
  const combat = timedOut ? state.combat ?? state.lastCombat : state.lastCombat ?? state.combat;
  const log = combat?.log ?? [];
  const playerId = state.content.character.id;
  const damageTaken = log.reduce((total, entry) => {
    const event = eventOf(entry);
    return event.k === 'damage' && event.who === playerId ? total + Math.max(0, event.amount - event.blocked) : total;
  }, 0);
  const interest = log.reduce(
    (total, entry) => {
      const event = eventOf(entry);
      if (event.k !== 'interest') return total;
      total.events += 1;
      total.compounds += event.count;
      return total;
    },
    { events: 0, compounds: 0 },
  );
  const played: Record<string, number> = {};
  for (const entry of log) {
    const event = eventOf(entry);
    if (event.k === 'act' && event.who === playerId && event.what !== 'wait' && event.what !== 'discard_compound') {
      addCount(played, event.what);
    }
  }
  const won = !timedOut && combat?.outcome === 'won';
  const playAppearances: Record<string, number> = {};
  const playWins: Record<string, number> = {};
  for (const id of Object.keys(played)) {
    playAppearances[id] = 1;
    if (won) playWins[id] = 1;
  }
  const combatPlayer = combat?.combatants.find((combatant) => combatant.team === 'player');

  return {
    nodeId,
    encounterId,
    outcome: timedOut ? 'timeout' : combat?.outcome === 'won' ? 'won' : 'lost',
    beats: combat?.beat ?? 0,
    actions,
    damageTaken,
    hpBefore,
    hpAfter: combatPlayer?.hp ?? state.hp,
    deckLoad: combat?.deckLoad ?? deckLoadOf(state),
    interestEvents: interest.events,
    interestCompounds: interest.compounds,
    interestPeriod: combat?.interestPeriod ?? 0,
    played,
    playAppearances,
    playWins,
  };
}

export function runWhole(
  seed: number,
  options?: {
    readonly maxActions?: number;
    readonly maxCombatActions?: number;
    /**
     * Alternate content, for asking "what would this number do" without editing the act.
     *
     * Phase 6 is a conversation about numbers, and a conversation needs both sides of the
     * table before anything is applied. A balance experiment that has to edit `enemies.ts`
     * to run is one that gets committed by accident.
     */
    readonly content?: RunContent;
  },
): RunResult {
  const maxActions = options?.maxActions ?? MAX_RUN_ACTIONS;
  const maxCombatActions = options?.maxCombatActions ?? MAX_RUN_COMBAT_ACTIONS;
  let state = createRun(options?.content ?? RUN_CONTENT, seed);
  const combats: RunCombatResult[] = [];
  const hpCurve: number[] = [state.hp];
  const hpAtDepth: number[] = [];
  const offered: Record<string, number> = {};
  const seenShops = new Set<string>();
  const picked: Record<string, number> = {};
  const pickAppearances: Record<string, number> = {};
  const pickWins: Record<string, number> = {};
  const played: Record<string, number> = {};
  const playAppearances: Record<string, number> = {};
  const playWins: Record<string, number> = {};
  let timeoutAt: string | null = null;
  let timedOut = false;
  let actions = 0;

  while (state.outcome === 'ongoing' && actions < maxActions) {
    if (state.combat !== null) {
      const nodeId = state.at ?? '';
      const encounterId = state.map.nodes[nodeId]?.encounterId ?? 'unknown';
      const hpBefore = state.hp;
      let combatActions = 0;
      while (state.combat !== null && state.outcome === 'ongoing') {
        if (combatActions >= maxCombatActions || actions >= maxActions) {
          timedOut = true;
          timeoutAt = encounterId;
          break;
        }
        const action = chooseAction(state.combat);
        if (!action) {
          timedOut = true;
          timeoutAt = encounterId;
          break;
        }
        state = runReduce(state, { k: 'combat', action });
        actions += 1;
        combatActions += 1;
      }
      const result = combatResult(state, nodeId, encounterId, hpBefore, combatActions, timedOut);
      combats.push(result);
      for (const [id, count] of Object.entries(result.played)) addCount(played, id, count);
      for (const [id, count] of Object.entries(result.playAppearances)) addCount(playAppearances, id, count);
      for (const [id, count] of Object.entries(result.playWins)) addCount(playWins, id, count);
      // A timeout leaves the combat active, so RunState.hp is still the HP banked before
      // entering this fight. `combatResult` already derives the live player's HP from the
      // active board (or the banked run state after a finished fight).
      hpCurve.push(result.hpAfter);
      if (timedOut) break;
      continue;
    }

    const action = chooseRunAction(state);
    if (!action) {
      timedOut = true;
      timeoutAt = state.at;
      break;
    }
    captureOffers(state, offered, seenShops);
    capturePromptPick(state, action, picked);
    state = runReduce(state, action);
    actions += 1;
    // Travelling is the only thing that grows `visited`, and a fight created by arriving keeps
    // its own copy of the player, so run HP here is still the HP the node was entered with.
    if (state.visited.length > hpAtDepth.length) hpAtDepth.push(state.hp);
  }

  if (state.outcome === 'ongoing' && !timedOut) {
    timedOut = true;
    timeoutAt = state.at;
  }

  const outcome: RunResult['outcome'] = timedOut ? 'timeout' : state.outcome === 'won' ? 'won' : 'lost';
  for (const id of Object.keys(picked)) {
    pickAppearances[id] = 1;
    if (outcome === 'won') pickWins[id] = 1;
  }
  return {
    seed,
    outcome,
    depth: state.visited.length,
    actions,
    combats,
    totalCombatBeats: combats.reduce((total, combat) => total + combat.beats, 0),
    totalDamageTaken: combats.reduce((total, combat) => total + combat.damageTaken, 0),
    hpCurve,
    hpAtDepth,
    interestEvents: combats.reduce((total, combat) => total + combat.interestEvents, 0),
    interestCompounds: combats.reduce((total, combat) => total + combat.interestCompounds, 0),
    finalDeckLoad: deckLoadOf(state),
    finalDeckSize: state.deck.length,
    offered,
    picked,
    pickAppearances,
    pickWins,
    played,
    playAppearances,
    playWins,
    timeoutAt,
  };
}

/** Alias used by callers that want to make the whole-run intent explicit. */
export const runTrialWhole = runWhole;
