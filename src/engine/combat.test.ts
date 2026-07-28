/**
 * The reducer as a whole: setup, legality, and a full fight played to a conclusion.
 *
 * The determinism test is the one that matters. A save file is a seed plus an action
 * log, the sim harness plays thousands of runs, and bug reports are supposed to be
 * "here's my seed". All three of those are the same property, checked here.
 */
import { describe, expect, it } from 'vitest';
import { createCombat, isPlayerTurn, legalActions, reduce } from './combat';
import { DUMMY_CARDS, biterEnemy, dummyCombat, handUid, pileOf, play, playerOf, tickEnemy } from './dummies';
import { isAlive } from './tally';
import type { Action, CombatState } from './types';

/**
 * A fixed policy, which is what makes this a script rather than a playthrough: take the
 * first legal action, always. Dumb on purpose, and completely reproducible.
 */
function playOut(state: CombatState, limit = 500): { final: CombatState; actions: Action[] } {
  let current = state;
  const actions: Action[] = [];
  for (let step = 0; step < limit && current.outcome === 'ongoing'; step += 1) {
    const options = legalActions(current);
    const action = options[0];
    if (!action) throw new Error('an ongoing combat always has a legal action');
    actions.push(action);
    current = reduce(current, action);
  }
  return { final: current, actions };
}

function opening(seed: number): CombatState {
  return createCombat({
    seed,
    library: DUMMY_CARDS,
    player: { hp: 40 },
    enemies: [biterEnemy(4, 5, { id: 'debtor', hp: 30 })],
    deck: ['jab', 'jab', 'jab', 'brace', 'brace', 'shove', 'study', 'whisper', 'nick', 'heavy'],
  });
}

describe('setup', () => {
  it('starts with a shuffled hand, the player to act, and nothing resolved yet', () => {
    const state = opening(1);
    expect(state.beat).toBe(0);
    expect(state.deck.hand).toHaveLength(5);
    expect(state.deck.draw).toHaveLength(5);
    expect(state.outcome).toBe('ongoing');
    expect(isPlayerTurn(state)).toBe(true);
    expect(state.log[0]?.event).toEqual({ k: 'combat_start' });
  });

  it('shuffles off the seed, not off the clock', () => {
    expect(opening(1).deck.hand.map((c) => c.uid)).toEqual(opening(1).deck.hand.map((c) => c.uid));
    expect(opening(1).deck.hand.map((c) => c.uid)).not.toEqual(opening(2).deck.hand.map((c) => c.uid));
  });

  it('refuses a combat that cannot work', () => {
    const base = { seed: 1, library: DUMMY_CARDS, player: { hp: 10 }, deck: ['jab'] };
    expect(() => createCombat({ ...base, enemies: [] })).toThrow(/at least one enemy/);
    expect(() => createCombat({ ...base, player: { hp: 0 }, enemies: [tickEnemy(3)] })).toThrow(/alive/);
    expect(() => createCombat({ ...base, enemies: [{ id: 'x', hp: 5, intents: [] }] })).toThrow(/no intents/);
    expect(() =>
      createCombat({
        ...base,
        enemies: [{ id: 'x', hp: 5, intents: [{ id: 'stall', weight: 0, targeting: 'none', effects: [] }] }],
      }),
    ).toThrow(/at least 1 beat/);
    expect(() => createCombat({ ...base, deck: ['nope'], enemies: [tickEnemy(3)] })).toThrow(/unknown card nope/);
  });
});

describe('legality', () => {
  it('offers every card in hand plus waiting, in a stable order', () => {
    const state = dummyCombat({ deck: ['jab', 'brace'], enemies: [tickEnemy(3)] });
    expect(legalActions(state)).toEqual([
      ...state.deck.hand.map((c) => ({ k: 'play_card', uid: c.uid })),
      { k: 'wait' },
    ]);
    expect(legalActions(state)).toEqual(legalActions(state));
  });

  it('enumerates targets only when there is a choice to make', () => {
    const one = dummyCombat({ deck: ['jab'], enemies: [tickEnemy(3, { id: 'a' })] });
    expect(legalActions(one).filter((a) => a.k === 'play_card')).toHaveLength(1);

    const two = dummyCombat({
      deck: ['jab'],
      enemies: [tickEnemy(3, { id: 'a' }), tickEnemy(3, { id: 'b' })],
    });
    expect(legalActions(two).filter((a) => a.k === 'play_card')).toEqual([
      { k: 'play_card', uid: handUid(two, 'jab'), targetId: 'a' },
      { k: 'play_card', uid: handUid(two, 'jab'), targetId: 'b' },
    ]);
  });

  it('throws on an illegal action rather than silently doing nothing', () => {
    const state = dummyCombat({
      deck: ['jab'],
      enemies: [tickEnemy(3, { id: 'a' }), tickEnemy(3, { id: 'b' })],
    });
    const uid = handUid(state, 'jab');
    expect(() => reduce(state, { k: 'play_card', uid: 'nonsense' })).toThrow(/not in hand/);
    expect(() => reduce(state, { k: 'play_card', uid, targetId: 'ghost' })).toThrow(/not a legal target/);
    expect(() => reduce(state, { k: 'play_card', uid })).toThrow(/needs a target/);
  });

  it('leaves the hand alone when a play is rejected', () => {
    const state = dummyCombat({
      deck: ['jab'],
      enemies: [tickEnemy(3, { id: 'a' }), tickEnemy(3, { id: 'b' })],
    });
    expect(() => reduce(state, { k: 'play_card', uid: handUid(state, 'jab') })).toThrow();
    expect(state.deck.hand).toHaveLength(1);
  });

  it('offers nothing and changes nothing once the fight is over', () => {
    const { final } = playOut(opening(3));
    expect(final.outcome).not.toBe('ongoing');
    expect(legalActions(final)).toEqual([]);
    expect(reduce(final, { k: 'wait' })).toBe(final);
  });
});

describe('purity of the reducer', () => {
  it('never touches the state it was handed', () => {
    const before = opening(4);
    const snapshot = JSON.stringify(before);
    const after = play(before, before.deck.hand[0] ? before.deck.hand[0].cardId : 'jab');

    expect(JSON.stringify(before)).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(after.combatants[0]).not.toBe(before.combatants[0]);
  });
});

describe('a full scripted combat', () => {
  it('plays two dummies to a conclusion', () => {
    const { final, actions } = playOut(opening(1));

    expect(final.outcome).not.toBe('ongoing');
    expect(actions.length).toBeGreaterThan(3);
    expect(final.log.at(-1)?.event).toEqual({ k: 'combat_end', outcome: final.outcome });
    expect(final.awaiting).toBe('none');

    const loser = final.outcome === 'won' ? 'debtor' : 'player';
    expect(final.combatants.filter((c) => c.id === loser).every((c) => !isAlive(c))).toBe(true);
  });

  it('lands on exactly the same state twice from the same seed', () => {
    const first = playOut(opening(7));
    const second = playOut(opening(7));

    expect(second.actions).toEqual(first.actions);
    expect(second.final).toEqual(first.final);
    expect(JSON.stringify(second.final)).toBe(JSON.stringify(first.final));
  });

  it('replays from the seed and the action log alone', () => {
    const { final, actions } = playOut(opening(11));
    let replay = opening(11);
    for (const action of actions) replay = reduce(replay, action);
    expect(replay).toEqual(final);
  });

  it('goes somewhere different on a different seed', () => {
    const a = playOut(opening(7)).final;
    const b = playOut(opening(23)).final;
    expect(JSON.stringify(a.log)).not.toBe(JSON.stringify(b.log));
  });

  it('is stable enough to keep a golden log', () => {
    const { final } = playOut(opening(1));
    const digest = final.log.map((entry) => `${entry.beat} ${entry.event.k}`);
    expect(digest).toMatchSnapshot();
  });

  it('ends the fight the moment the player runs out of HP', () => {
    let state = dummyCombat({ deck: pileOf('heavy', 6), enemies: [biterEnemy(1, 9, { hp: 500 })], playerHp: 20 });
    while (state.outcome === 'ongoing') state = play(state, 'heavy');

    expect(state.outcome).toBe('lost');
    expect(playerOf(state).hp).toBe(0);
    expect(state.log.filter((e) => e.event.k === 'combat_end')).toHaveLength(1);
  });

  it('stops resolving the instant the last enemy dies', () => {
    const state = play(dummyCombat({ deck: ['heavy'], enemies: [biterEnemy(3, 6, { hp: 8 })] }), 'heavy');
    expect(state.outcome).toBe('won');
    expect(playerOf(state).hp).toBe(68);
  });
});
