/**
 * The terminal run summary, kept pure so it can be checked without a DOM.
 *
 * A RunState stores card instances, while a player reads card names and counts. The
 * run log is the source of truth for which card paid for each Mark; using the final deck
 * alone would lose that history as soon as the card was Settled.
 */
import { MARKS } from '../../content/marks';
import type { RunState } from '../../engine/runtypes';
import { strings } from '../strings';

export type SummaryCard = {
  readonly id: string;
  readonly name: string;
  readonly count: number;
};

export type SummaryMark = {
  readonly id: string;
  readonly name: string;
  readonly settled: readonly SummaryCard[];
};

function cardName(run: RunState, cardId: string): string {
  return run.library[cardId]?.name ?? strings.run.overUnknownCard(cardId);
}

function markName(markId: string): string {
  return MARKS[markId]?.name ?? strings.run.overUnknownMark(markId);
}

function countCards(ids: readonly string[], nameOf: (id: string) => string): SummaryCard[] {
  const out: SummaryCard[] = [];
  for (const id of ids) {
    const name = nameOf(id);
    const found = out.find((entry) => entry.id === id);
    if (found) {
      const index = out.indexOf(found);
      out[index] = { ...found, count: found.count + 1 };
    } else {
      out.push({ id, name, count: 1 });
    }
  }
  return out;
}

/** Group the exact ended deck by card id, preserving its first-seen order. */
export function endedDeckSummary(run: RunState): SummaryCard[] {
  return countCards(
    run.deck.map((card) => card.cardId),
    (id) => cardName(run, id),
  );
}

/**
 * Include final Marks even when an older save has no settlement log, then attach every
 * card recorded by `card_settled` to the corresponding Mark.
 */
export function acquiredMarksSummary(run: RunState): SummaryMark[] {
  const order: string[] = [...run.marks];
  const settledByMark = new Map<string, string[]>();

  for (const entry of run.runLog) {
    if (entry.k !== 'card_settled') continue;
    if (!order.includes(entry.markId)) order.push(entry.markId);
    const settled = settledByMark.get(entry.markId) ?? [];
    settled.push(entry.cardId);
    settledByMark.set(entry.markId, settled);
  }

  return order.map((id) => ({
    id,
    name: markName(id),
    settled: countCards(settledByMark.get(id) ?? [], (cardId) => cardName(run, cardId)),
  }));
}

