/**
 * The store, and the desync question.
 *
 * The phase 3 brief asked for a fast-forward that skips animation entirely and never desyncs
 * anything while it is held. The answer is architectural rather than careful: the board is a
 * function of one `CombatState`, animation only interpolates between two of them, and the
 * dispatch path never reads a presentation setting. So the test is the honest version of the
 * claim: play the same fight twice, hold fast-forward through one of them, and the two engine
 * states have to come out byte-identical.
 *
 * Phase 4 moved the store up a layer, and the property survived the move: a fight is now a
 * field on a run, so the same test drives it through `dispatchRun` and still asserts on bytes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fightSetup, RUN_CONTENT } from '../content/library';
import { createCombat } from '../engine/combat';
import { createRun, settleableUids } from '../engine/run';
import type { CombatState } from '../engine/types';
import { needsTarget, playAction, targetableEnemies } from './combat/store';
import { useSettings } from './settings';
import { choices, useApp } from './store';

/**
 * Drop an arbitrary fight into a fresh run.
 *
 * A run only ever hands you the fight at the node you walked to, which is the right rule and
 * a bad test seam: half of these want a three-body encounter. So the fight is injected, with
 * `at` pointing at layer 0, which is always a Debtor node and so is always somewhere a fight
 * can legally end.
 */
function mount(encounterId: string, seed: number): CombatState {
  const run = createRun(RUN_CONTENT, seed);
  const combat = createCombat(fightSetup({ seed, encounterId }));
  useApp.setState({
    run: { ...run, at: run.map.layers[0]?.[0] ?? null, combat },
    logCursor: 0,
    cursor: 0,
    hovered: null,
    hoveredTarget: null,
    targeting: null,
    endedCombat: null,
  });
  return combat;
}

function live(): CombatState | null {
  return useApp.getState().run?.combat ?? null;
}

/**
 * A deterministic player: always the first card in hand at the first living body, and wait
 * when there is nothing playable. Not a good player. A repeatable one.
 */
function playOut(limit = 400): CombatState {
  const store = useApp.getState;
  let last = live();
  for (let step = 0; step < limit; step += 1) {
    const state = live();
    if (!state || state.outcome !== 'ongoing') break;
    last = state;

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
  // A finished fight is settled out of `run.combat` on the action that decides it, so the
  // final board is the one the view is handed for its last beat.
  const final = live() ?? useApp.getState().endedCombat ?? last;
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
  useApp.getState().abandonRun();
  useSettings.setState({ reducedMotion: false, fastForwardHeld: false, fastForwardLocked: false });
});

describe('the app store', () => {
  it('holds a fight built from a seed and an encounter', () => {
    mount('chalk_debtor', 7);
    const state = live();
    expect(state?.seed).toBe(7);
    expect(state?.combatants.map((c) => c.id)).toEqual(['wick', 'chalk_debtor']);
    expect(useApp.getState().logCursor).toBe(0);
  });

  it('is the same fight every time from the same seed', () => {
    mount('chalk_hound', 42);
    const first = snapshot(playOut());
    mount('chalk_hound', 42);
    const second = snapshot(playOut());
    expect(second).toBe(first);
  });

  it('does not care whether fast-forward is held', () => {
    mount('chalk_debtor', 3);
    const normal = snapshot(playOut());

    // Hold it down for the whole of the second run, and lock it as well.
    useSettings.setState({ fastForwardHeld: true, fastForwardLocked: true, reducedMotion: true });
    mount('chalk_debtor', 3);
    const hurried = snapshot(playOut());

    expect(hurried).toBe(normal);
  });

  it('remembers where the log was, so the flashes only cover the last exchange', () => {
    mount('chalk_debtor', 1);
    const before = live()?.log.length ?? 0;
    const uid = live()?.deck.hand[0]?.uid ?? '';
    useApp.getState().dispatch({ k: 'play_card', uid });
    expect(useApp.getState().logCursor).toBe(before);
    expect(live()?.log.length).toBeGreaterThan(before);
  });

  it('ignores an action the player may not take rather than throwing under them', () => {
    mount('chalk_debtor', 1);
    const before = useApp.getState().run;
    useApp.getState().dispatch({ k: 'play_card', uid: 'not-a-card' });
    expect(useApp.getState().run).toBe(before);
  });

  it('knows when a card has to be pointed at something', () => {
    const state = mount('the_owed', 1);
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    const guard = state.deck.hand.find((c) => c.cardId === 'flinch')?.uid ?? '';
    expect(needsTarget(state, attack)).toBe(true);
    expect(needsTarget(state, guard)).toBe(false);
  });

  it('does not ask for a target when only one body is standing', () => {
    const state = mount('chalk_debtor', 1);
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    expect(needsTarget(state, attack)).toBe(false);
  });

  it('drops a target the engine did not ask for, and keeps one it did', () => {
    const single = mount('chalk_debtor', 1);
    const uid = single.deck.hand[0]?.uid ?? '';
    // One body standing, so `legalActions` offers no targetId and the action must not carry
    // one either, or nothing matches and the play is silently swallowed.
    expect(playAction(single, uid, 'chalk_debtor')).toEqual({ k: 'play_card', uid });

    const pair = mount('the_owed', 1);
    const attack = pair.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    expect(playAction(pair, attack, 'the_owed_b')).toEqual({
      k: 'play_card',
      uid: attack,
      targetId: 'the_owed_b',
    });
  });

  it('plays a targeted card at the body it was pointed at', () => {
    const state = mount('the_owed', 1);
    const attack = state.deck.hand.find((c) => c.cardId === 'paper_cut')?.uid ?? '';
    useApp.getState().playCard(attack, 'the_owed_b');
    const after = live();
    expect(after?.combatants.find((c) => c.id === 'the_owed_b')?.hp).toBe(13);
    expect(after?.combatants.find((c) => c.id === 'the_owed_a')?.hp).toBe(18);
  });

  it('walks the target cursor round the living bodies', () => {
    mount('marginalia', 3);
    useApp.getState().beginTargeting('c1');
    useApp.getState().moveTarget(-1);
    expect(useApp.getState().targeting?.index).toBe(2);
    useApp.getState().moveTarget(1);
    expect(useApp.getState().targeting?.index).toBe(0);
  });

  it('clamps the hand cursor when the hand shrinks under it', () => {
    mount('chalk_debtor', 1);
    useApp.getState().setCursor(4);
    expect(useApp.getState().cursor).toBe(4);
    useApp.getState().setCursor(99);
    expect(useApp.getState().cursor).toBe((live()?.deck.hand.length ?? 1) - 1);
  });
});

/**
 * The confirm step, which is the phase brief's one explicit UI requirement above combat:
 * "Settling a card into its Mark with a confirm step, since it's irreversible."
 *
 * It lives here rather than in the reducer because it is a courtesy rather than a rule. The
 * engine would happily delete the card on the first press, and should: the sim has no hands.
 */
describe('irreversible choices', () => {
  function atReckoning(): void {
    const run = createRun(RUN_CONTENT, 2);
    useApp.setState({
      run: {
        ...run,
        at: run.map.layers[0]?.[0] ?? null,
        prompts: [
          {
            k: 'pick_deck_card',
            op: 'settle',
            uids: settleableUids(run),
            skippable: true,
            destroysMark: false,
          },
        ],
      },
      choice: 0,
      confirm: null,
    });
  }

  it('asks twice before it Settles, and only then does it', () => {
    atReckoning();
    const before = useApp.getState().run?.deck.length ?? 0;

    useApp.getState().commitChoice();
    expect(useApp.getState().confirm).toBe(0);
    expect(useApp.getState().run?.deck.length).toBe(before);

    useApp.getState().commitChoice();
    expect(useApp.getState().run?.deck.length).toBe(before - 1);
    expect(useApp.getState().run?.marks).toHaveLength(1);
    expect(useApp.getState().confirm).toBeNull();
  });

  it('disarms when the cursor moves off it', () => {
    atReckoning();
    useApp.getState().commitChoice();
    expect(useApp.getState().confirm).toBe(0);
    useApp.getState().moveChoice(1);
    expect(useApp.getState().confirm).toBeNull();
    // And the second press on the new row arms that one rather than committing it.
    useApp.getState().commitChoice();
    expect(useApp.getState().run?.marks).toEqual([]);
  });

  /** Clicking the same row twice is a move and a commit. The move must not disarm it. */
  it('survives a mouse, which points at a row before taking it', () => {
    atReckoning();
    useApp.getState().setChoice(1);
    useApp.getState().commitChoice();
    useApp.getState().setChoice(1);
    useApp.getState().commitChoice();
    expect(useApp.getState().run?.marks).toHaveLength(1);
  });

  it('walks past a Reckoning without Settling', () => {
    atReckoning();
    const list = choices(useApp.getState().run);
    const skip = list.findIndex((c) => c.kind === 'decline');
    expect(skip).toBeGreaterThan(-1);
    useApp.getState().setChoice(skip);
    useApp.getState().commitChoice();
    expect(useApp.getState().run?.marks).toEqual([]);
    expect(useApp.getState().run?.deck).toHaveLength(10);
    // Back on the map, with the branches out of layer 0 and nothing else.
    const after = choices(useApp.getState().run);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((c) => c.kind === 'node')).toBe(true);
  });

  it('does nothing at all on a row it cannot take', () => {
    const run = createRun(RUN_CONTENT, 2);
    useApp.setState({ run: { ...run, at: run.map.layers[0]?.[0] ?? null, prompts: [{ k: 'wake', canUpgrade: false }] }, choice: 0, confirm: null });
    // No Salt, so the Mark slot row is on screen and dead.
    const list = choices(useApp.getState().run);
    const slot = list.findIndex((c) => c.disabled);
    expect(slot).toBeGreaterThan(-1);
    useApp.getState().setChoice(slot);
    useApp.getState().commitChoice();
    expect(useApp.getState().run?.markSlots).toBe(3);
    expect(useApp.getState().confirm).toBeNull();
  });
});
