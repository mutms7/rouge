import { describe, expect, it } from 'vitest';
import { BEATS_PER_LAP } from './constants';
import { dummyCombat, marker, pileOf, tickEnemy } from './dummies';
import { cardWeight, frontBeat, lapOf, nextActor, projectIntents, trackBeat } from './tally';

describe('the track', () => {
  it('splits absolute beats into laps of 24', () => {
    expect(BEATS_PER_LAP).toBe(24);
    expect(lapOf(0)).toBe(0);
    expect(lapOf(23)).toBe(0);
    expect(lapOf(24)).toBe(1);
    expect(lapOf(49)).toBe(2);
  });

  it('wraps onto the ring, negatives included', () => {
    expect(trackBeat(0)).toBe(0);
    expect(trackBeat(24)).toBe(0);
    expect(trackBeat(25)).toBe(1);
    expect(trackBeat(-1)).toBe(23);
  });

  it('picks whoever is furthest behind', () => {
    const board = [marker('p', 'player', 9), marker('a', 'enemy', 4), marker('b', 'enemy', 7)];
    expect(frontBeat(board)).toBe(4);
    expect(nextActor(board)?.id).toBe('a');
  });

  it('resolves a tie in favour of the player', () => {
    const board = [marker('a', 'enemy', 5), marker('p', 'player', 5)];
    expect(nextActor(board)?.id).toBe('p');
    expect(nextActor([...board].reverse())?.id).toBe('p');
  });

  it('resolves an enemy-against-enemy tie by list order, with no dice', () => {
    const board = [marker('a', 'enemy', 5), marker('b', 'enemy', 5)];
    expect(nextActor(board)?.id).toBe('a');
  });

  it('ignores the dead', () => {
    const board = [marker('p', 'player', 9), marker('a', 'enemy', 1, { hp: 0 })];
    expect(frontBeat(board)).toBe(9);
    expect(nextActor(board)?.id).toBe('p');
    expect(frontBeat([marker('a', 'enemy', 1, { hp: 0 })])).toBeNull();
    expect(nextActor([marker('a', 'enemy', 1, { hp: 0 })])).toBeNull();
  });

  it('costs an echo copy one more beat, and never less than zero', () => {
    const def = { id: 'x', name: 'X', weight: 1, type: 'skill', targeting: 'none', effects: [] } as const;
    expect(cardWeight(def, { uid: 'a', cardId: 'x', weightDelta: 0 })).toBe(1);
    expect(cardWeight(def, { uid: 'b', cardId: 'x', weightDelta: 1 })).toBe(2);
    expect(cardWeight(def, { uid: 'c', cardId: 'x', weightDelta: -4 })).toBe(0);
  });
});

describe('intent projection', () => {
  it('pins every future action to the beat it fires on, across the whole window', () => {
    const state = dummyCombat({ deck: pileOf('jab', 4), enemies: [tickEnemy(7)] });
    const projected = projectIntents(state);
    expect(projected.map((p) => p.beat)).toEqual([0, 7, 14, 21]);
    expect(projected.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(projected.every((p) => p.intent.id === 'tick')).toBe(true);
  });

  it('reports where each action lands on the ring, not just its absolute beat', () => {
    const state = dummyCombat({ deck: pileOf('jab', 2), enemies: [tickEnemy(10)] });
    const projected = projectIntents(state, 48);
    expect(projected.map((p) => p.beat)).toEqual([0, 10, 20, 30, 40]);
    expect(projected.map((p) => p.trackBeat)).toEqual([0, 10, 20, 6, 16]);
  });

  it('interleaves several enemies in beat order', () => {
    const state = dummyCombat({
      deck: pileOf('jab', 2),
      enemies: [tickEnemy(4, { id: 'a', startBeat: 0 }), tickEnemy(4, { id: 'b', startBeat: 2 })],
    });
    const projected = projectIntents(state, 8).map((p) => `${p.enemyId}@${p.beat}`);
    expect(projected).toEqual(['a@0', 'b@2', 'a@4', 'b@6']);
  });
});
