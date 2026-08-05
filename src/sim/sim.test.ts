/**
 * The harness, checked for the one property that makes it worth anything: determinism.
 *
 * The whole argument for the sim is that when a balance number moves, the win rate moves
 * for *that* reason. If the policy or the trial had any hidden state, a table would drift
 * between runs and every balance conclusion drawn from it would be noise.
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '../content/cards';
import { ENCOUNTERS } from '../content/enemies';
import { baseIdOf } from '../engine/variants';
import { buildReport, buildRunReport, formatOutliers, formatReport, formatRunOutliers, formatRunReport } from './report';
import { chooseAction, incomingDamage, nextWindow, scoreAction } from './policy';
import { runWhole } from './run';
import { buildDeck, runTrial } from './trial';
import { cardDefence, cardOffence, cardValue, defenceCount, offenceCount } from './value';
import { createCombat, reduce } from '../engine/combat';
import { BEATS_PER_LAP } from '../engine/constants';
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

  it('finds the re-ink window on the track and nothing on a fight that has none', () => {
    const notary = createCombat(fightSetup({ seed: 2, encounterId: 'the_notary' }));
    // Phase 1 sums to exactly 24 beats and the window is its last intent, so it is a lap away
    // at the start and invisible to a two-beat horizon.
    expect(nextWindow(notary, BEATS_PER_LAP)?.multiplier).toBe(3);
    expect(nextWindow(notary, 2)).toBeNull();
    expect(nextWindow(createCombat(fightSetup({ seed: 2, encounterId: 'chalk_debtor' })), BEATS_PER_LAP)).toBeNull();
  });

  it('holds a beat for a tripled-damage window instead of raising Guard into it', () => {
    let state = createCombat(fightSetup({ seed: 2, encounterId: 'the_notary' }));
    // Walk to the beat before the window opens. The policy's own choices get us there, which is
    // the point: the patience has to survive contact with the rest of the scoring.
    let waitedOnTheDoorstep = false;
    for (let i = 0; i < 200 && state.outcome === 'ongoing'; i += 1) {
      const window = nextWindow(state, 3);
      const action = chooseAction(state);
      if (!action) break;
      if (window && window.inBeats === 1 && action.k === 'wait') waitedOnTheDoorstep = true;
      state = reduce(state, action);
    }
    expect(waitedOnTheDoorstep).toBe(true);
  });

  it('prices a kill that doubles the survivor, and stops paying once both are nearly down', () => {
    // Kesk and Ledger each double on the other's death, so the first kill is the expensive one.
    const state = createCombat(fightSetup({ seed: 2, encounterId: 'bailiff_kesk_and_ledger' }));
    const healthy = state.combatants.filter((c) => c.team === 'enemy');
    const nearlyDead = {
      ...state,
      combatants: state.combatants.map((c) => (c.team === 'enemy' ? { ...c, hp: 1 } : c)),
    };
    const attack = state.deck.hand.find((instance) => instance.cardId === 'paper_cut');
    if (!attack || healthy.length !== 2) throw new Error('expected an attack and two bailiffs');

    const target = healthy[1]?.id;
    const whileHealthy = scoreAction(state, { k: 'play_card', uid: attack.uid, targetId: target });
    const whileDying = scoreAction(nearlyDead, { k: 'play_card', uid: attack.uid, targetId: target });
    // Both are lethal-flagged in the dying state, so the difference is the doubling premium
    // being charged in one and forgiven in the other.
    expect(whileDying).toBeGreaterThan(whileHealthy);
  });
});

describe('the deck value model', () => {
  const card = (id: string) => CARDS[id] ?? (() => { throw new Error(`no card ${id}`); })();

  it('prices a Compound below anything you would ever choose to own', () => {
    for (const id of ['arrears', 'grief_unpaid', 'interest_owed']) {
      expect(cardValue(card(id))).toBeLessThan(cardValue(card('flinch')));
    }
  });

  it('rates per beat, so the cheap attack beats the expensive one', () => {
    // Paper Cut: 5 damage for Weight 1. Pry Bar: 8 for Weight 2. More damage, worse rate.
    expect(cardValue(card('paper_cut'))).toBeGreaterThan(cardValue(card('pry_bar')));
  });

  it('separates what kills from what keeps you alive, and counts nothing twice', () => {
    expect(cardOffence(card('paper_cut'))).toBe(5);
    expect(cardDefence(card('paper_cut'))).toBe(0);
    expect(cardOffence(card('flinch'))).toBe(0);
    expect(cardDefence(card('flinch'))).toBe(8);
    // Alibi's Perjury pays out in Guard, so the deep walk has to see both halves: 5 up front and
    // the 6 it promises.
    expect(cardDefence(card('alibi'))).toBe(11);
    // Grifter's Cough is 3 damage and Bleed 4, and the Bleed is damage too.
    expect(cardOffence(card('grifters_cough'))).toBeGreaterThan(3);
  });

  it('counts the floors off a real starter deck', () => {
    const starter = WICK.deck.map(card);
    // Four Paper Cuts and a Small Print attack; three Flinches and an Alibi defend.
    expect(offenceCount(starter)).toBe(5);
    expect(defenceCount(starter)).toBe(4);
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
    expect(text).toContain('hp on arrival');
  });

  it('gives "never picked" a denominator, and the HP curve a row per node', () => {
    const run = runWhole(3);
    const report = buildRunReport([run], 3);

    // One row per node the run stood on, in order, and nothing after where it stopped.
    expect(report.depths).toHaveLength(run.hpAtDepth.length);
    expect(report.depths[0]?.depth).toBe(1);
    expect(report.depths[0]?.avgHp).toBe(68);
    expect(report.depths.at(-1)?.endedHere).toBe(1);

    // A card the draft offered and the policy declined is distinguishable from one the draft
    // never mentioned, which is the whole reason `offered` is tracked.
    const anyOffered = report.cards.filter((card) => card.offered > 0);
    expect(anyOffered.length).toBeGreaterThan(0);
    for (const card of anyOffered) {
      expect(card.pickRate).toBe(card.picked / card.offered);
      expect(card.picked).toBeLessThanOrEqual(card.offered);
    }
    // Compounds are never drafted, so they never turn up as an offer.
    expect(report.cards.find((card) => card.id === 'arrears')?.offered).toBe(0);

    const outliers = formatRunOutliers(report);
    expect(outliers).toContain('never picked');
    expect(outliers).toContain('Interest');
  });

  it('reports metrics from the active combat when a run times out', () => {
    // Cut the run off part-way through its last fight, derived rather than hard-coded: the
    // property under test is that a timeout reports the *active* board, and pinning the cap
    // to a literal turns a policy tweak into a spurious failure here.
    const full = runWhole(3);
    const lastCombat = full.combats.at(-1);
    const result = runWhole(3, { maxActions: full.actions - Math.ceil((lastCombat?.actions ?? 2) / 2) });
    const current = result.combats.at(-1);
    expect(result.outcome).toBe('timeout');
    expect(current?.encounterId).toBe('the_notary');
    expect(current?.outcome).toBe('timeout');
    expect(current?.beats).toBeGreaterThan(0);
    expect(current?.damageTaken).toBeGreaterThan(0);
    expect(Object.keys(current?.played ?? {})).not.toHaveLength(0);
    expect(current?.hpAfter).toBeLessThan(current?.hpBefore ?? Number.POSITIVE_INFINITY);
    expect(result.hpCurve.at(-1)).toBe(current?.hpAfter);
    expect(buildRunReport([result], 3).avgFinalHp).toBe(current?.hpAfter);
  });

  it('uses combat-appearance denominators and names card variants by their base card', () => {
    const run = runWhole(3);
    const report = buildRunReport([run], 3);
    // Whichever card the Wake upgraded. Named by base id, so the table never grows a row for
    // a card nobody printed.
    const variantId = Object.keys(run.played).find((id) => baseIdOf(id) !== id);
    const variant = report.cards.find((card) => card.id === variantId);
    expect(variant).toBeDefined();
    expect(variant?.name).toBe(CARDS[baseIdOf(variantId ?? '')]?.name);
    expect(variant?.played ?? 0).toBeGreaterThanOrEqual(variant?.playAppearances ?? 0);
    expect(variant?.playWins ?? 0).toBeLessThanOrEqual(variant?.playAppearances ?? 0);
    expect(variant?.winRate).toBe((variant?.playWins ?? 0) / Math.max(1, variant?.playAppearances ?? 0));
    expect(run.played.discard_compound).toBeUndefined();
  });
});
