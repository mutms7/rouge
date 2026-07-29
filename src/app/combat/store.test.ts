/**
 * The store, and the desync question.
 *
 * The phase brief asks for a fast-forward that skips animation entirely and never desyncs
 * anything while it is held. The way phase 3 answers that is architectural rather than
 * careful: the board is a function of one `CombatState`, animation only interpolates
 * between two of them, and the dispatch path never reads a presentation setting. So the
 * test is the honest version of the claim: play the same fight twice, hold fast-forward
 * through one of them, and the two engine states have to come out byte-identical.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CombatState } from '../../engine/types';
import { useSettings } from '../settings';
import { needsTarget, playAction, targetableEnemies, useCombat } from './store';

/**
 * A deterministic player: always the first card in hand at the first living body, and wait
 * when there is nothing playable. Not a good player. A repeatable one.
 */
function playOut(limit = 400): CombatState {
  const store = useCombat.getState;
  for (let step = 0; step < limit; step += 1) {
    const state = store().state;
    if (!state || state.outcome !== 'ongoing') break;

    const playable = state.deck.hand.find((c) => state.library[c.cardId]?.playable !== false);
    if (!playable) {
      store().dispatch({ k: 'wait' });
      continue;
    }
    if (needsTarget(state, playable.uid)) {
      const foe = targetableEnemies(state)[0];
      store().dispatch({ k: 'play_card', uid: playable.uid, ...(foe ? { targetId: foe.id } : {}) });
      continue;
    }
    store().dispatch({ k: 'play_card', uid: playable.uid });
  }
  const final = store().state;
  if (!final) throw new Error('the fight went missing');
  return final;
}

/** Everything the engine holds, minus the Rng tuples, which stringify fine anyway. */
function snapshot(state: CombatState): string {
  return JSON.stringify({
    beat: state.beat,
    outcome: state.outcome,
    strain: state.strain,
    salt: state.salt,
    cardsPlayed: state.cardsPlayed,
    combatants: state.combatants,
    deck: state.deck,
    log: state.log,
    runLog: state.runLog,
  });
}

beforeEach(() => {
  useCombat.getState().leave();
  useSettings.setState({ reducedMotion: false, fastForwardHeld: false, fastForwardLocked: false });
});

describe('the combat store', () => {
  it('holds a fight built from a seed and an encounter', () => {
    useCombat.getState().start('chalk_debtor', 7);
    const state = useCombat.getState().state;
    expect(state?.seed).toBe(7);
    expect(state?.combatants.map((c) => c.id)).toEqual(['wick', 'chalk_debtor']);
    expect(useCombat.getState().logCursor).toBe(0);
  });

  it('is the same fight every time from the same seed', () => {
    useCombat.getState().start('chalk_hound', 42);
    const first = snapshot(playOut());
    useCombat.getState().start('chalk_hound', 42);
    const second = snapshot(playOut());
    expect(second).toBe(first);
  });

  it('does not care whether fast-forward is held', () => {
    useCombat.getState().start('chalk_debtor', 3);
    const normal = snapshot(playOut());

    // Hold it down for the whole of the second run, and lock it as well.
    useSettings.setState({ fastForwardHeld: true, fastForwardLocked: true, reducedMotion: true });
    useCombat.getState().start('chalk_debtor', 3);
    const hurried = snapshot(playOut());

    expect(hurried).toBe(normal);
  });

  it('remembers where the log was, so the flashes only cover the last exchange', () => {
    useCombat.getState().start('chalk_debtor', 1);
    const before = useCombat.getState().state?.log.length ?? 0;
    const uid = useCombat.getState().state?.deck.hand[0]?.uid ?? '';
    useCombat.getState().dispatch({ k: 'play_card', uid });
    expect(useCombat.getState().logCursor).toBe(before);
    expect(useCombat.getState().state?.log.length).toBeGreaterThan(before);
  });

  it('ignores an action the player may not take rather than throwing under them', () => {
    useCombat.getState().start('chalk_debtor', 1);
    const before = useCombat.getState().state;
    useCombat.getState().dispatch({ k: 'play_card', uid: 'not-a-card' });
    expect(useCombat.getState().state).toBe(before);
  });

  it('knows when a card has to be pointed at something', () => {
    useCombat.getState().start('the_owed', 1);
    const state = useCombat.getState().state;
    if (!state) throw new Error('no fight');
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    const guard = state.deck.hand.find((c) => c.cardId === 'flinch')?.uid ?? '';
    expect(needsTarget(state, attack)).toBe(true);
    expect(needsTarget(state, guard)).toBe(false);
  });

  it('does not ask for a target when only one body is standing', () => {
    useCombat.getState().start('chalk_debtor', 1);
    const state = useCombat.getState().state;
    if (!state) throw new Error('no fight');
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    expect(needsTarget(state, attack)).toBe(false);
  });

  it('drops a target the engine did not ask for, and keeps one it did', () => {
    useCombat.getState().start('chalk_debtor', 1);
    const single = useCombat.getState().state;
    if (!single) throw new Error('no fight');
    const uid = single.deck.hand[0]?.uid ?? '';
    // One body standing, so `legalActions` offers no targetId and the action must not
    // carry one either, or nothing matches and the play is silently swallowed.
    expect(playAction(single, uid, 'chalk_debtor')).toEqual({ k: 'play_card', uid });

    useCombat.getState().start('the_owed', 1);
    const pair = useCombat.getState().state;
    if (!pair) throw new Error('no fight');
    const attack = pair.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    expect(playAction(pair, attack, 'the_owed_b')).toEqual({
      k: 'play_card',
      uid: attack,
      targetId: 'the_owed_b',
    });
  });

  it('plays a targeted card at the body it was pointed at', () => {
    useCombat.getState().start('the_owed', 1);
    const state = useCombat.getState().state;
    if (!state) throw new Error('no fight');
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    useCombat.getState().playCard(attack, 'the_owed_b');
    const after = useCombat.getState().state;
    expect(after?.combatants.find((c) => c.id === 'the_owed_b')?.hp).toBe(13);
    expect(after?.combatants.find((c) => c.id === 'the_owed_a')?.hp).toBe(18);
  });

  it('walks the target cursor round the living bodies', () => {
    useCombat.getState().start('marginalia', 3);
    useCombat.getState().beginTargeting('c1');
    useCombat.getState().moveTarget(-1);
    expect(useCombat.getState().targeting?.index).toBe(2);
    useCombat.getState().moveTarget(1);
    expect(useCombat.getState().targeting?.index).toBe(0);
  });

  it('clamps the hand cursor when the hand shrinks under it', () => {
    useCombat.getState().start('chalk_debtor', 1);
    useCombat.getState().setCursor(4);
    expect(useCombat.getState().cursor).toBe(4);
    useCombat.getState().setCursor(99);
    expect(useCombat.getState().cursor).toBe((useCombat.getState().state?.deck.hand.length ?? 1) - 1);
  });
});
