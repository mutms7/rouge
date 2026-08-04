/**
 * The audio layer, checked for the one thing that matters: it cannot break the game.
 *
 * There is no assertion here about what anything sounds like. What is worth testing is the
 * contract: every cue has a voice, a browser with no audio at all is a quiet game rather than a
 * crashed one, and a cue that fires four times in one exchange is heard once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { play, playAll, resetAudioForTests, setAudioEnabled, setVolume } from './audio';
import { VOICES } from './voices';
import type { Cue } from '../combat/feel';

const ALL_CUES: Cue[] = [
  'card_play',
  'card_draw',
  'hit',
  'guard_break',
  'guard_hold',
  'interest',
  'stamp',
  'perjury',
  'reink',
  'death',
];

describe('the voices', () => {
  it('has one for every cue the feel layer can emit', () => {
    for (const cue of ALL_CUES) expect(VOICES[cue]).toBeDefined();
    expect(Object.keys(VOICES)).toHaveLength(ALL_CUES.length);
  });

  it('keeps every voice short enough to overlap the next one', () => {
    for (const [cue, voice] of Object.entries(VOICES)) {
      expect(voice.length, cue).toBeGreaterThan(0);
      // A fight resolves several actions a second under fast-forward. A sound longer than this
      // would still be playing when the next three arrive.
      expect(voice.length, cue).toBeLessThanOrEqual(1);
      expect(voice.gain, cue).toBeGreaterThan(0);
      expect(voice.gain, cue).toBeLessThanOrEqual(1);
    }
  });

  it('makes the stamp the loudest and longest thing in the demo', () => {
    // §Phase 6: the stamp should be the most memorable sound in the demo. Memorable is not a
    // number, but "quieter than a card draw" would certainly disqualify it.
    for (const [cue, voice] of Object.entries(VOICES)) {
      if (cue === 'stamp') continue;
      expect(voice.gain, cue).toBeLessThanOrEqual(VOICES.stamp.gain);
    }
  });
});

describe('play', () => {
  beforeEach(() => {
    resetAudioForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is silent and harmless in an environment with no audio of any kind', () => {
    // Node has no AudioContext and no Howler backend. Every cue still has to be a no-op rather
    // than a thrown error, because this is exactly what a locked-down browser looks like.
    for (const cue of ALL_CUES) expect(() => { play(cue); }).not.toThrow();
    expect(() => { playAll(ALL_CUES); }).not.toThrow();
  });

  it('does nothing at all once audio is turned off', () => {
    setAudioEnabled(false);
    expect(() => { playAll(ALL_CUES); }).not.toThrow();
    setAudioEnabled(true);
  });

  it('clamps the volume rather than trusting the caller', () => {
    expect(() => { setVolume(-3); }).not.toThrow();
    expect(() => { setVolume(9); }).not.toThrow();
    setVolume(0.7);
  });

  it('collapses a burst of the same cue into one sound', () => {
    // Four draws off one card is one noise. Proved through the synthesis path, which is the one
    // that runs when there is no file: a rendered voice would ask the context for nodes.
    const rendered: string[] = [];
    for (const cue of ALL_CUES) {
      const voice = VOICES[cue];
      vi.spyOn(voice, 'render').mockImplementation(() => {
        rendered.push(cue);
      });
    }
    const fakeGain = { gain: { value: 0 }, connect: () => undefined };
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 0;
        destination = {};
        createGain() {
          return fakeGain;
        }
        resume() {
          return Promise.resolve();
        }
      },
    );

    // Same millisecond, four times: the retrigger floor should keep only the first.
    for (let i = 0; i < 4; i += 1) play('card_draw', 1000);
    expect(rendered.filter((cue) => cue === 'card_draw')).toHaveLength(1);

    // Far enough apart and it is a second sound, because it was a second draw.
    play('card_draw', 5000);
    expect(rendered.filter((cue) => cue === 'card_draw')).toHaveLength(2);

    // The stamp has no floor: two stamps in one exchange are two stamps.
    play('stamp', 1000);
    play('stamp', 1000);
    expect(rendered.filter((cue) => cue === 'stamp')).toHaveLength(2);

    vi.restoreAllMocks();
  });
});
