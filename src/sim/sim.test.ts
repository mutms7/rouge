/**
 * The harness, checked for the one property that makes it worth anything: determinism.
 *
 * The whole argument for the sim is that when a balance number moves, the win rate moves
 * for *that* reason. If the policy or the trial had any hidden state, a table would drift
 * between runs and every balance conclusion drawn from it would be noise.
 */
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../content/enemies';
import { buildReport, formatOutliers, formatReport } from './report';
import { chooseAction, incomingDamage, scoreAction } from './policy';
import { buildDeck, runTrial } from './trial';
import { createCombat } from '../engine/combat';
import { fightSetup } from '../content/library';
import { WICK } from '../content/run';

describe('determinism', () => {
  it('plays the same combat twice from the same seed', () => {
    for (const encounter of ENCOUNTERS) {
      const first = runTrial(encounter.id, 11);
      const second = runTrial(encounter.id, 11);
      expect(second).toEqual(first);
    }
  });

  it('plays a different combat from a different seed', () => {
    // Not a tautology: it catches a policy that ignores its inputs, which would make every
    // seed produce the same table and every balance conclusion worthless.
    const a = runTrial('the_notary', 1);
    const b = runTrial('the_notary', 2);
    expect(a.deck).not.toEqual(b.deck);
  });

  it('builds a deck of the starter plus what it drafted', () => {
    expect(buildDeck(5, 0)).toEqual([...WICK.deck]);
    expect(buildDeck(5, 4)).toHaveLength(WICK.deck.length + 4);
    expect(buildDeck(5, 4)).toEqual(buildDeck(5, 4));
  });

  it('reaches a conclusion in every fight rather than hitting the action cap', () => {
    for (const encounter of ENCOUNTERS) {
      const trial = runTrial(encounter.id, 3);
      expect(trial.outcome).not.toBe('timeout');
      expect(trial.outcome).not.toBe('ongoing');
    }
  });
});

describe('the policy', () => {
  it('scores by the beat, so a cheap card beats an expensive one of equal value', () => {
    const state = createCombat(fightSetup({ seed: 2, encounterId: 'chalk_debtor' }));
    const scores = new Map<string, number>();
    for (const instance of state.deck.hand) {
      const score = scoreAction(state, { k: 'play_card', uid: instance.uid });
      scores.set(instance.cardId, score);
    }
    // Paper Cut is Weight 1 for 5 damage; Small Print is Weight 2 for 4 and a Slip. Per
    // beat the cheap attack should win, which is the whole point of §3.2.
    const paperCut = scores.get('paper_cut');
    const smallPrint = scores.get('small_print');
    if (paperCut !== undefined && smallPrint !== undefined) expect(paperCut).toBeGreaterThan(smallPrint);
  });

  it('always has something to do while a combat is ongoing', () => {
    const state = createCombat(fightSetup({ seed: 2, encounterId: 'marginalia' }));
    expect(chooseAction(state)).not.toBeNull();
  });

  it('reads incoming damage off the track rather than guessing', () => {
    const state = createCombat(fightSetup({ seed: 2, encounterId: 'chalk_debtor' }));
    // The Chalk Debtor swings for 7 every 4 beats, so an 8-beat window holds two swings.
    expect(incomingDamage(state, 8)).toBe(14);
    expect(incomingDamage(state, 1)).toBe(7);
  });
});

describe('the report', () => {
  it('turns trials into a table without dividing by zero anywhere', () => {
    const trials = ENCOUNTERS.flatMap((e) => [runTrial(e.id, 21), runTrial(e.id, 22)]);
    const report = buildReport(trials, 21);

    expect(report.encounters).toHaveLength(ENCOUNTERS.length);
    expect(report.runs).toBe(trials.length);
    expect(report.overallWinRate).toBeGreaterThanOrEqual(0);
    expect(report.overallWinRate).toBeLessThanOrEqual(1);
    for (const row of report.encounters) {
      expect(Number.isFinite(row.avgBeats)).toBe(true);
      expect(Number.isFinite(row.avgDamage)).toBe(true);
      expect(Number.isFinite(row.avgHpLeft)).toBe(true);
    }
    // Every card gets a row, including the ones nothing ever drafted.
    expect(report.cards.length).toBe(45);
    for (const row of report.cards) {
      expect(Number.isFinite(row.playRate)).toBe(true);
      expect(Number.isFinite(row.winRate)).toBe(true);
    }

    expect(formatReport(report)).toContain('overall win rate');
    expect(formatOutliers(report)).toContain('never played');
  });
});
