import { describe, expect, it } from 'vitest';
import { fightSetup } from '../../content/library';
import { createCombat, currentActor, reduce } from '../../engine/combat';
import { trackView, WINDOW_BEATS } from './track';

function fight(encounterId: string, seed = 1) {
  return createCombat(fightSetup({ seed, encounterId }));
}

function view(encounterId: string, seed = 1) {
  const state = fight(encounterId, seed);
  return { state, view: trackView(state, currentActor(state)?.id ?? null) };
}

describe('the track window', () => {
  it('starts at now and runs one lap', () => {
    const { view: track } = view('chalk_hound');
    expect(track.start).toBe(0);
    expect(track.cells).toHaveLength(WINDOW_BEATS);
    expect(track.cells[0]?.beat).toBe(0);
    expect(track.cells[23]?.trackBeat).toBe(23);
  });

  it('slides with the clock and keeps the ring numbering', () => {
    const state = fight('chalk_hound');
    // The Chalk Hound acts every 3 beats, so a Weight 2 card is enough to move the clock.
    const uid = state.deck.hand[1]?.uid ?? '';
    const next = reduce(state, { k: 'play_card', uid });
    const track = trackView(next, currentActor(next)?.id ?? null);

    expect(track.start).toBe(next.beat);
    expect(track.cells[0]?.trackBeat).toBe(next.beat % WINDOW_BEATS);
    expect(track.cells).toHaveLength(WINDOW_BEATS);
  });

  it('marks the lap boundary in exactly one cell of any window', () => {
    const { view: track } = view('chalk_hound');
    expect(track.cells.filter((cell) => cell.lapStart)).toHaveLength(1);
    expect(track.cells.find((cell) => cell.lapStart)?.trackBeat).toBe(0);
  });

  it('puts the player last so their lane sits nearest the hand', () => {
    const { view: track } = view('the_owed');
    expect(track.lanes.map((lane) => lane.id)).toEqual(['the_owed_a', 'the_owed_b', 'wick']);
    expect(track.lanes.at(-1)?.team).toBe('player');
  });

  it('pins every intent to the beat it fires on', () => {
    const { view: track } = view('chalk_hound');
    const hound = track.lanes.find((lane) => lane.id === 'chalk_hound');
    // Acts every 3 beats: 0, 3, 6 … 21 inside a 24-beat window.
    expect(hound?.intents.map((i) => i.beat)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(hound?.intents.map((i) => i.offset)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
  });

  it('gives every chip a key that survives the clock moving', () => {
    const state = fight('chalk_hound');
    const before = trackView(state, null).lanes.find((l) => l.id === 'chalk_hound');
    const uid = state.deck.hand[0]?.uid ?? '';
    const next = reduce(state, { k: 'play_card', uid });
    const after = trackView(next, null).lanes.find((l) => l.id === 'chalk_hound');

    // The action at index 1 is the same action before and after, just closer.
    const wasSecond = before?.intents.find((i) => i.key === 'chalk_hound:1');
    const isSecond = after?.intents.find((i) => i.key === 'chalk_hound:1');
    expect(wasSecond?.beat).toBe(3);
    expect(isSecond?.beat).toBe(3);
    expect(isSecond?.offset).toBeLessThan(wasSecond?.offset ?? 0);
  });

  it('reads damage off the intent and points it at the player', () => {
    const { view: track } = view('chalk_debtor');
    const intent = track.lanes[0]?.intents[0];
    expect(intent?.damage).toBe(7);
    expect(intent?.chips[0]).toMatchObject({ code: 'DMG', n: 7, hostile: true });
  });

  it('shows nothing hostile for an intent aimed at itself', () => {
    const { view: track } = view('dust_clerk');
    const guarding = track.lanes[0]?.intents.find((i) => i.intent.id === 'dust_clerk_file');
    expect(guarding?.damage).toBe(0);
    expect(guarding?.chips.every((chip) => !chip.hostile)).toBe(true);
  });

  it('drops the marker of a body that has settled', () => {
    const state = fight('marginalia', 3);
    // Marginalia have 9 HP; Paper Cut deals 5, so two of them finish one off.
    let next = state;
    for (const cardId of ['paper_cut', 'paper_cut']) {
      const uid = next.deck.hand.find((c) => c.cardId === cardId)?.uid;
      if (!uid) continue;
      next = reduce(next, { k: 'play_card', uid, targetId: 'marginalia_a' });
    }
    const track = trackView(next, currentActor(next)?.id ?? null);
    const dead = track.lanes.find((lane) => lane.id === 'marginalia_a');
    expect(dead?.alive).toBe(false);
    expect(dead?.marker).toBeNull();
  });

  it('clamps a marker that has been pushed past the window', () => {
    const state = fight('chalk_debtor');
    const pushed = {
      ...state,
      combatants: state.combatants.map((c) => (c.team === 'enemy' ? { ...c, position: 99 } : c)),
    };
    const marker = trackView(pushed, null).lanes[0]?.marker;
    expect(marker?.clamped).toBe(true);
    expect(marker?.offset).toBe(WINDOW_BEATS - 1);
  });

  it('draws Guard as the distance it is', () => {
    const state = fight('chalk_debtor');
    const guarded = {
      ...state,
      combatants: state.combatants.map((c) => (c.team === 'player' ? { ...c, guard: 5 } : c)),
    };
    // Guard 5 melts 1 per beat, so it still covers the beat you are on and four more,
    // and it is gone by beat 5.
    expect(trackView(guarded, null).lanes.at(-1)?.guard).toEqual({ n: 5, through: 4, frozenThrough: 0 });
  });

  it('separates the frozen part of Guard from the melting part', () => {
    const state = fight('chalk_debtor');
    // Chalk Line: Guard 4 which does not decay for 3 beats. Three beats held, then four
    // beats of melt, so the last covered beat is 6.
    const guarded = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.team === 'player' ? { ...c, guard: 4, guardFrozenUntil: 3 } : c,
      ),
    };
    expect(trackView(guarded, null).lanes.at(-1)?.guard).toEqual({ n: 4, through: 6, frozenThrough: 3 });
  });

  it('agrees with the engine when a Mark slows the melt', () => {
    const state = createCombat(fightSetup({ seed: 1, encounterId: 'chalk_debtor', marks: ['drawn_line'] }));
    const guarded = {
      ...state,
      combatants: state.combatants.map((c) => (c.team === 'player' ? { ...c, guard: 3 } : c)),
    };
    // Drawn Line stops the decay outright, so 3 Guard covers the whole visible window
    // rather than three beats of it.
    expect(trackView(guarded, null).lanes.at(-1)?.guard?.through).toBe(WINDOW_BEATS - 1);
  });

  it('has no Guard bar for a body with no Guard', () => {
    const { view: track } = view('chalk_debtor');
    expect(track.lanes.every((lane) => lane.guard === null)).toBe(true);
  });

  it('flags whoever acts next, and ties go to the player', () => {
    const { state, view: track } = view('chalk_debtor');
    // Both markers open on beat 0. §3.1: the tie is the player's.
    expect(state.combatants.every((c) => c.position === 0)).toBe(true);
    expect(track.lanes.find((lane) => lane.marker?.current)?.team).toBe('player');
  });
});
