import { describe, expect, it } from 'vitest';
import { CARDS, COMPOUND_IDS } from '../content/cards';
import { RUN_CONTENT } from '../content/library';
import { createCombat, isPlayable, legalActions, reduce } from './combat';
import { BEATS_PER_LAP } from './constants';
import { createRun, legalRunActions, removableUids, runReduce } from './run';
import type { CardDef, CombatSetup, CombatState, Mod } from './types';

const quietEnemy = {
  id: 'quiet',
  hp: 999,
  intents: [{ id: 'quiet', weight: 99, targeting: 'none' as const, effects: [] }],
};

function setup(deck: readonly string[], extra: Partial<CombatSetup> = {}): CombatSetup {
  return {
    seed: 19,
    library: CARDS,
    player: { hp: 68 },
    enemies: [quietEnemy],
    deck,
    compoundIds: COMPOUND_IDS,
    startingHand: 1,
    ...extra,
  };
}

function waitTo(state: CombatState, beat: number): CombatState {
  let next = state;
  for (let i = 0; i < 200 && next.beat < beat; i += 1) next = reduce(next, { k: 'wait' });
  return next;
}

function uidOf(state: CombatState, cardId: string): string {
  const card = state.deck.hand.find((instance) => instance.cardId === cardId);
  if (!card) throw new Error(`no ${cardId} in hand`);
  return card.uid;
}

describe('phase-five Interest and Compounds', () => {
  it.each([
    [0, 0],
    [25, 1],
    [40, 2],
    [55, 3],
  ])('bills %i Load for %i Compound(s)', (load, count) => {
    const state = waitTo(createCombat(setup(['arrears'], { deckLoad: load, startingHand: 0 })), BEATS_PER_LAP);
    expect(state.log.find((entry) => entry.event.k === 'interest')?.event).toMatchObject({ count, load });
    expect(state.log.filter((entry) => entry.event.k === 'compound')).toHaveLength(count);
  });

  it('uses the Interest Table period independently of lap boundaries', () => {
    const state = waitTo(
      createCombat(setup(['arrears'], { interestPeriod: 30, deckLoad: 25, startingHand: 0 })),
      30,
    );
    const interest = state.log.filter((entry) => entry.event.k === 'interest');
    expect(interest).toHaveLength(1);
    expect(interest[0]?.beat).toBe(30);
    expect(interest[0]?.event).toMatchObject({ period: 30 });
    expect(state.log.filter((entry) => entry.event.k === 'lap_end')).toHaveLength(1);
  });

  it('applies Cooked Books and Usury with a zero floor', () => {
    const mods: Mod[] = [{ k: 'interest_compounds', n: -1 }];
    const cooked = waitTo(createCombat(setup(['arrears'], { deckLoad: 25, player: { hp: 68, mods } })), 24);
    expect(cooked.log.find((entry) => entry.event.k === 'interest')?.event).toMatchObject({ count: 0 });
    const usury = waitTo(
      createCombat(
        setup(['arrears'], {
          deckLoad: 25,
          player: { hp: 68, mods: [{ k: 'interest_compounds', n: 1 }] },
        }),
      ),
      24,
    );
    expect(usury.log.find((entry) => entry.event.k === 'interest')?.event).toMatchObject({ count: 2 });
  });

  it("turns the Notary's first Compound into Salt Ration", () => {
    const state = waitTo(
      createCombat(
        setup(['arrears'], {
          deckLoad: 25,
          player: { hp: 68, mods: [{ k: 'first_compound_becomes', cardId: 'salt_ration' }] },
        }),
      ),
      24,
    );
    expect(state.deck.draw.some((card) => card.cardId === 'salt_ration')).toBe(true);
    expect(state.deck.draw.some((card) => card.cardId === 'arrears')).toBe(false);
  });

  it('keeps Interest Owed and Foreclosure on their lap clocks', () => {
    const foreclosure = createCombat(
      setup(['foreclosure'], {
        startingHand: 1,
        enemies: [{ ...quietEnemy, startBeat: 100 }],
      }),
    );
    const afterLap = waitTo(foreclosure, BEATS_PER_LAP);
    expect(afterLap.combatants.find((combatant) => combatant.id === 'quiet')?.position).toBe(99);

    const arrears = createCombat(setup(['arrears'], { startingHand: 1 }));
    expect(isPlayable(arrears, uidOf(arrears, 'arrears'))).toBe(false);
    expect(() => reduce(arrears, { k: 'play_card', uid: uidOf(arrears, 'arrears') })).toThrow(/unplayable/);
  });

  it('uses explicit Compound identity for Chalk Dust under Absolved and Familiar', () => {
    const plain = createCombat(setup(['chalk_dust']));
    const chalk = uidOf(plain, 'chalk_dust');
    expect(isPlayable(plain, chalk)).toBe(true);
    const printed = reduce(plain, { k: 'play_card', uid: chalk });
    expect(printed.deck.exhausted.some((card) => card.cardId === 'chalk_dust')).toBe(true);

    const absolved = createCombat(
      setup(['chalk_dust'], {
        player: { hp: 68, mods: [{ k: 'compound_playable_as', effects: [{ k: 'guard', n: 3 }, { k: 'exhaust' }] }] },
      }),
    );
    const absolvedUid = uidOf(absolved, 'chalk_dust');
    const played = reduce(absolved, { k: 'play_card', uid: absolvedUid });
    expect(played.deck.exhausted.some((card) => card.cardId === 'chalk_dust')).toBe(true);
    expect(played.combatants[0]?.guard).toBe(1);

    const familiar = createCombat(setup(['chalk_dust'], { player: { hp: 68, mods: [{ k: 'compound_discard_free' }] } }));
    const familiarUid = uidOf(familiar, 'chalk_dust');
    expect(legalActions(familiar)).toContainEqual({ k: 'discard_compound', uid: familiarUid });
    expect(reduce(familiar, { k: 'discard_compound', uid: familiarUid }).deck.discard).toHaveLength(1);
  });

  it('escalates later Interest brackets from generated Compound Load', () => {
    const state = waitTo(
      createCombat(setup(['arrears'], { deckLoad: 39, startingHand: 0, compoundIds: ['arrears'] })),
      48,
    );
    const interest = state.log
      .filter((entry) => entry.event.k === 'interest')
      .map((entry) => (entry.event.k === 'interest' ? { count: entry.event.count, load: entry.event.load } : null));
    expect(interest).toEqual([
      { count: 1, load: 39 },
      { count: 2, load: 41 },
    ]);
    expect(state.deckLoad).toBe(45);
  });

  it('applies Borrowed Coat Load to generated and purged Compounds symmetrically', () => {
    const generated = waitTo(
      createCombat(
        setup(['false_ledger'], {
          deckLoad: 25,
          startingHand: 1,
          compoundIds: ['arrears'],
          player: { hp: 68, mods: [{ k: 'card_load', n: 1 }] },
        }),
      ),
      BEATS_PER_LAP,
    );
    expect(generated.deckLoad).toBe(28);
    const falseLedger = uidOf(generated, 'false_ledger');
    const purged = reduce(generated, { k: 'play_card', uid: falseLedger });
    expect(purged.deckLoad).toBe(25);
  });

  it('shuffles Interest cards with the shuffle stream deterministically', () => {
    const make = (seed: number): CombatState =>
      waitTo(
        createCombat({
          ...setup(['arrears', 'arrears'], { deckLoad: 25, startingHand: 0, compoundIds: ['arrears'] }),
          seed,
        }),
        BEATS_PER_LAP,
      );
    const first = make(101);
    const replay = make(101);
    expect(replay).toEqual(first);
    expect(first.deck.draw.map((card) => card.uid)).not.toEqual(['c1', 'c2']);
  });

  it('does not skip a 24-beat bill when a card jumps past the lap boundary', () => {
    const slow: CardDef = {
      id: 'slow',
      name: 'Slow',
      weight: 25,
      type: 'skill',
      targeting: 'none',
      effects: [],
    };
    const state = createCombat({
      ...setup(['slow'], { deckLoad: 25, startingHand: 1, compoundIds: ['arrears'], enemies: [quietEnemy] }),
      library: { ...CARDS, slow },
    });
    const after = reduce(state, { k: 'play_card', uid: uidOf(state, 'slow') });
    expect(after.log.some((entry) => entry.event.k === 'lap_end' && entry.beat === 24)).toBe(true);
    expect(after.log.some((entry) => entry.event.k === 'interest' && entry.beat === 24)).toBe(true);
  });

  it('persists one Interest Owed per carried copy when a run combat ends', () => {
    const content = {
      ...RUN_CONTENT,
      character: { ...RUN_CONTENT.character, deck: ['interest_owed', 'paper_cut'] },
    };
    let run = createRun(content, 203);
    const travel = legalRunActions(run)[0];
    if (!travel || travel.k !== 'travel') throw new Error('expected a first fight node');
    run = runReduce(run, travel);
    for (let step = 0; step < 300 && run.combat; step += 1) {
      const action = legalActions(run.combat)[0];
      if (!action) throw new Error('fight had no legal action');
      run = runReduce(run, { k: 'combat', action });
    }
    expect(run.combat).toBeNull();
    expect(run.deck.filter((card) => card.cardId === 'interest_owed')).toHaveLength(2);
  });

  it("keeps The Notary's Countersign irremovable at Reckoning", () => {
    const run = createRun(RUN_CONTENT, 204);
    const withCountersign = {
      ...run,
      deck: [...run.deck, { uid: 'counter', cardId: 'the_notarys_countersign' }],
    };
    expect(removableUids(withCountersign)).not.toContain('counter');
  });

  it('handles nasty Compound triggers and Absolved/Familiar actions', () => {
    const accrual = createCombat(setup(['accrual']));
    expect(accrual.combatants[0]?.hp).toBe(66);

    const guardBlocked = createCombat(
      setup(['grief_unpaid', 'flinch'], { startingHand: 2, player: { hp: 68, mods: [{ k: 'in_hand_no_guard' }] } }),
    );
    const flinch = uidOf(guardBlocked, 'flinch');
    expect(() => reduce(guardBlocked, { k: 'play_card', uid: flinch })).not.toThrow();
    expect(reduce(guardBlocked, { k: 'play_card', uid: flinch }).combatants[0]?.guard).toBe(0);

    const absolved = createCombat(
      setup(['arrears'], { player: { hp: 68, mods: [{ k: 'compound_playable_as', effects: [{ k: 'guard', n: 3 }, { k: 'exhaust' }] }] } }),
    );
    const arrears = uidOf(absolved, 'arrears');
    expect(isPlayable(absolved, arrears)).toBe(true);
    const played = reduce(absolved, { k: 'play_card', uid: arrears });
    expect(played.combatants[0]?.guard).toBe(2);
    expect(played.deck.exhausted.some((card) => card.cardId === 'arrears')).toBe(true);

    const familiar = createCombat(
      setup(['arrears'], { player: { hp: 68, mods: [{ k: 'compound_discard_free' }] } }),
    );
    const junk = uidOf(familiar, 'arrears');
    expect(legalActions(familiar)).toContainEqual({ k: 'discard_compound', uid: junk });
    const discarded = reduce(familiar, { k: 'discard_compound', uid: junk });
    expect(discarded.deck.hand.some((card) => card.uid === junk)).toBe(false);
    expect(discarded.deck.discard.some((card) => card.uid === junk)).toBe(true);
  });

  it("countersigns in phase one, then cancels for the re-ink lap", () => {
    const hit: CardDef = {
      id: 'hit',
      name: 'Hit',
      weight: 1,
      type: 'attack',
      targeting: 'opponent',
      effects: [{ k: 'damage', n: 1 }],
    };
    const library = { ...CARDS, hit };
    const state = createCombat({
      seed: 77,
      library,
      player: { hp: 68 },
      enemies: [
        {
          id: 'the_notary',
          hp: 40,
          intents: [{ id: 'reink', weight: 1, targeting: 'self' as const, effects: [{ k: 'vulnerable', beats: 2, multiplier: 3 }] }],
          mods: [{ k: 'countersign' }],
        },
      ],
      deck: ['hit', 'hit'],
      startingHand: 2,
    });
    const first = reduce(state, { k: 'play_card', uid: uidOf(state, 'hit') });
    const secondUid = first.deck.hand.find((card) => card.cardId === 'hit')?.uid;
    if (!secondUid) throw new Error('second hit was not drawn');
    const second = reduce(first, { k: 'play_card', uid: secondUid });
    expect(second.log.filter((entry) => entry.event.k === 'compound')).toHaveLength(1);
    expect(second.log.some((entry) => entry.event.k === 'countersign_cancelled')).toBe(true);
    expect(second.countersignCancelledLap).toBe(0);
  });

  it('stamps one active Mark per lap after the Notary changes phase', () => {
    const hit: CardDef = {
      id: 'hit',
      name: 'Hit',
      weight: 1,
      type: 'attack',
      targeting: 'opponent',
      effects: [{ k: 'damage', n: 11 }],
    };
    const state = createCombat({
      seed: 88,
      library: { ...CARDS, hit },
      player: {
        hp: 68,
        mods: [{ k: 'attack_damage', n: 1 }],
        markIds: ['whetted'],
        markMods: { whetted: [{ k: 'attack_damage', n: 1 }] },
      },
      enemies: [
        {
          id: 'the_notary',
          hp: 20,
          intents: [{ id: 'slow', weight: 99, targeting: 'none' as const, effects: [] }],
          phases: [[{ id: 'slow_p2', weight: 99, targeting: 'none' as const, effects: [] }]],
          mods: [{ k: 'phase_at_hp_pct', pct: 50 }, { k: 'countersign' }, { k: 'stamp_marks', n: 1 }],
        },
      ],
      deck: ['hit'],
      startingHand: 1,
    });
    const afterHit = reduce(state, { k: 'play_card', uid: uidOf(state, 'hit') });
    expect(afterHit.combatants.find((combatant) => combatant.id === 'the_notary')?.phase).toBe(2);
    const stamped = waitTo(afterHit, BEATS_PER_LAP);
    expect(stamped.stampedMarks).toEqual(['whetted']);
    expect(stamped.activeMarkIds).toEqual([]);
    expect(stamped.log.some((entry) => entry.event.k === 'mark_stamped')).toBe(true);
  });
});
