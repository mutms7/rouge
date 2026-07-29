/**
 * Save and resume, which is a seed and an action log and nothing else.
 *
 * This is the test the determinism rules in the brief were written for. A save is not a
 * snapshot of the run, it is the list of things the player did, and resuming is replaying
 * them. Which means the interesting assertion is not "the save loaded" but "the replayed run
 * is byte-identical to the one that was played", including inside a fight: the same beat, the
 * same hand, the same shuffle, the same Rng state, the same log.
 *
 * If any of these fail, the cause is almost always the same thing: something consumed
 * randomness or read a clock outside the recorded action path.
 */
import { describe, expect, it } from 'vitest';
import { RUN_CONTENT } from '../content/library';
import { chooseAction } from '../sim/policy';
import { createRun, legalRunActions, replayRun, runReduce, saveOf } from './run';
import type { RunAction, RunState } from './runtypes';

/** Everything a run is, in a comparable form. `content` is the same frozen object both ways. */
function snapshot(state: RunState): string {
  return JSON.stringify({
    seed: state.seed,
    at: state.at,
    visited: state.visited,
    hp: state.hp,
    maxHp: state.maxHp,
    salt: state.salt,
    deck: state.deck,
    marks: state.marks,
    markSlots: state.markSlots,
    blockedMarks: state.blockedMarks,
    tokens: state.tokens,
    prompts: state.prompts,
    owed: state.owed,
    rng: state.rng,
    runLog: state.runLog,
    outcome: state.outcome,
    revealedLayers: state.revealedLayers,
    bossIntentKnown: state.bossIntentKnown,
    compoundPhases: state.compoundPhases,
    lethalWardSpent: state.lethalWardSpent,
    uidSeq: state.uidSeq,
    map: state.map,
    library: Object.keys(state.library).sort(),
    combat: state.combat,
    lastCombat: state.lastCombat?.outcome ?? null,
  });
}

/**
 * Play `steps` actions of a run, stopping early only if the run ends.
 *
 * Deliberately counts *actions*, not nodes, so a stop can land in the middle of anything: mid
 * fight, mid shop, halfway through a Hollow's follow-up prompts.
 */
function play(seed: number, steps: number): RunState {
  let state = createRun(RUN_CONTENT, seed);
  for (let step = 0; step < steps && state.outcome === 'ongoing'; step += 1) {
    if (state.combat !== null) {
      const action = chooseAction(state.combat);
      if (!action) break;
      state = runReduce(state, { k: 'combat', action });
      continue;
    }
    const legal = legalRunActions(state);
    const pick = legal.find((a) => a.k !== 'decline') ?? legal[0];
    if (!pick) break;
    state = runReduce(state, pick);
  }
  return state;
}

describe('a save', () => {
  it('is a version, a seed, and the actions', () => {
    const state = play(5, 12);
    const save = saveOf(state);
    expect(save.v).toBe(1);
    expect(save.seed).toBe(5);
    expect(save.actions).toEqual(state.actions);
    // Tiny, which is the point: no state, no deck, no map.
    expect(JSON.stringify(save).length).toBeLessThan(4000);
  });

  it('round-trips through JSON, because that is what a browser stores', () => {
    const state = play(5, 30);
    const save = JSON.parse(JSON.stringify(saveOf(state))) as ReturnType<typeof saveOf>;
    expect(snapshot(replayRun(RUN_CONTENT, save))).toBe(snapshot(state));
  });
});

describe('resuming', () => {
  it('lands on the same state, at every depth, on every seed', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      for (const steps of [0, 1, 3, 9, 25, 60, 140]) {
        const played = play(seed, steps);
        const resumed = replayRun(RUN_CONTENT, saveOf(played));
        expect(snapshot(resumed), `seed ${String(seed)} at ${String(steps)} steps`).toBe(snapshot(played));
      }
    }
  });

  /**
   * The one the phase brief singles out. Resuming between nodes is easy; resuming mid-fight is
   * where a save format that stored "the run" rather than "what you did" would have to
   * serialise a whole combat, four Rng streams and a shuffled draw pile, and get all of it
   * right. Replaying the actions gets it right by construction.
   */
  it('lands mid-fight on the same beat, the same hand and the same draw pile', () => {
    let found = 0;
    for (let seed = 1; seed <= 20 && found < 6; seed += 1) {
      for (const steps of [2, 5, 11, 19]) {
        const played = play(seed, steps);
        if (played.combat === null) continue;
        found += 1;
        const resumed = replayRun(RUN_CONTENT, saveOf(played));
        expect(resumed.combat).not.toBeNull();
        expect(resumed.combat?.beat).toBe(played.combat.beat);
        expect(resumed.combat?.deck).toEqual(played.combat.deck);
        expect(resumed.combat?.rng).toEqual(played.combat.rng);
        expect(resumed.combat?.log).toEqual(played.combat.log);
        expect(resumed.combat?.combatants).toEqual(played.combat.combatants);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('carries on from where it resumed, identically', () => {
    // The real shape of closing a tab: replay, then keep playing, and compare against a run
    // that was never interrupted.
    const straight = play(6, 80);
    const halfway = play(6, 40);
    let resumed: RunState = replayRun(RUN_CONTENT, saveOf(halfway));
    for (let step = 40; step < 80 && resumed.outcome === 'ongoing'; step += 1) {
      if (resumed.combat !== null) {
        const action = chooseAction(resumed.combat);
        if (!action) break;
        resumed = runReduce(resumed, { k: 'combat', action });
        continue;
      }
      const legal = legalRunActions(resumed);
      const pick = legal.find((a: RunAction) => a.k !== 'decline') ?? legal[0];
      if (!pick) break;
      resumed = runReduce(resumed, pick);
    }
    expect(snapshot(resumed)).toBe(snapshot(straight));
  });

  it('refuses an action log that does not fit the run rather than limping on', () => {
    const save = saveOf(play(3, 6));
    const tampered = { ...save, actions: [...save.actions, { k: 'travel', nodeId: 'l9n9' } as RunAction] };
    expect(() => replayRun(RUN_CONTENT, tampered)).toThrow();
  });
});
