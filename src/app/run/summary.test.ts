import { describe, expect, it } from 'vitest';
import { RUN_CONTENT } from '../../content/library';
import { createRun } from '../../engine/run';
import { acquiredMarksSummary, endedDeckSummary } from './summary';

describe('terminal run summary helpers', () => {
  it('counts the exact ended deck by card id in first-seen order', () => {
    const base = createRun(RUN_CONTENT, 7);
    const run = {
      ...base,
      deck: [
        { uid: 'a', cardId: 'paper_cut' },
        { uid: 'b', cardId: 'flinch' },
        { uid: 'c', cardId: 'paper_cut' },
      ],
    };

    expect(endedDeckSummary(run)).toEqual([
      { id: 'paper_cut', name: 'Paper Cut', count: 2 },
      { id: 'flinch', name: 'Flinch', count: 1 },
    ]);
  });

  it('links every Settled card to its acquired Mark and keeps final marks without a log', () => {
    const base = createRun(RUN_CONTENT, 8);
    const run = {
      ...base,
      marks: ['whetted', 'braced'],
      runLog: [
        { k: 'card_settled' as const, cardId: 'paper_cut', markId: 'whetted' },
        { k: 'card_settled' as const, cardId: 'flinch', markId: 'braced' },
      ],
    };

    expect(acquiredMarksSummary(run)).toEqual([
      { id: 'whetted', name: 'Whetted', settled: [{ id: 'paper_cut', name: 'Paper Cut', count: 1 }] },
      { id: 'braced', name: 'Braced', settled: [{ id: 'flinch', name: 'Flinch', count: 1 }] },
    ]);
  });

  it('retains a logged settlement even when a later action burned that Mark', () => {
    const base = createRun(RUN_CONTENT, 9);
    const run = {
      ...base,
      marks: [],
      runLog: [{ k: 'card_settled' as const, cardId: 'paper_cut', markId: 'whetted' }],
    };

    expect(acquiredMarksSummary(run)[0]).toEqual({
      id: 'whetted',
      name: 'Whetted',
      settled: [{ id: 'paper_cut', name: 'Paper Cut', count: 1 }],
    });
  });
});

