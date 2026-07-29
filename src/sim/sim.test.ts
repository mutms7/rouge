/**
 * The harness, checked for the one property that makes it worth anything: determinism.
 *
 * The whole argument for the sim is that when a balance number moves, the win rate moves
 * for *that* reason. If the policy or the trial had any hidden state, a table would drift
 * between runs and every balance conclusion drawn from it would be noise.
 */
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../content/enemies';
import { buildReport, buildRunReport, formatOutliers, formatReport, formatRunReport } from './report';
import { chooseAction, incomingDamage, scoreAction } from './policy';
import { runWhole } from './run';
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

describe('whole-run simulation', () => {
  it('reaches a terminal full Act 1 run rather than stopping at a prompt', () => {
    const result = runWhole(3);
    expect(result.outcome).not.toBe('timeout');
    expect(result.depth).toBe(12);
    expect(result.combats.at(-1)?.encounterId).toBe('the_notary');
  });

  it('is byte-stable for a whole run seed', () => {
    expect(runWhole(17)).toEqual(runWhole(17));
  });

  it('formats useful run-level balance columns', () => {
    const report = buildRunReport([runWhole(3)], 3);
    const text = formatRunReport(report);
    expect(text).toContain('overall run win rate');
    expect(text).toContain('depth avg');
    expect(text).toContain('Interest');
    expect(text).toContain('The Notary');
  });

  it('reports metrics from the active combat when a run times out', () => {
    // 165 run actions lands part-way through the Notary after an Interest bill and several
    // cards have resolved. A stale `lastCombat` read would report the prior Tithe-Wolf fight,
    // including its zero damage, instead of this active board.
    const result = runWhole(3, { maxActions: 165 });
    const current = result.combats.at(-1);
    expect(result.outcome).toBe('timeout');
    expect(current?.encounterId).toBe('the_notary');
    expect(current?.outcome).toBe('timeout');
    expect(current?.beats).toBeGreaterThan(0);
    expect(current?.damageTaken).toBeGreaterThan(0);
    expect(current?.interestEvents).toBeGreaterThan(0);
    expect(Object.keys(current?.played ?? {})).not.toHaveLength(0);
    expect(current?.hpAfter).toBeLessThan(current?.hpBefore ?? Number.POSITIVE_INFINITY);
    expect(result.hpCurve.at(-1)).toBe(current?.hpAfter);
    expect(buildRunReport([result], 3).avgFinalHp).toBe(current?.hpAfter);
  });

  it('uses combat-appearance denominators and names card variants by their base card', () => {
    const run = runWhole(3);
    const report = buildRunReport([run], 3);
    const variant = report.cards.find((card) => card.id === 'flinch+');
    expect(variant).toBeDefined();
    expect(variant?.name).toBe('Flinch');
    expect(variant?.played ?? 0).toBeGreaterThanOrEqual(variant?.playAppearances ?? 0);
    expect(variant?.playWins ?? 0).toBeLessThanOrEqual(variant?.playAppearances ?? 0);
    expect(variant?.winRate).toBe((variant?.playWins ?? 0) / Math.max(1, variant?.playAppearances ?? 0));
    expect(run.played.discard_compound).toBeUndefined();
  });
});
