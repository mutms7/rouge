import { describe, expect, it } from 'vitest';
import { fightSetup } from '../../content/library';
import { createCombat, reduce } from '../../engine/combat';
import { flashesSince, logLines, namingFor } from './feed';
import { summarize } from './summary';

function fight(encounterId: string, seed = 1) {
  return createCombat(fightSetup({ seed, encounterId }));
}

describe('the record', () => {
  it('names a card when the player acts and an intent when a body does', () => {
    const state = fight('chalk_debtor');
    const uid = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    const next = reduce(state, { k: 'play_card', uid });
    const lines = logLines(next, namingFor(next)).map((l) => l.text);

    expect(lines).toContain('Wick: Paper Cut. (1)');
    // The intent id carries its body's id as a prefix, and the body is already named.
    expect(lines).toContain('Chalk Debtor: Settle. (4)');
  });

  it('marks damage as debt and bookkeeping as quiet', () => {
    const state = fight('chalk_debtor');
    const uid = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    const lines = logLines(reduce(state, { k: 'play_card', uid }), namingFor(state));
    expect(lines.find((l) => l.text.startsWith('Wick takes'))?.tone).toBe('debt');
    expect(lines.find((l) => l.text === 'The ledger opens.')?.tone).toBe('quiet');
  });

  it('says nothing about every draw and discard', () => {
    const state = fight('chalk_debtor');
    const lines = logLines(state, namingFor(state)).map((l) => l.text);
    expect(lines.some((text) => text.includes('draw'))).toBe(false);
  });

  it('names Interest, a canceled Countersign, and a stamped Mark when those events exist', () => {
    const state = fight('the_notary');
    const withEvents = {
      ...state,
      log: [
        ...state.log,
        { beat: 24, event: { k: 'interest' as const, load: 12, count: 3, period: 24, beat: 24 } },
        { beat: 25, event: { k: 'countersign_cancelled' as const, who: 'the_notary', lap: 1 } },
        { beat: 26, event: { k: 'mark_stamped' as const, who: 'the_notary', markId: 'whetted', lap: 1 } },
      ],
    };
    const lines = logLines(withEvents, namingFor(withEvents)).map((line) => line.text);

    expect(lines).toContain('Interest due: 3 Compounds · Load 12.');
    expect(lines).toContain('Countersign canceled on lap 1 (beat 25).');
    expect(lines).toContain('Whetted stamped on lap 1.');
  });
});

describe('flashes', () => {
  it('only covers what the last action appended', () => {
    const state = fight('chalk_debtor');
    const uid = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    const next = reduce(state, { k: 'play_card', uid });

    const since = flashesSince(next, state.log.length);
    expect(since.length).toBeGreaterThan(0);
    // Paper Cut hits the Debtor for 5; the Debtor hits back for 7.
    expect(since).toContainEqual(expect.objectContaining({ who: 'chalk_debtor', kind: 'damage', amount: 5 }));
    expect(since).toContainEqual(expect.objectContaining({ who: 'wick', kind: 'damage', amount: 7 }));
    // Nothing from before the cursor.
    expect(flashesSince(next, next.log.length)).toEqual([]);
  });

  it('shows the part Guard ate rather than nothing at all', () => {
    const state = createCombat({
      ...fightSetup({ seed: 1, encounterId: 'chalk_debtor' }),
      deck: ['the_long_silence'],
      startingHand: 1,
    });
    // Guard 16 against a 7, so the hit lands as blocked rather than as damage.
    const uid = state.deck.hand[0]?.uid ?? '';
    const next = reduce(state, { k: 'play_card', uid });
    const flashes = flashesSince(next, state.log.length);
    expect(flashes.some((f) => f.who === 'wick' && f.kind === 'blocked')).toBe(true);
    expect(flashes.some((f) => f.who === 'wick' && f.kind === 'damage')).toBe(false);
  });
});

describe('chips', () => {
  it('points damage at whoever is on the other end', () => {
    const attack = summarize([{ k: 'damage', n: 5 }], { by: 'enemy' });
    expect(attack[0]).toMatchObject({ code: 'DMG', n: 5, hostile: true, promised: false });
    expect(summarize([{ k: 'damage', n: 5 }], { by: 'player' })[0]?.hostile).toBe(false);
  });

  it('never calls an enemy healing itself hostile', () => {
    expect(summarize([{ k: 'guard', n: 12 }], { by: 'enemy' })[0]?.hostile).toBe(false);
  });

  it('unwraps a perjury into what it will become, marked as sworn', () => {
    const chips = summarize([{ k: 'perjury', in: 8, effects: [{ k: 'damage', n: 10 }] }], { by: 'player' });
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ code: 'DMG', n: 10, promised: true });
  });

  it('carries the written sentence for anyone who has not learned the shorthand', () => {
    expect(summarize([{ k: 'slip', n: 3 }], { by: 'enemy' })[0]?.label).toBe('Slip 3.');
  });
});
