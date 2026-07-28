/**
 * How the reducer stays pure without drowning in spread syntax.
 *
 * `reduce` clones the state once on the way in, hands the clone to the internals as a
 * `Draft`, lets them mutate it freely, and returns it. The caller's state is never
 * touched, which is the property that actually matters, and the internals read like
 * ordinary code instead of nested object literals. No Immer, no dependency.
 *
 * The clone is shallow where it can afford to be: card instances, log entries, pending
 * perjuries and Rng tuples are immutable by contract, so only the arrays holding them
 * get copied. Combatants are the one thing that changes in place.
 */
import type { Rng, RngStream } from './rng';
import type {
  CardInstance,
  CombatEvent,
  CombatState,
  Combatant,
  LogEntry,
  PendingPerjury,
  RunLogEntry,
} from './types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DraftCombatant = Mutable<Combatant>;

export type Draft = Mutable<Omit<CombatState, 'combatants' | 'deck' | 'pending' | 'log' | 'runLog' | 'rng'>> & {
  combatants: DraftCombatant[];
  deck: {
    draw: CardInstance[];
    hand: CardInstance[];
    discard: CardInstance[];
    exhausted: CardInstance[];
  };
  pending: PendingPerjury[];
  log: LogEntry[];
  runLog: RunLogEntry[];
  rng: Record<RngStream, Rng>;
};

export function cloneState(state: CombatState): Draft {
  return {
    seed: state.seed,
    beat: state.beat,
    combatants: state.combatants.map((c) => ({ ...c })),
    deck: {
      draw: [...state.deck.draw],
      hand: [...state.deck.hand],
      discard: [...state.deck.discard],
      exhausted: [...state.deck.exhausted],
    },
    strain: state.strain,
    handCap: state.handCap,
    pending: [...state.pending],
    rng: { ...state.rng },
    log: [...state.log],
    runLog: [...state.runLog],
    outcome: state.outcome,
    awaiting: state.awaiting,
    library: state.library,
    uidSeq: state.uidSeq,
  };
}

export function byId(draft: Draft, id: string): DraftCombatant | null {
  return draft.combatants.find((c) => c.id === id) ?? null;
}

export function playerOf(draft: Draft): DraftCombatant | null {
  return draft.combatants.find((c) => c.team === 'player') ?? null;
}

/** Append to the combat log. Defaults to the current beat, which is nearly always right. */
export function emit(draft: Draft, event: CombatEvent, beat: number = draft.beat): void {
  draft.log.push({ beat, event });
}

/** Fresh id for anything that needs one mid-combat: echo copies, sworn perjuries. */
export function nextUid(draft: Draft, prefix: string): string {
  draft.uidSeq += 1;
  return `${prefix}${draft.uidSeq}`;
}
