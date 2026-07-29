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
  ActiveBoon,
  CardInstance,
  CombatEvent,
  CombatState,
  Combatant,
  Countable,
  LogEntry,
  PendingPerjury,
  RunLogEntry,
  ScheduledEffect,
  Ward,
} from './types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DraftCombatant = Mutable<Combatant>;

type DraftArrays =
  | 'combatants'
  | 'deck'
  | 'pending'
  | 'scheduled'
  | 'nextAction'
  | 'log'
  | 'runLog'
  | 'rng'
  | 'boons'
  | 'wards'
  | 'spent'
  | 'activeMarkIds'
  | 'stampedMarks';

export type Draft = Mutable<Omit<CombatState, DraftArrays>> & {
  combatants: DraftCombatant[];
  deck: {
    draw: CardInstance[];
    hand: CardInstance[];
    discard: CardInstance[];
    exhausted: CardInstance[];
  };
  pending: PendingPerjury[];
  scheduled: ScheduledEffect[];
  nextAction: ScheduledEffect[];
  log: LogEntry[];
  runLog: RunLogEntry[];
  rng: Record<RngStream, Rng>;
  boons: ActiveBoon[];
  wards: Ward[];
  spent: string[];
  activeMarkIds: string[];
  stampedMarks: string[];
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
    scheduled: [...state.scheduled],
    nextAction: [...state.nextAction],
    rng: { ...state.rng },
    log: [...state.log],
    runLog: [...state.runLog],
    outcome: state.outcome,
    awaiting: state.awaiting,
    library: state.library,
    uidSeq: state.uidSeq,
    salt: state.salt,
    intentHorizon: state.intentHorizon,
    intentsRevealed: state.intentsRevealed,
    boons: [...state.boons],
    lastPlayed: state.lastPlayed,
    cardsThisLap: state.cardsThisLap,
    cardsPlayed: state.cardsPlayed,
    lastPlayBeat: state.lastPlayBeat,
    wards: [...state.wards],
    spent: [...state.spent],
    activeMarkIds: [...state.activeMarkIds],
    stampedMarks: [...state.stampedMarks],
    deckLoad: state.deckLoad,
    interestPeriod: state.interestPeriod,
    interestNextBeat: state.interestNextBeat,
    interestLoad: state.interestLoad,
    countersignCancelledLap: state.countersignCancelledLap,
    markMods: state.markMods,
    basePlayerMods: state.basePlayerMods,
    compoundIds: [...state.compoundIds],
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

/** Whether a card id is one of Interest's little gifts. Compounds are unplayable junk. */
export function isCompound(draft: Draft, cardId: string): boolean {
  return draft.compoundIds.includes(cardId);
}

/**
 * What the scaling cards count.
 *
 * All of them are "N per X", so there is one place that knows what X means and one atom
 * that uses it, rather than a bespoke function per card.
 */
export function countOf(draft: Draft, per: Countable): number {
  switch (per) {
    case 'discard':
      return draft.deck.discard.length;
    case 'draw_pile':
      return draft.deck.draw.length;
    case 'hand':
      return draft.deck.hand.length;
    case 'exhausted':
      return draft.deck.exhausted.length;
    case 'compounds_in_discard':
      return draft.deck.discard.filter((c) => isCompound(draft, c.cardId)).length;
    case 'compounds_in_hand':
      return draft.deck.hand.filter((c) => isCompound(draft, c.cardId)).length;
    case 'missing_hp': {
      const player = playerOf(draft);
      return player ? player.maxHp - player.hp : 0;
    }
    case 'salt':
      return draft.salt;
  }
}

/** Once-only bookkeeping. Returns true the first time it is asked about a given key. */
export function claimOnce(draft: Draft, key: string): boolean {
  if (draft.spent.includes(key)) return false;
  draft.spent.push(key);
  return true;
}
