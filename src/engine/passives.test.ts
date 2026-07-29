/**
 * The passive pipeline: Marks, Tokens and enemy traits, which are all the same shape.
 *
 * These use raw `Mod` literals rather than real Marks for the same reason the keyword tests
 * use dummy cards: a test about "+1 attack damage" should not break when Whetted gets
 * renumbered. `content/content.test.ts` checks that the real Marks are wired to the right
 * mods; this checks that the mods do what they say.
 */
import { describe, expect, it } from 'vitest';
import { effectiveWeight } from './combat';
import { collectMods, scaledValue } from './mods';
import { biterEnemy, combatantOf, dummyCombat, eventsOf, handUid, pileOf, play, playerOf, testCard, tickEnemy, wait } from './dummies';
import type { Mod } from './types';

describe('aggregation', () => {
  it('stacks additively, because nothing in the demo multiplies', () => {
    const passives = collectMods([
      { k: 'attack_damage', n: 1 },
      { k: 'attack_damage', n: 2 },
      { k: 'slip_bonus', n: 1 },
      { k: 'haste_bonus', n: 1 },
    ]);
    expect(passives.attackDamage).toBe(3);
    expect(passives.slipBonus).toBe(1);
    expect(passives.hasteBonus).toBe(1);
  });

  it('keys triggers by kind and position, so a once-only mod has an identity', () => {
    const passives = collectMods([
      { k: 'on_lap_end', effects: [{ k: 'self_damage', n: 1 }] },
      { k: 'on_lap_end', effects: [{ k: 'heal', n: 1 }] },
    ]);
    expect(passives.onLapEnd.map((t) => t.key)).toEqual(['on_lap_end#0', 'on_lap_end#1']);
  });

  it('caps a scaled bonus where the Mark says to', () => {
    const purse = { n: 1, per: 'salt' as const, divide: 25, max: 4 };
    expect(scaledValue(purse, 0)).toBe(0);
    expect(scaledValue(purse, 74)).toBe(2);
    expect(scaledValue(purse, 500)).toBe(4);
  });

  it('ignores the run-layer mods without needing a default case', () => {
    // If a new Mod variant is added without deciding what it aggregates into, this file
    // stops compiling. That is the point of the exhaustive switch in `mods.ts`.
    const passives = collectMods([{ k: 'assay_discount_pct', n: 20 }, { k: 'mark_slots', n: 1 }]);
    expect(passives.attackDamage).toBe(0);
  });
});

describe('damage passives', () => {
  it('adds to attacks and leaves everything else alone', () => {
    const whetted: Mod[] = [{ k: 'attack_damage', n: 1 }];
    const withMark = play(dummyCombat({ deck: ['jab'], mods: whetted, enemies: [tickEnemy(30)] }), 'jab');
    const without = play(dummyCombat({ deck: ['jab'], enemies: [tickEnemy(30)] }), 'jab');
    expect(combatantOf(without, 'tick').hp - combatantOf(withMark, 'tick').hp).toBe(1);

    // Bleed is not an attack, so Whetted does not touch it.
    const bleedMark = play(dummyCombat({ deck: ['nick'], mods: whetted, enemies: [tickEnemy(30)] }), 'nick');
    expect(combatantOf(bleedMark, 'tick').bleed).toBe(3);
  });

  it('pays the first-attack bonus exactly once', () => {
    let state = dummyCombat({
      deck: pileOf('jab', 4),
      mods: [{ k: 'first_attack_damage', n: 4 }],
      enemies: [tickEnemy(30)],
    });
    const start = combatantOf(state, 'tick').hp;
    state = play(state, 'jab');
    expect(start - combatantOf(state, 'tick').hp).toBe(9);
    const second = combatantOf(state, 'tick').hp;
    state = play(state, 'jab');
    expect(second - combatantOf(state, 'tick').hp).toBe(5);
  });

  it('scales off a count, capped', () => {
    const state = play(
      dummyCombat({
        salt: 80,
        deck: ['jab'],
        mods: [{ k: 'attack_damage_per', n: 1, per: 'salt', divide: 25, max: 4 }],
        enemies: [tickEnemy(30)],
      }),
      'jab',
    );
    expect(combatantOf(state, 'tick').hp).toBe(500 - (5 + 3));
  });

  it('chips Guard before Guard gets to block', () => {
    let state = dummyCombat({
      deck: pileOf('jab', 3),
      mods: [{ k: 'pierce', n: 3 }],
      enemies: [{ id: 'wall', hp: 100, intents: [{ id: 'shell', weight: 30, targeting: 'self', effects: [{ k: 'guard', n: 10 }] }] }],
    });
    state = wait(state); // shell goes up
    state = play(state, 'jab');
    // 10 Guard, minus a beat of melt, minus 3 pierced, then 5 damage into 6 Guard.
    expect(eventsOf(state, 'damage').at(-1)?.event).toMatchObject({ amount: 5, blocked: 5 });
    expect(combatantOf(state, 'wall').hp).toBe(100);
  });
});

describe('Guard passives', () => {
  it('adds to every Guard gain', () => {
    const state = play(dummyCombat({ deck: ['brace'], mods: [{ k: 'guard_gain', n: 2 }], enemies: [tickEnemy(30)] }), 'brace');
    expect(eventsOf(state, 'guard').map((e) => e.event.amount)).toEqual([7]);
  });

  it('slows the melt', () => {
    let state = dummyCombat({ deck: ['wall', ...pileOf('jab', 6)], mods: [{ k: 'guard_decay', n: 1 }], enemies: [tickEnemy(30)] });
    state = play(state, 'wall'); // Guard 12
    state = wait(state, 4);
    // Four beats elapsed and nothing melted, because decay is 1 slower than 1.
    expect(playerOf(state).guard).toBe(12);
  });

  it('holds the first Guard of each lap off decay', () => {
    let state = dummyCombat({
      deck: ['brace', ...pileOf('jab', 8)],
      mods: [{ k: 'lap_first_guard_frozen', n: 4 }],
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'brace');
    state = wait(state, 3);
    expect(playerOf(state).guard).toBe(5);
    state = wait(state, 2);
    expect(playerOf(state).guard).toBeLessThan(5);
  });

  it('does not decay at all during the first lap', () => {
    let state = dummyCombat({
      deck: ['wall', ...pileOf('jab', 10)],
      mods: [{ k: 'guard_no_decay_first_lap' }],
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'wall');
    state = wait(state, 10);
    expect(state.beat).toBeLessThan(24);
    expect(playerOf(state).guard).toBe(12);
  });
});

describe('lap and hand passives', () => {
  it('draws extra at combat start and raises the hand cap', () => {
    const state = dummyCombat({
      deck: pileOf('jab', 12),
      mods: [
        { k: 'combat_start_draw', n: 1 },
        { k: 'hand_cap', n: 1 },
      ],
      enemies: [tickEnemy(30)],
      startingHand: 5,
      handCap: 6,
    });
    expect(state.deck.hand).toHaveLength(6);
    expect(state.handCap).toBe(7);
  });

  it('raises max HP before the opening hand is dealt', () => {
    const state = dummyCombat({ deck: ['jab'], playerHp: 68, mods: [{ k: 'max_hp', n: 15 }], enemies: [tickEnemy(30)] });
    expect(playerOf(state).maxHp).toBe(83);
    expect(playerOf(state).hp).toBe(68);
  });

  it('draws at the top of each lap', () => {
    let state = dummyCombat({
      deck: pileOf('heavy', 12),
      mods: [{ k: 'lap_draw', n: 1 }],
      enemies: [tickEnemy(30)],
      startingHand: 6,
    });
    const opening = eventsOf(state, 'draw').length;
    for (let i = 0; i < 5 && state.beat < 24; i += 1) state = play(state, 'heavy');
    expect(state.beat).toBeGreaterThanOrEqual(24);
    // The lap boundary drew one on top of the one-per-action draws.
    expect(eventsOf(state, 'draw').length).toBeGreaterThan(opening + 5);
  });

  it('discounts one card per lap and only one', () => {
    let state = dummyCombat({
      deck: pileOf('heavy', 4),
      mods: [{ k: 'lap_discount', n: 1 }],
      enemies: [tickEnemy(30)],
    });
    expect(effectiveWeight(state, handUid(state, 'heavy'))).toBe(4);
    state = play(state, 'heavy');
    expect(effectiveWeight(state, handUid(state, 'heavy'))).toBe(5);
  });

  it('gives the nth card of a lap its boon, repeating or not', () => {
    const once = dummyCombat({ deck: pileOf('heavy', 4), mods: [{ k: 'lap_nth_card', n: 1, boon: { weight: 0 } }], enemies: [tickEnemy(30)] });
    expect(effectiveWeight(once, handUid(once, 'heavy'))).toBe(0);
    const after = play(once, 'heavy');
    expect(effectiveWeight(after, handUid(after, 'heavy'))).toBe(5);

    let every = dummyCombat({
      deck: pileOf('heavy', 6),
      mods: [{ k: 'lap_nth_card', n: 3, boon: { weight: 0 }, repeating: true }],
      enemies: [tickEnemy(30)],
    });
    expect(effectiveWeight(every, handUid(every, 'heavy'))).toBe(5);
    every = play(every, 'heavy');
    every = play(every, 'heavy');
    // Third card of the lap.
    expect(effectiveWeight(every, handUid(every, 'heavy'))).toBe(0);
  });

  it('slips the first enemy action of each lap', () => {
    // Ties go to the player, so the biter has not moved yet in the opening state. Spend an
    // action to bring it up.
    const state = play(
      dummyCombat({
        deck: pileOf('jab', 4),
        mods: [{ k: 'lap_first_enemy_slip', n: 1 }],
        enemies: [biterEnemy(3, 6)],
      }),
      'jab',
    );
    // Its opening swing was spent being pushed a beat instead.
    expect(eventsOf(state, 'slip').map((e) => e.event.n)).toEqual([1]);
    expect(playerOf(state).hp).toBe(68);
  });

  it('pays out for standing still', () => {
    let state = dummyCombat({
      deck: pileOf('jab', 6),
      mods: [{ k: 'idle_guard', beats: 6, n: 8 }],
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'jab'); // starts the clock on the idle window
    state = wait(state, 6);
    expect(eventsOf(state, 'guard').some((e) => e.event.amount === 8)).toBe(true);
  });
});

describe('triggers', () => {
  it('fires at combat start, before the opening hand', () => {
    const state = dummyCombat({
      deck: pileOf('jab', 6),
      mods: [{ k: 'on_combat_start', effects: [{ k: 'guard', n: 4 }] }],
      enemies: [tickEnemy(30)],
    });
    expect(playerOf(state).guard).toBe(4);
  });

  it('fires at the end of a lap', () => {
    let state = dummyCombat({
      deck: pileOf('heavy', 8),
      mods: [{ k: 'on_lap_end', effects: [{ k: 'self_damage', n: 1 }] }],
      enemies: [tickEnemy(30)],
    });
    for (let i = 0; i < 5 && state.beat < 24; i += 1) state = play(state, 'heavy');
    expect(playerOf(state).hp).toBe(67);
  });

  it('fires on a kill, for whoever landed it', () => {
    const state = play(
      dummyCombat({
        deck: ['jab'],
        mods: [{ k: 'on_kill', effects: [{ k: 'haste', n: 3 }] }],
        enemies: [tickEnemy(30, { hp: 5 })],
      }),
      'jab',
    );
    expect(state.outcome).toBe('won');
    expect(eventsOf(state, 'haste').length).toBeGreaterThan(0);
  });

  it('fires on a discard', () => {
    const state = play(
      dummyCombat({
        deck: ['toss', 'jab', 'jab'],
        cards: { toss: testCard('toss', [{ k: 'discard', n: 1 }]) },
        mods: [{ k: 'on_discard', effects: [{ k: 'damage_random', n: 2 }] }],
        enemies: [tickEnemy(30)],
      }),
      'toss',
    );
    // Two discards: the one the card forced, and the card itself going to the pile.
    expect(combatantOf(state, 'tick').hp).toBe(496);
  });

  it('fires once when HP crosses the line, and not again', () => {
    let state = dummyCombat({
      playerHp: 30,
      playerMaxHp: 100,
      deck: pileOf('jab', 8),
      mods: [{ k: 'below_hp_pct', pct: 30, effects: [{ k: 'guard', n: 20 }] }],
      enemies: [biterEnemy(2, 3)],
    });
    state = play(state, 'jab');
    const fired = eventsOf(state, 'guard').filter((e) => e.event.amount === 20);
    expect(fired).toHaveLength(1);

    state = wait(state, 6);
    expect(eventsOf(state, 'guard').filter((e) => e.event.amount === 20)).toHaveLength(1);
  });
});

describe('perjury passives', () => {
  it('resolves sooner', () => {
    const state = play(
      dummyCombat({ deck: ['whisper'], mods: [{ k: 'perjury_sooner', n: 2 }], enemies: [tickEnemy(30)] }),
      'whisper',
    );
    expect(eventsOf(state, 'perjury_sworn').map((e) => e.event.at)).toEqual([2]);
  });

  it('never resolves on the same beat it was sworn, however much is stacked', () => {
    const state = play(
      dummyCombat({ deck: ['whisper'], mods: [{ k: 'perjury_sooner', n: 99 }], enemies: [tickEnemy(30)] }),
      'whisper',
    );
    // Clamped to at least one beat. A lie that is true the instant you tell it is not one.
    expect(eventsOf(state, 'perjury_sworn').map((e) => e.event.at)).toEqual([1]);
  });

  it('hits harder when it lands', () => {
    let state = dummyCombat({
      deck: ['whisper'],
      mods: [{ k: 'perjury_damage_pct', n: 50 }],
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'whisper');
    state = wait(state, 4);
    // Whisper swears 8 damage; +50% is 12.
    expect(combatantOf(state, 'tick').hp).toBe(488);
  });
});

describe('enemy-facing passives', () => {
  it('starts every enemy behind the line', () => {
    const state = dummyCombat({
      deck: pileOf('jab', 4),
      mods: [{ k: 'enemies_start_slipped', n: 3 }],
      enemies: [biterEnemy(3, 6), tickEnemy(3, { id: 'other' })],
    });
    expect(combatantOf(state, 'biter').position).toBe(3);
    expect(combatantOf(state, 'other').position).toBe(3);
    expect(playerOf(state).hp).toBe(68);
  });

  it('adds beats to Slip and Haste', () => {
    const slipped = play(
      dummyCombat({ deck: ['shove'], mods: [{ k: 'slip_bonus', n: 1 }], enemies: [tickEnemy(30)] }),
      'shove',
    );
    expect(eventsOf(slipped, 'slip').map((e) => e.event.n)).toEqual([4]);

    // Haste can never pull the marker behind the clock, and by the time the player acts the
    // clock has caught up to them. So a Haste card can only ever claw back its own Weight,
    // and the bonus is only visible on a card heavy enough to leave room for it.
    const bolt = testCard('bolt', [{ k: 'haste', n: 4 }], { weight: 5 });
    const plain = play(dummyCombat({ deck: ['bolt'], cards: { bolt }, enemies: [tickEnemy(30)] }), 'bolt');
    expect(eventsOf(plain, 'haste').map((e) => e.event.n)).toEqual([4]);

    const boosted = play(
      dummyCombat({ deck: ['bolt'], cards: { bolt }, mods: [{ k: 'haste_bonus', n: 1 }], enemies: [tickEnemy(30)] }),
      'bolt',
    );
    expect(eventsOf(boosted, 'haste').map((e) => e.event.n)).toEqual([5]);
  });

  it('adds to Bleed', () => {
    const state = play(dummyCombat({ deck: ['nick'], mods: [{ k: 'bleed_bonus', n: 2 }], enemies: [tickEnemy(30)] }), 'nick');
    expect(eventsOf(state, 'bleed').map((e) => e.event.n)).toEqual([6]);
  });

  it('pushes the intent horizon out', () => {
    const state = dummyCombat({ deck: ['jab'], mods: [{ k: 'intent_horizon', n: 24 }], enemies: [tickEnemy(3)] });
    expect(state.intentHorizon).toBe(48);
  });
});
