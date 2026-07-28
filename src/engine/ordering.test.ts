/**
 * Beat ordering. This is where the subtle bugs live, so it gets its own file.
 *
 * Every expectation below is hand-derived from the rules rather than recorded from a
 * run: markers start together, whoever is furthest behind acts, ties go to the player.
 * If one of these fails, the number in the test is the contract and the engine is wrong.
 */
import { describe, expect, it } from 'vitest';
import { isPlayerTurn, legalActions, reduce } from './combat';
import { actsBy, dummyCombat, eventsOf, pileOf, play, playerOf, tickEnemy, combatantOf } from './dummies';
import type { CombatState } from './types';

/** Everything the enemies did, in the order the track resolved them. */
function enemyActs(state: CombatState): string[] {
  return eventsOf(state, 'act')
    .filter((entry) => entry.event.who !== 'player')
    .map((entry) => `${entry.event.who}@${entry.beat}`);
}

describe('who acts next', () => {
  it('gives the first action to the player when everyone starts level', () => {
    const state = dummyCombat({ deck: pileOf('jab', 3) });
    expect(isPlayerTurn(state)).toBe(true);
    expect(state.beat).toBe(0);
    expect(actsBy(state, 'tick')).toEqual([]);
  });

  it('hands a 3-beat enemy exactly two actions for one Weight 5 card', () => {
    const opening = dummyCombat({ deck: pileOf('heavy', 3), enemies: [tickEnemy(3)] });
    const after = play(opening, 'heavy');

    // Player 0 -> 5. Enemy acts at 0 and at 3; its next is beat 6, which is behind the
    // player, so the track comes back to them at beat 5.
    expect(actsBy(after, 'tick').map((a) => a.beat)).toEqual([0, 3]);
    expect(playerOf(after).position).toBe(5);
    expect(after.beat).toBe(5);
    expect(isPlayerTurn(after)).toBe(true);
  });

  it('keeps the ratio over three Weight 5 cards: five enemy actions to three of yours', () => {
    let state = dummyCombat({ deck: pileOf('heavy', 3), enemies: [tickEnemy(3)] });
    for (let i = 0; i < 3; i += 1) state = play(state, 'heavy');

    expect(actsBy(state, 'tick').map((a) => a.beat)).toEqual([0, 3, 6, 9, 12]);
    expect(actsBy(state, 'player')).toHaveLength(3);
    expect(state.beat).toBe(15);
  });

  it('gives you three actions per enemy action at Weight 1 against the same enemy', () => {
    let state = dummyCombat({ deck: pileOf('jab', 5), enemies: [tickEnemy(3)] });
    state = play(state, 'jab');
    state = play(state, 'jab');
    state = play(state, 'jab');
    expect(actsBy(state, 'tick').map((a) => a.beat)).toEqual([0]);

    state = play(state, 'jab');
    expect(actsBy(state, 'tick').map((a) => a.beat)).toEqual([0, 3]);
  });

  it('does not move the marker or the clock for a Weight 0 card', () => {
    let state = dummyCombat({ deck: pileOf('free', 4), enemies: [tickEnemy(3)] });
    for (let i = 0; i < 3; i += 1) state = play(state, 'free');

    expect(playerOf(state).position).toBe(0);
    expect(state.beat).toBe(0);
    expect(state.strain).toBe(9);
    expect(actsBy(state, 'tick')).toEqual([]);
    expect(isPlayerTurn(state)).toBe(true);
  });

  it('lets Slip take an enemy action away entirely', () => {
    let state = dummyCombat({ deck: pileOf('shove', 2), enemies: [tickEnemy(3)] });
    state = play(state, 'shove');
    // Marker to 1, enemy pushed from 0 to 3, so the player is furthest behind again.
    expect(playerOf(state).position).toBe(1);
    expect(combatantOf(state, 'tick').position).toBe(3);
    expect(actsBy(state, 'tick')).toEqual([]);

    state = play(state, 'shove');
    expect(combatantOf(state, 'tick').position).toBe(6);
    expect(actsBy(state, 'tick')).toEqual([]);
  });

  it('clamps Haste at the clock instead of rewinding it', () => {
    const state = play(dummyCombat({ deck: ['dart'], enemies: [tickEnemy(3)] }), 'dart');

    // Weight 2 then Haste 4 would land on -2. The clock is the floor.
    expect(playerOf(state).position).toBe(0);
    expect(state.beat).toBe(0);
    expect(eventsOf(state, 'haste').map((e) => e.event.n)).toEqual([2]);
    expect(actsBy(state, 'tick')).toEqual([]);
  });

  it('pulls you back to the clock when you are ahead of it, buying a free action', () => {
    let state = dummyCombat({ deck: ['heavy', 'dart'], enemies: [tickEnemy(3)] });
    state = play(state, 'heavy');
    expect(playerOf(state).position).toBe(5);

    state = play(state, 'dart');
    // 5 -> 7 for the Weight, then Haste 4 clamps at the clock: back to 5.
    expect(playerOf(state).position).toBe(5);
    expect(state.beat).toBe(5);
    expect(eventsOf(state, 'haste').map((e) => e.event.n)).toEqual([2]);
    expect(actsBy(state, 'tick')).toHaveLength(2);
  });

  it('floods the track correctly when three enemies act on consecutive beats', () => {
    const state = play(
      dummyCombat({
        deck: ['heavy'],
        enemies: [
          tickEnemy(3, { id: 'm1', startBeat: 0 }),
          tickEnemy(3, { id: 'm2', startBeat: 1 }),
          tickEnemy(3, { id: 'm3', startBeat: 2 }),
        ],
      }),
      'heavy',
      'm1',
    );

    expect(enemyActs(state)).toEqual(['m1@0', 'm2@1', 'm3@2', 'm1@3', 'm2@4']);
    // m3 is tied with the player at beat 5 and loses the tie.
    expect(state.beat).toBe(5);
    expect(isPlayerTurn(state)).toBe(true);
  });

  it('decays Guard exactly one per beat elapsed, not per action', () => {
    let state = dummyCombat({ deck: ['wall', 'heavy'], enemies: [tickEnemy(3)] });
    state = play(state, 'wall');
    expect(playerOf(state).guard).toBe(11); // 12 raised at beat 0, clock now 1
    expect(state.beat).toBe(1);

    state = play(state, 'heavy');
    expect(state.beat).toBe(6);
    expect(playerOf(state).guard).toBe(6); // six beats elapsed since it was raised
  });

  it('holds frozen Guard for exactly its window, then decays it normally', () => {
    let state = dummyCombat({ deck: ['chalk', 'heavy'], enemies: [tickEnemy(3)] });
    state = play(state, 'chalk');
    expect(state.beat).toBe(1);
    expect(playerOf(state).guard).toBe(4); // frozen through beat 3

    state = play(state, 'heavy');
    expect(state.beat).toBe(6);
    expect(playerOf(state).guard).toBe(1); // free from beat 3, so three beats of decay
  });

  it('never lets the clock run backwards over a whole fight', () => {
    let state = dummyCombat({
      deck: ['dart', 'shove', 'free', 'jab', 'heavy', 'brace', 'study', 'dart'],
      enemies: [tickEnemy(2, { hp: 60 })],
    });
    let beat = state.beat;
    for (let step = 0; step < 200 && state.outcome === 'ongoing'; step += 1) {
      const [action] = legalActions(state);
      if (!action) break;
      state = reduce(state, action);
      expect(state.beat).toBeGreaterThanOrEqual(beat);
      beat = state.beat;
    }
    expect(state.beat).toBeGreaterThan(0);
  });
});
