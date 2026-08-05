/**
 * One block per effect atom added in phase 2.
 *
 * Same discipline as `keywords.test.ts`: these use one-off dummy definitions rather than
 * real cards, so a failure points at the atom rather than at whatever Sixpence Trick
 * happens to cost this week. The real cards are checked for *shape* in
 * `content/content.test.ts`, which is a different question.
 */
import { describe, expect, it } from 'vitest';
import { effectiveWeight, reduce } from './combat';
import {
  biterEnemy,
  combatantOf,
  dummyCombat,
  eventsOf,
  handUid,
  pileOf,
  play,
  playerOf,
  testCard,
  tickEnemy,
  wait,
} from './dummies';
import type { CardDef } from './types';

const compound: CardDef = testCard('junk', [], { playable: false, load: 2 });

describe('damage, scaled and pierced', () => {
  it('ignores Guard entirely when the card says so', () => {
    let state = dummyCombat({
      deck: ['pry', 'pry'],
      cards: { pry: testCard('pry', [{ k: 'damage', n: 8, pierce: true }], { type: 'attack', targeting: 'opponent' }) },
      enemies: [{ id: 'wall', hp: 100, intents: [{ id: 'shell', weight: 3, targeting: 'self', effects: [{ k: 'guard', n: 20 }] }] }],
    });
    // Waiting costs a beat, so the shell has already melted 1 by the time we swing.
    state = wait(state);
    expect(combatantOf(state, 'wall').guard).toBe(19);

    state = play(state, 'pry');
    expect(combatantOf(state, 'wall').hp).toBe(92);
    // Guard blocked none of it. What came off is one more beat of melt, not the pry.
    expect(eventsOf(state, 'damage').at(-1)?.event).toMatchObject({ amount: 8, blocked: 0 });
    expect(combatantOf(state, 'wall').guard).toBe(18);
  });

  it('scales off a count, divided first', () => {
    // 3 cards exhausted, 4 damage each. Everything I Told You, in miniature.
    // Counted off the exhaust pile rather than the discard, because drawing after a play
    // reshuffles the discard back in and there would be nothing stable to count.
    let state = dummyCombat({
      deck: ['burn', 'burn', 'burn', 'drift'],
      cards: {
        drift: testCard('drift', [{ k: 'damage_per', n: 4, per: 'exhausted' }], {
          type: 'attack',
          targeting: 'opponent',
        }),
      },
      enemies: [tickEnemy(30)],
    });
    for (let i = 0; i < 3; i += 1) state = play(state, 'burn');
    expect(state.deck.exhausted).toHaveLength(3);

    const before = combatantOf(state, 'tick').hp;
    state = play(state, 'drift');
    expect(before - combatantOf(state, 'tick').hp).toBe(12);
  });

  it('divides before multiplying, so a third of missing HP is a third', () => {
    let state = dummyCombat({
      playerHp: 68,
      deck: ['face'],
      cards: {
        face: testCard('face', [{ k: 'damage_per', n: 1, per: 'missing_hp', divide: 3 }], {
          type: 'attack',
          targeting: 'opponent',
        }),
      },
      enemies: [biterEnemy(2, 10, { startBeat: 0 })],
    });
    // Take some damage first, then measure. 68 max, so missing HP is whatever landed.
    state = wait(state, 3);
    const missing = playerOf(state).maxHp - playerOf(state).hp;
    expect(missing).toBeGreaterThan(0);

    const before = combatantOf(state, 'biter').hp;
    state = play(state, 'face');
    expect(before - combatantOf(state, 'biter').hp).toBe(Math.floor(missing / 3));
  });
});

describe('heal and Salt', () => {
  it('heals, but never above the ceiling', () => {
    let state = dummyCombat({
      playerHp: 60,
      playerMaxHp: 68,
      deck: pileOf('tonic', 3),
      cards: { tonic: testCard('tonic', [{ k: 'heal', n: 6 }]) },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'tonic');
    expect(playerOf(state).hp).toBe(66);
    state = play(state, 'tonic');
    expect(playerOf(state).hp).toBe(68);
    expect(eventsOf(state, 'heal').map((e) => e.event.amount)).toEqual([6, 2]);
  });

  it('banks Salt, and only spends it when it is there', () => {
    let state = dummyCombat({
      deck: ['mine', 'bribe', 'bribe'],
      cards: {
        mine: testCard('mine', [{ k: 'salt', n: 4 }]),
        bribe: testCard('bribe', [{ k: 'spend_salt', n: 4, effects: [{ k: 'slip', n: 6 }] }], {
          targeting: 'opponent',
        }),
      },
      enemies: [tickEnemy(30)],
    });
    // No Salt yet, so the bribe does nothing at all.
    state = play(state, 'bribe');
    expect(state.salt).toBe(0);
    expect(eventsOf(state, 'slip')).toEqual([]);

    state = play(state, 'mine');
    expect(state.salt).toBe(4);
    state = play(state, 'bribe');
    expect(state.salt).toBe(0);
    expect(eventsOf(state, 'slip').map((e) => e.event.n)).toEqual([6]);
  });

  it('steals Guard off the target, capped, and keeps what it took', () => {
    let state = dummyCombat({
      salt: 30,
      deck: ['sixpence'],
      cards: {
        sixpence: testCard('sixpence', [{ k: 'steal_guard', n: 1, per: 'salt', divide: 5, max: 5 }], {
          targeting: 'opponent',
        }),
      },
      enemies: [{ id: 'wall', hp: 100, intents: [{ id: 'shell', weight: 3, targeting: 'self', effects: [{ k: 'guard', n: 20 }] }] }],
    });
    state = wait(state);
    expect(combatantOf(state, 'wall').guard).toBe(19); // one beat of melt already

    state = play(state, 'sixpence');
    // 30 Salt over 5 is 6, capped at 5. 19 - 5 stolen, then a beat of melt on both sides.
    expect(eventsOf(state, 'guard').map((e) => e.event.amount)).toEqual([20, 5]);
    expect(combatantOf(state, 'wall').guard).toBe(13);
    expect(playerOf(state).guard).toBe(4);
  });
});

describe('timed effects that are not lies', () => {
  it('fires at the top of your next action, and nothing can catch it', () => {
    let state = dummyCombat({
      deck: ['two_truths', 'jab'],
      cards: {
        two_truths: testCard('two_truths', [
          { k: 'damage', n: 6 },
          { k: 'next_action', effects: [{ k: 'damage', n: 6 }] },
        ], { type: 'attack', targeting: 'opponent' }),
      },
      enemies: [biterEnemy(1, 4)],
    });
    const before = combatantOf(state, 'biter').hp;
    state = play(state, 'two_truths');
    expect(before - combatantOf(state, 'biter').hp).toBe(6);

    // The biter hit us in between, which would have fizzled a perjury. This is not one.
    expect(playerOf(state).hp).toBeLessThan(68);
    state = play(state, 'jab');
    expect(before - combatantOf(state, 'biter').hp).toBe(6 + 6 + 5);
  });

  it('bills you at the next lap boundary', () => {
    let state = dummyCombat({
      deck: ['honour', ...pileOf('heavy', 6)],
      cards: {
        honour: testCard('honour', [
          { k: 'guard', n: 12 },
          { k: 'next_lap', effects: [{ k: 'self_damage', n: 6 }] },
        ], { weight: 3, targeting: 'self' }),
      },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'honour');
    expect(playerOf(state).hp).toBe(68);
    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0]?.at).toBe(24);

    // Walk the clock past the boundary.
    for (let i = 0; i < 5 && state.beat < 24; i += 1) state = play(state, 'heavy');
    expect(state.beat).toBeGreaterThanOrEqual(24);
    expect(playerOf(state).hp).toBe(62);
    expect(state.scheduled).toEqual([]);
  });

  it('pays out an on-kill rider only when the kill happens', () => {
    const nick = testCard('nick2', [
      { k: 'damage', n: 4 },
      { k: 'on_kill', effects: [{ k: 'haste', n: 4 }] },
    ], { weight: 2, type: 'attack', targeting: 'opponent' });

    const survives = play(dummyCombat({ deck: ['nick2'], cards: { nick2: nick }, enemies: [tickEnemy(30)] }), 'nick2');
    expect(eventsOf(survives, 'haste')).toEqual([]);

    const kills = play(
      dummyCombat({ deck: ['nick2'], cards: { nick2: nick }, enemies: [tickEnemy(30, { hp: 4 })] }),
      'nick2',
    );
    expect(eventsOf(kills, 'haste').map((e) => e.event.n)).toEqual([2]);
  });
});

describe('boons', () => {
  it('makes the next card free, and only the next one', () => {
    let state = dummyCombat({
      deck: ['grease', 'heavy', 'heavy'],
      cards: { grease: testCard('grease', [{ k: 'empower_next', n: 1, boon: { weight: 0 } }], { weight: 0 }) },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'grease');
    expect(effectiveWeight(state, handUid(state, 'heavy'))).toBe(0);

    const at = playerOf(state).position;
    state = play(state, 'heavy');
    expect(playerOf(state).position).toBe(at);
    expect(effectiveWeight(state, handUid(state, 'heavy'))).toBe(5);
  });

  it('turns the next card into a promise when the boon says Perjury', () => {
    let state = dummyCombat({
      deck: ['perjure', 'jab'],
      cards: {
        perjure: testCard('perjure', [{ k: 'empower_next', n: 1, boon: { weight: 0, perjuryIn: 6 }, untilLapEnd: true }], {
          weight: 0,
        }),
      },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'perjure');
    const before = combatantOf(state, 'tick').hp;
    state = play(state, 'jab');

    // Nothing landed yet: the whole card is sworn rather than played.
    expect(combatantOf(state, 'tick').hp).toBe(before);
    expect(eventsOf(state, 'perjury_sworn').map((e) => e.event.at)).toEqual([6]);

    state = wait(state, 6);
    expect(combatantOf(state, 'tick').hp).toBe(before - 5);
  });

  it('frees every card for the lap, then expires with it', () => {
    let state = dummyCombat({
      deck: ['unwritten', ...pileOf('heavy', 4)],
      cards: { unwritten: testCard('unwritten', [{ k: 'lap_boon', boon: { weight: 0 } }], { weight: 0 }) },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'unwritten');
    for (let i = 0; i < 4; i += 1) state = play(state, 'heavy');
    // Four Weight 5 cards for nothing: the clock has not moved at all.
    expect(playerOf(state).position).toBe(0);
    expect(state.boons).toHaveLength(1);
  });
});

describe('the piles, reached into', () => {
  it('returns the last played card to hand at the Weight the card names', () => {
    let state = dummyCombat({
      deck: ['heavy', 'recant'],
      cards: { recant: testCard('recant', [{ k: 'return_last', weight: 0 }]) },
      enemies: [tickEnemy(30)],
    });
    state = play(state, 'heavy');
    expect(state.deck.discard.map((c) => c.cardId)).toEqual(['heavy']);

    state = play(state, 'recant');
    expect(state.deck.discard.map((c) => c.cardId)).toEqual(['recant']);
    expect(effectiveWeight(state, handUid(state, 'heavy'))).toBe(0);
  });

  it('discards at random and reports what left', () => {
    const state = play(
      dummyCombat({
        deck: ['toss', 'jab', 'jab', 'brace'],
        cards: { toss: testCard('toss', [{ k: 'discard', n: 2 }]) },
        enemies: [tickEnemy(30)],
      }),
      'toss',
    );
    expect(eventsOf(state, 'discard')).toHaveLength(2);
  });

  it('copies the enemy intent into hand at the Weight the card names', () => {
    const state = play(
      dummyCombat({
        deck: ['witness'],
        cards: { witness: testCard('witness', [{ k: 'copy_intent', weight: 2 }], { weight: 2 }) },
        enemies: [biterEnemy(4, 9)],
      }),
      'witness',
    );
    const copy = state.deck.hand.find((c) => c.cardId.startsWith('witness_'));
    expect(copy).toBeDefined();
    expect(copy && effectiveWeight(state, copy.uid)).toBe(2);
    expect(copy && state.library[copy.cardId]?.effects).toEqual([{ k: 'damage', n: 9 }]);
  });
});

describe('Compounds', () => {
  it('cannot be played: it just sits there', () => {
    const state = dummyCombat({ deck: ['junk', 'jab'], cards: { junk: compound }, enemies: [tickEnemy(30)] });
    const uid = handUid(state, 'junk');
    expect(state.deck.hand.map((c) => c.cardId)).toContain('junk');
    expect(legalUids(state)).not.toContain(uid);
    expect(() => reduce(state, { k: 'play_card', uid })).toThrow(/unplayable/);
  });

  it('gets dug out of the piles, and pays Guard for the whole lot', () => {
    let state = dummyCombat({
      deck: ['junk', 'junk', 'junk', 'purge'],
      cards: { junk: compound, purge: testCard('purge', [{ k: 'purge_compounds', guardPer: 5 }]) },
      enemies: [tickEnemy(30)],
    });
    expect(state.deck.hand.filter((c) => c.cardId === 'junk')).toHaveLength(3);

    state = play(state, 'purge');
    expect(state.deck.hand.filter((c) => c.cardId === 'junk')).toEqual([]);
    expect(eventsOf(state, 'compound_removed')).toHaveLength(3);
    // Three Compounds at 5 Guard each, measured at the moment it was granted: by the time
    // the player acts again a beat has passed and one has melted off.
    expect(eventsOf(state, 'guard').map((e) => e.event.amount)).toEqual([15]);
    expect(playerOf(state).guard).toBe(14);
  });

  it('bites on the way into your hand when the card says so', () => {
    const accrual: CardDef = testCard('accrual', [], {
      playable: false,
      mods: [{ k: 'on_draw', effects: [{ k: 'self_damage', n: 2 }] }],
    });
    const state = dummyCombat({
      deck: ['accrual', 'accrual', 'jab'],
      cards: { accrual },
      enemies: [tickEnemy(30)],
      startingHand: 3,
    });
    expect(playerOf(state).hp).toBe(64);
  });

  it('stops you gaining Guard while it is in your hand', () => {
    const grief: CardDef = testCard('grief_unpaid', [], { playable: false, mods: [{ k: 'in_hand_no_guard' }] });
    const state = play(
      dummyCombat({ deck: ['grief_unpaid', 'brace'], cards: { grief_unpaid: grief }, enemies: [tickEnemy(30)] }),
      'brace',
    );
    expect(playerOf(state).guard).toBe(0);
    expect(eventsOf(state, 'guard')).toEqual([]);
  });

  it('hurries the enemy along at the end of every lap it sits through', () => {
    const foreclosure: CardDef = testCard('foreclosure', [], {
      playable: false,
      mods: [{ k: 'in_hand_lap_end', effects: [{ k: 'enemy_haste', n: 1 }] }],
    });
    let state = dummyCombat({
      deck: ['foreclosure', ...pileOf('heavy', 6)],
      cards: { foreclosure },
      enemies: [tickEnemy(30)],
    });
    for (let i = 0; i < 5 && state.beat < 24; i += 1) state = play(state, 'heavy');
    expect(state.beat).toBeGreaterThanOrEqual(24);
    expect(eventsOf(state, 'haste').some((e) => e.event.who === 'tick')).toBe(true);
  });
});

describe('wards and windows', () => {
  it('eats the killing blow once, then burns the card that armed it', () => {
    let state = dummyCombat({
      playerHp: 10,
      playerMaxHp: 68,
      deck: ['switch', ...pileOf('jab', 3)],
      cards: { switch: testCard('switch', [{ k: 'survive_lethal', heal: 15 }], { weight: 2 }) },
      enemies: [biterEnemy(2, 40)],
    });
    state = play(state, 'switch');
    expect(state.outcome).toBe('ongoing');
    expect(playerOf(state).hp).toBe(15);
    expect(eventsOf(state, 'ward_spent')).toHaveLength(1);
    expect(state.deck.exhausted.map((c) => c.cardId)).toEqual(['switch']);
    expect(state.wards).toEqual([]);
  });

  it('multiplies damage inside a vulnerable window and not outside it', () => {
    // The Notary's re-ink, in miniature: two beats of triple damage.
    let state = dummyCombat({
      deck: pileOf('jab', 6),
      enemies: [
        {
          id: 'clerk',
          hp: 200,
          intents: [
            { id: 'reink', weight: 2, targeting: 'self', effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] },
            { id: 'idle', weight: 8, targeting: 'none', effects: [] },
          ],
        },
      ],
    });
    // Ties on the track go to the player, so wait one beat to let the clerk re-ink first.
    state = wait(state);
    expect(combatantOf(state, 'clerk').vulnerableUntil).toBe(2);

    const open = combatantOf(state, 'clerk').hp;
    state = play(state, 'jab');
    expect(open - combatantOf(state, 'clerk').hp).toBe(15); // 5, tripled

    state = wait(state, 3);
    const shut = combatantOf(state, 'clerk').hp;
    state = play(state, 'jab');
    expect(shut - combatantOf(state, 'clerk').hp).toBe(5); // window closed
  });
});

describe('enemy traits', () => {
  it('copies the last card you played', () => {
    let state = dummyCombat({
      deck: ['heavy', 'jab'],
      enemies: [
        {
          id: 'wraith',
          hp: 200,
          mods: [{ k: 'mirror_last_card' }],
          intents: [{ id: 'blank', weight: 3, targeting: 'opponent', effects: [{ k: 'damage', n: 1 }] }],
        },
      ],
    });
    state = play(state, 'heavy'); // Weight 5, deals 12
    expect(state.log.some((e) => e.event.k === 'act' && e.event.what === 'mirror_heavy')).toBe(true);
    expect(playerOf(state).hp).toBe(56);
  });

  it('copies only what you aimed at it, so your own Guard cannot arm it', () => {
    // The distinction phase 6 had to draw. Mirroring a self-targeted card handed the Wraith the
    // same Guard, which turned the encounter into a stalemate engine that scaled with the
    // defensive half of the player's deck: raising Flinch from 5 to 8 took the fight from 19
    // beats to 77, with neither side able to finish.
    const wraith = {
      id: 'wraith',
      hp: 200,
      mods: [{ k: 'mirror_last_card' }] as const,
      intents: [{ id: 'blank', weight: 3, targeting: 'opponent' as const, effects: [{ k: 'damage' as const, n: 1 }] }],
    };

    const guarded = play(dummyCombat({ deck: ['wall', 'jab'], enemies: [wraith] }), 'wall');
    expect(combatantOf(guarded, 'wraith').guard).toBe(0);
    expect(guarded.log.some((e) => e.event.k === 'act' && e.event.what === 'mirror_wall')).toBe(false);
    // It falls back to the blank it was given, which is the whole reason it has one.
    expect(guarded.log.some((e) => e.event.k === 'act' && e.event.what === 'blank')).toBe(true);

    // An attack still comes straight back, which is the lesson the fight is built to teach.
    const struck = play(dummyCombat({ deck: ['jab', 'wall'], enemies: [wraith] }), 'jab');
    expect(struck.log.some((e) => e.event.k === 'act' && e.event.what === 'mirror_jab')).toBe(true);
  });

  it('bites when you play something heavy, and not otherwise', () => {
    const hound = {
      id: 'hound',
      hp: 200,
      mods: [{ k: 'punish_heavy', minWeight: 3, n: 4 }] as const,
      intents: [{ id: 'idle', weight: 30, targeting: 'none' as const, effects: [] }],
    };
    const light = play(dummyCombat({ deck: ['jab', 'heavy'], enemies: [hound] }), 'jab');
    expect(playerOf(light).hp).toBe(68);

    const heavy = play(dummyCombat({ deck: ['heavy', 'jab'], enemies: [hound] }), 'heavy');
    expect(playerOf(heavy).hp).toBe(64);
  });

  it('takes reduced damage while its paperwork is standing', () => {
    let state = dummyCombat({
      deck: pileOf('jab', 8),
      enemies: [
        {
          id: 'fined',
          hp: 40,
          mods: [{ k: 'shielded_by', allyId: 'paper', pct: 70 }],
          intents: [{ id: 'plead', weight: 30, targeting: 'none', effects: [] }],
        },
        { id: 'paper', hp: 5, intents: [{ id: 'settle', weight: 30, targeting: 'none', effects: [] }] },
      ],
    });
    state = reduce(state, { k: 'play_card', uid: handUid(state, 'jab'), targetId: 'fined' });
    expect(combatantOf(state, 'fined').hp).toBe(38); // ceil(5 * 0.3) = 2

    state = reduce(state, { k: 'play_card', uid: handUid(state, 'jab'), targetId: 'paper' });
    expect(combatantOf(state, 'paper').hp).toBe(0);

    state = reduce(state, { k: 'play_card', uid: handUid(state, 'jab'), targetId: 'fined' });
    expect(combatantOf(state, 'fined').hp).toBe(33); // full 5 now
  });

  it('doubles the survivor when its partner dies', () => {
    const pair = (id: string, hp: number) => ({
      id,
      hp,
      mods: [{ k: 'on_ally_death_double' }] as const,
      intents: [{ id: `${id}_hit`, weight: 4, targeting: 'opponent' as const, effects: [{ k: 'damage' as const, n: 5 }] }],
    });
    let state = dummyCombat({ deck: pileOf('heavy', 6), enemies: [pair('kesk', 12), pair('ledger', 45)] });

    state = reduce(state, { k: 'play_card', uid: handUid(state, 'heavy'), targetId: 'kesk' });
    expect(combatantOf(state, 'kesk').hp).toBe(0);
    expect(combatantOf(state, 'ledger').hp).toBe(90);
    expect(combatantOf(state, 'ledger').maxHp).toBe(90);
    expect(combatantOf(state, 'ledger').damageScale).toBe(2);
  });

  it('swaps its intent list at the phase threshold', () => {
    let state = dummyCombat({
      deck: pileOf('heavy', 8),
      enemies: [
        {
          id: 'boss',
          hp: 24,
          mods: [{ k: 'phase_at_hp_pct', pct: 50 }],
          intents: [{ id: 'early', weight: 4, targeting: 'none', effects: [] }],
          phases: [[{ id: 'late', weight: 4, targeting: 'opponent', effects: [{ k: 'damage', n: 3 }] }]],
        },
      ],
    });
    expect(combatantOf(state, 'boss').phase).toBe(1);
    state = play(state, 'heavy'); // 12 damage, exactly half
    state = play(state, 'heavy');
    expect(combatantOf(state, 'boss').phase).toBe(2);
    expect(eventsOf(state, 'phase').map((e) => e.event.phase)).toEqual([2]);
  });

  it('takes Salt off you and holds it, then digests a stack per lap', () => {
    let state = dummyCombat({
      salt: 20,
      deck: pileOf('heavy', 8),
      enemies: [
        {
          id: 'wolf',
          hp: 300,
          mods: [{ k: 'salt_hoard_decay', n: 1 }],
          intents: [{ id: 'bite', weight: 6, targeting: 'opponent', effects: [{ k: 'steal_salt', n: 5 }] }],
        },
      ],
    });
    state = play(state, 'heavy');
    expect(state.salt).toBe(15);
    expect(combatantOf(state, 'wolf').saltHoard).toBe(5);

    for (let i = 0; i < 5 && state.beat < 24; i += 1) state = play(state, 'heavy');
    expect(state.beat).toBeGreaterThanOrEqual(24);
    // Four bites banked 20, minus one stack digested at the boundary.
    expect(combatantOf(state, 'wolf').saltHoard).toBeLessThan(20);
  });

  it('buffs an ally rather than itself', () => {
    const owed = (id: string, offset: number) => ({
      id,
      hp: 200,
      intentOffset: offset,
      intents: [
        { id: 'urge', weight: 3, targeting: 'none' as const, effects: [{ k: 'ally_damage' as const, n: 3 }] },
        { id: 'grasp', weight: 3, targeting: 'opponent' as const, effects: [{ k: 'damage' as const, n: 5 }] },
      ],
    });
    // One Weight 1 card, so exactly one action each happens before we look.
    let state = dummyCombat({ deck: pileOf('jab', 4), enemies: [owed('a', 0), owed('b', 1)] });
    state = reduce(state, { k: 'play_card', uid: handUid(state, 'jab'), targetId: 'a' });
    // `a` urged, so `b` hits harder than the 5 printed on its intent.
    expect(combatantOf(state, 'b').damageBonus).toBe(3);
    expect(combatantOf(state, 'a').damageBonus).toBe(0);
  });
});

/** Uids the reducer will actually accept right now. */
function legalUids(state: Parameters<typeof effectiveWeight>[0]): string[] {
  return state.deck.hand.filter((c) => state.library[c.cardId]?.playable !== false).map((c) => c.uid);
}
