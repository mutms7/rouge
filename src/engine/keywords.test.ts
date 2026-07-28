/**
 * One block per keyword in §3.6, plus Strain and the piles.
 *
 * These use the dummy cards rather than real content on purpose: a keyword test that
 * breaks when Paper Cut gets renumbered is testing the wrong thing.
 */
import { describe, expect, it } from 'vitest';
import { cardWeightInHand, reduce } from './combat';
import {
  actsBy,
  biterEnemy,
  combatantOf,
  dummyCombat,
  eventsOf,
  handUid,
  pileOf,
  play,
  playerOf,
  tickEnemy,
  turtleEnemy,
  wait,
} from './dummies';
import { lapOf } from './tally';

describe('Guard N', () => {
  it('absorbs damage first, then decays 1 per beat', () => {
    const state = play(dummyCombat({ deck: ['brace'], enemies: [biterEnemy(3, 6)] }), 'brace');
    const hit = eventsOf(state, 'damage').at(-1);

    expect(hit?.event).toMatchObject({ who: 'player', amount: 6, blocked: 5 });
    expect(playerOf(state).hp).toBe(67);
    expect(playerOf(state).guard).toBe(0);
  });
});

describe('Slip N', () => {
  it('pushes one enemy forward', () => {
    const state = play(dummyCombat({ deck: ['shove'], enemies: [tickEnemy(3)] }), 'shove');
    expect(combatantOf(state, 'tick').position).toBe(3);
    expect(eventsOf(state, 'slip').map((e) => e.event.n)).toEqual([3]);
  });

  it('pushes the whole board when the card says so', () => {
    const state = play(
      dummyCombat({
        deck: ['sweep'],
        enemies: [tickEnemy(3, { id: 'a' }), tickEnemy(3, { id: 'b' })],
      }),
      'sweep',
    );
    expect(combatantOf(state, 'a').position).toBe(2);
    expect(combatantOf(state, 'b').position).toBe(2);
    expect(actsBy(state, 'a')).toEqual([]);
    expect(actsBy(state, 'b')).toEqual([]);
  });
});

describe('Haste N', () => {
  it('pulls your own marker back and logs how far it actually moved', () => {
    let state = dummyCombat({ deck: ['heavy', 'dart'], enemies: [tickEnemy(3)] });
    state = play(state, 'heavy');
    state = play(state, 'dart');
    expect(playerOf(state).position).toBe(5);
    expect(eventsOf(state, 'haste').map((e) => e.event.n)).toEqual([2]);
  });
});

describe('Bleed N', () => {
  it('fires when the target acts and drops by 1 each time', () => {
    let state = play(dummyCombat({ deck: ['nick'], enemies: [biterEnemy(3, 6)] }), 'nick');
    expect(combatantOf(state, 'biter').hp).toBe(496);
    expect(combatantOf(state, 'biter').bleed).toBe(3);

    state = wait(state, 3);
    expect(combatantOf(state, 'biter').hp).toBe(493);
    expect(combatantOf(state, 'biter').bleed).toBe(2);
    expect(eventsOf(state, 'bleed_tick').map((e) => e.event.amount)).toEqual([4, 3]);
  });

  it('goes through Guard, so Guard-stacking enemies are not immune to it', () => {
    let state = dummyCombat({ deck: pileOf('nick', 1), enemies: [turtleEnemy(3, 10)] });
    state = wait(state); // let the turtle raise its shell first
    expect(combatantOf(state, 'turtle').guard).toBeGreaterThan(0);

    state = play(state, 'nick');
    state = wait(state, 3);
    const bleedHit = eventsOf(state, 'damage').find((e) => e.event.who === 'turtle');
    expect(bleedHit?.event).toMatchObject({ amount: 4, blocked: 0 });
    expect(combatantOf(state, 'turtle').hp).toBe(496);
    expect(combatantOf(state, 'turtle').guard).toBeGreaterThan(0);
  });
});

describe('Perjury N', () => {
  it('resolves exactly N beats later', () => {
    let state = play(dummyCombat({ deck: ['whisper'], enemies: [tickEnemy(3)] }), 'whisper');
    expect(eventsOf(state, 'perjury_sworn').map((e) => e.event.at)).toEqual([4]);
    expect(state.pending).toHaveLength(1);

    state = wait(state, 3);
    expect(eventsOf(state, 'perjury_resolved').map((e) => e.beat)).toEqual([4]);
    expect(combatantOf(state, 'tick').hp).toBe(492);
    expect(state.pending).toEqual([]);
  });

  it('fizzles if you take unblocked damage before it lands', () => {
    let state = play(dummyCombat({ deck: ['whisper'], enemies: [biterEnemy(3, 6)] }), 'whisper');
    expect(eventsOf(state, 'perjury_fizzled')).toHaveLength(1);
    expect(state.pending).toEqual([]);

    state = wait(state, 4);
    expect(eventsOf(state, 'perjury_resolved')).toEqual([]);
    expect(combatantOf(state, 'biter').hp).toBe(500);
  });

  it('survives damage that Guard ate: nobody caught you', () => {
    let state = dummyCombat({ deck: ['wall', 'whisper'], enemies: [biterEnemy(3, 6, { startBeat: 3 })] });
    state = play(state, 'wall');
    state = play(state, 'whisper');
    state = wait(state, 4);

    const blockedHit = eventsOf(state, 'damage').find((e) => e.event.who === 'player');
    expect(blockedHit?.event).toMatchObject({ amount: 6, blocked: 6 });
    expect(playerOf(state).hp).toBe(68);
    expect(eventsOf(state, 'perjury_fizzled')).toEqual([]);
    expect(eventsOf(state, 'perjury_resolved')).toHaveLength(1);
    expect(combatantOf(state, 'biter').hp).toBe(492);
  });

  it('survives your own Strain, because that is not somebody catching you', () => {
    let state = dummyCombat({ deck: ['whisper', ...pileOf('free', 4)], enemies: [tickEnemy(30)] });
    state = play(state, 'whisper');
    for (let i = 0; i < 4; i += 1) state = play(state, 'free');

    expect(eventsOf(state, 'strain_break')).toHaveLength(1);
    expect(playerOf(state).hp).toBe(63);
    expect(eventsOf(state, 'perjury_fizzled')).toEqual([]);

    state = wait(state, 3);
    expect(eventsOf(state, 'perjury_resolved')).toHaveLength(1);
    expect(combatantOf(state, 'tick').hp).toBe(492);
  });
});

describe('Echo', () => {
  it('puts a copy in your hand at Weight +1', () => {
    const state = play(dummyCombat({ deck: ['echo_jab'], enemies: [tickEnemy(3)] }), 'echo_jab');
    const copy = state.deck.hand.find((c) => c.cardId === 'echo_jab');

    expect(copy?.weightDelta).toBe(1);
    expect(copy && cardWeightInHand(state, copy.uid)).toBe(3);
    expect(eventsOf(state, 'echo')).toHaveLength(1);
  });

  it('drops the copy when the hand is already full', () => {
    const state = play(
      dummyCombat({ deck: pileOf('echo_study', 4), enemies: [tickEnemy(3)], handCap: 2, startingHand: 1 }),
      'echo_study',
    );
    expect(state.deck.hand).toHaveLength(2);
    expect(state.deck.hand.every((c) => c.weightDelta === 0)).toBe(true);
    expect(eventsOf(state, 'echo')).toEqual([]);
  });
});

describe('Exhaust', () => {
  it('leaves the combat instead of the discard, and lands in the run log', () => {
    const state = play(dummyCombat({ deck: ['burn', 'jab'], enemies: [tickEnemy(3)] }), 'burn');

    expect(state.deck.exhausted.map((c) => c.cardId)).toEqual(['burn']);
    expect(state.deck.discard).toEqual([]);
    expect(eventsOf(state, 'guard').map((e) => e.event.total)).toEqual([3]);
    expect(playerOf(state).guard).toBe(2); // one beat of decay by the time it is your turn
    expect(eventsOf(state, 'exhaust')).toHaveLength(1);
    expect(state.runLog).toEqual([{ k: 'card_exhausted', cardId: 'burn', beat: 0 }]);
  });

  it('stays out of the reshuffle', () => {
    let state = dummyCombat({ deck: pileOf('burn', 3), enemies: [tickEnemy(3)], handCap: 3, startingHand: 1 });
    for (let i = 0; i < 3; i += 1) state = play(state, 'burn');

    expect(state.deck.exhausted).toHaveLength(3);
    expect(state.deck.draw).toEqual([]);
    expect(state.deck.discard).toEqual([]);
    expect(state.deck.hand).toEqual([]);

    state = wait(state);
    expect(eventsOf(state, 'reshuffle')).toEqual([]);
    expect(state.deck.hand).toEqual([]);
  });
});

describe('Strain', () => {
  it('bills you 5 at the threshold and resets to zero', () => {
    let state = dummyCombat({ deck: pileOf('free', 5), enemies: [tickEnemy(30)] });
    for (let i = 0; i < 3; i += 1) state = play(state, 'free');
    expect(state.strain).toBe(9);
    expect(playerOf(state).hp).toBe(68);

    state = play(state, 'free');
    expect(eventsOf(state, 'strain_break').map((e) => e.event.damage)).toEqual([5]);
    expect(state.strain).toBe(0);
    expect(playerOf(state).hp).toBe(63);

    state = play(state, 'free');
    expect(state.strain).toBe(3);
  });

  it('ignores Guard, because it is not an attack', () => {
    let state = dummyCombat({ deck: ['wall', ...pileOf('free', 4)], enemies: [tickEnemy(30)] });
    state = play(state, 'wall');
    for (let i = 0; i < 4; i += 1) state = play(state, 'free');

    expect(playerOf(state).hp).toBe(63);
    expect(playerOf(state).guard).toBeGreaterThan(0);
  });
});

describe('the piles', () => {
  it('draws one per action and reshuffles the discard when the draw pile runs dry', () => {
    let state = dummyCombat({ deck: pileOf('jab', 4), enemies: [tickEnemy(3)], startingHand: 2 });
    expect(state.deck.hand).toHaveLength(2);

    state = play(state, 'jab');
    expect(state.deck.hand).toHaveLength(2);
    state = play(state, 'jab');
    expect(state.deck.draw).toEqual([]);

    state = play(state, 'jab');
    expect(eventsOf(state, 'reshuffle').map((e) => e.event.count)).toEqual([2]);
    expect(state.deck.hand).toHaveLength(2);
  });

  it('refuses to draw past the hand cap', () => {
    const state = play(
      dummyCombat({ deck: pileOf('study', 6), enemies: [tickEnemy(3)], handCap: 4, startingHand: 3 }),
      'study',
    );
    expect(state.deck.hand).toHaveLength(4);
  });
});

describe('Lap', () => {
  it('closes a lap when the clock reaches beat 24', () => {
    let state = dummyCombat({ deck: pileOf('heavy', 5), enemies: [tickEnemy(3)] });
    for (let i = 0; i < 5; i += 1) state = play(state, 'heavy');

    expect(eventsOf(state, 'lap_end')).toEqual([{ beat: 24, event: { k: 'lap_end', lap: 0 } }]);
    expect(state.beat).toBe(25);
    expect(lapOf(state.beat)).toBe(1);
  });
});

describe('Weight', () => {
  it('is the only cost: a card is always playable, it just moves your marker', () => {
    const state = dummyCombat({ deck: ['heavy'], enemies: [tickEnemy(3)] });
    const uid = handUid(state, 'heavy');
    expect(cardWeightInHand(state, uid)).toBe(5);
    const after = reduce(state, { k: 'play_card', uid });
    expect(playerOf(after).position).toBe(5);
  });
});
