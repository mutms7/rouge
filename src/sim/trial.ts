/**
 * One combat, played to a conclusion by the heuristic policy.
 *
 * Phase 2's sim measures *combats*, not runs: each trial starts the player at full HP with
 * a plausible deck and drops them in front of one encounter. That isolates the numbers the
 * phase actually asks about (win rate per enemy, beats, damage taken) from the run-level
 * noise of how bruised you happened to arrive. Phase 5 extends this to whole runs, where
 * arriving at 40% HP is the interesting part.
 */
import { createCombat, reduce } from '../engine/combat';
import { ENCOUNTERS } from '../content/enemies';
import { CARD_LIBRARY, deckLoad, fightSetup } from '../content/library';
import { DRAFTABLE_IDS } from '../content/cards';
import { WICK } from '../content/run';
import { makeRng, nextInt } from '../engine/rng';
import { lapOf } from '../engine/tally';
import type { CombatState, Outcome } from '../engine/types';
import { chooseAction } from './policy';

/**
 * A combat that needs more actions than this has the policy stuck in a loop, which is a
 * finding rather than a crash. Reported as a timeout so it cannot hide inside a win rate.
 */
const MAX_ACTIONS = 2000;

export type TrialResult = {
  readonly encounterId: string;
  readonly outcome: Outcome | 'timeout';
  readonly beats: number;
  readonly laps: number;
  readonly damageTaken: number;
  readonly hpLeft: number;
  readonly actions: number;
  readonly deck: readonly string[];
  readonly deckLoad: number;
  /** Card id -> times drawn into hand. */
  readonly drawn: Readonly<Record<string, number>>;
  /** Card id -> times played. */
  readonly played: Readonly<Record<string, number>>;
};

/**
 * How many cards the player has picked up by the time they meet this fight.
 *
 * Act 1 is 12 nodes, so a normal fight is early and the boss is at the end of a draft.
 * Rough on purpose: the point is that the boss is not fought with a starter deck.
 */
const EXTRA_CARDS: Record<string, number> = { normal: 2, collector: 5, boss: 8 };

export function buildDeck(seed: number, extra: number): string[] {
  const deck = [...WICK.deck];
  let rng = makeRng(seed, 'rewards');
  for (let i = 0; i < extra; i += 1) {
    const [index, next] = nextInt(rng, DRAFTABLE_IDS.length);
    rng = next;
    const id = DRAFTABLE_IDS[index];
    if (id !== undefined) deck.push(id);
  }
  return deck;
}

function tally(log: CombatState['log'], playerId: string): { damage: number; drawn: Record<string, number> } {
  let damage = 0;
  const drawn: Record<string, number> = {};
  for (const entry of log) {
    const event = entry.event;
    if (event.k === 'damage' && event.who === playerId) damage += event.amount - event.blocked;
    if (event.k === 'draw' || event.k === 'echo') drawn[event.cardId] = (drawn[event.cardId] ?? 0) + 1;
  }
  return { damage, drawn };
}

export function runTrial(encounterId: string, seed: number): TrialResult {
  const encounter = ENCOUNTERS.find((e) => e.id === encounterId);
  if (!encounter) throw new Error(`no encounter called ${encounterId}`);

  const deck = buildDeck(seed, EXTRA_CARDS[encounter.tier] ?? 0);
  let state = createCombat(fightSetup({ seed, encounterId, deck }));

  const played: Record<string, number> = {};
  let actions = 0;
  let timedOut = false;

  while (state.outcome === 'ongoing') {
    if (actions >= MAX_ACTIONS) {
      timedOut = true;
      break;
    }
    const action = chooseAction(state);
    if (!action) break;
    if (action.k === 'play_card') {
      const instance = state.deck.hand.find((c) => c.uid === action.uid);
      if (instance) played[instance.cardId] = (played[instance.cardId] ?? 0) + 1;
    }
    state = reduce(state, action);
    actions += 1;
  }

  const player = state.combatants.find((c) => c.team === 'player');
  const { damage, drawn } = tally(state.log, player?.id ?? 'player');

  return {
    encounterId,
    outcome: timedOut ? 'timeout' : state.outcome,
    beats: state.beat,
    laps: lapOf(state.beat),
    damageTaken: damage,
    hpLeft: player?.hp ?? 0,
    actions,
    deck,
    deckLoad: deckLoad(deck),
    drawn,
    played,
  };
}

/** Every card the sim could ever see. Used to report cards that were never picked. */
export const ALL_CARD_IDS: readonly string[] = Object.keys(CARD_LIBRARY).sort();
