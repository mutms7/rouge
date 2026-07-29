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
import type { RunAction, RunPrompt, RunState } from '../engine/runtypes';
import type { CombatEvent } from '../engine/types';
import { chooseAction } from './policy';

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
  readonly interestEvents: number;
  readonly interestCompounds: number;
  readonly finalDeckLoad: number;
  readonly finalDeckSize: number;
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

function cardChoiceScore(state: RunState, prompt: Extract<RunPrompt, { k: 'pick_deck_card' }>, uid: string): number {
  const card = state.deck.find((candidate) => candidate.uid === uid);
  if (!card) return Number.NEGATIVE_INFINITY;
  const def = state.library[card.cardId];
  if (!def) return 0;
  if (prompt.op === 'remove') {
    // Compounds and other unplayable cards are pure liability. Among live cards, remove
    // the heaviest one first to keep the Interest curve under control.
    return (def.playable === false ? 10_000 : 0) + def.weight;
  }
  if (prompt.op === 'settle') return -def.weight;
  return -def.weight;
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
    const affordable = legal.filter((action) => action.k === 'answer');
    const rank = (action: RunAction): number => {
      if (action.k !== 'answer') return Number.NEGATIVE_INFINITY;
      const item = prompt.items.find((candidate) => candidate.id === action.id);
      if (!item) return Number.NEGATIVE_INFINITY;
      // A card is the best long-term action, then a Token, then a Mark slot. A purchase paid
      // in Salt wins ties over paying with paper, which avoids accidentally hollowing the deck.
      const kind = item.kind === 'card' ? 40 : item.kind === 'token' ? 30 : item.kind === 'slot' ? 20 : 10;
      return kind + (action.pay === 'salt' ? 1 : 0);
    };
    const best = affordable.reduce<RunAction | null>((current, candidate) => {
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

  // Rewards are always accepted, and the first offered id is the deterministic tie-break.
  if (prompt.k === 'gain_card' || prompt.k === 'gain_token') {
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

export function runWhole(seed: number, options?: { readonly maxActions?: number; readonly maxCombatActions?: number }): RunResult {
  const maxActions = options?.maxActions ?? MAX_RUN_ACTIONS;
  const maxCombatActions = options?.maxCombatActions ?? MAX_RUN_COMBAT_ACTIONS;
  let state = createRun(RUN_CONTENT, seed);
  const combats: RunCombatResult[] = [];
  const hpCurve: number[] = [state.hp];
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
    capturePromptPick(state, action, picked);
    state = runReduce(state, action);
    actions += 1;
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
    interestEvents: combats.reduce((total, combat) => total + combat.interestEvents, 0),
    interestCompounds: combats.reduce((total, combat) => total + combat.interestCompounds, 0),
    finalDeckLoad: deckLoadOf(state),
    finalDeckSize: state.deck.length,
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
