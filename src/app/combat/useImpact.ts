/**
 * The moment, delivered: one shake for the screen and one batch of sounds for the room.
 *
 * Sibling of `useFlashes`, and deliberately the same shape. The engine resolves an exchange
 * synchronously, so the view reads the log slice it appended, plays it, and forgets it. The
 * only state is which engine state has already had its turn.
 *
 * Audio fires in an effect rather than during render, because a render can happen twice under
 * Strict Mode and a sound played twice is audible in a way a duplicated `<div>` is not. The
 * guard is the state object's identity, which is exactly the right key: the store replaces the
 * state object on every action and never mutates one, so "this state has been heard" is a
 * reference comparison that no amount of re-rendering can defeat.
 */
import { useEffect, useMemo, useRef } from 'react';
import { playAll } from '../audio/audio';
import { useApp, useCombatState } from '../store';
import { impactSince, NO_IMPACT, type Impact } from './feel';

export function useImpact(): Impact {
  const state = useCombatState();
  const logCursor = useApp((s) => s.logCursor);
  const heard = useRef<object | null>(null);

  const impact = useMemo(() => (state ? impactSince(state, logCursor) : NO_IMPACT), [state, logCursor]);

  useEffect(() => {
    if (!state || heard.current === state) return;
    heard.current = state;
    // Reduced motion is about motion. Somebody who turned animation off still wants to hear
    // the stamp, and phase 7's audio slider is the control for people who do not.
    playAll(impact.cues);
  }, [state, impact]);

  return impact;
}

/**
 * A screen shake that decays, driven off the impact rather than off a timer.
 *
 * Returned as a keyframe array for `motion` to run, or null when nothing should move. Null
 * rather than a zero-amplitude array so that reduced motion means the element has no transform
 * at all, not a transform that happens to resolve to zero.
 */
export function shakeKeyframes(shake: number, skip: boolean): { x: number[]; y: number[] } | null {
  if (skip || shake <= 0) return null;
  // Six frames, alternating and decaying. Y moves about half as much as X: a vertical shake
  // reads as the floor giving way, and this is somebody being hit, not an earthquake.
  const amplitude = 3 + shake * 11;
  return {
    x: [0, -amplitude, amplitude * 0.72, -amplitude * 0.45, amplitude * 0.22, 0],
    y: [0, amplitude * 0.4, -amplitude * 0.28, amplitude * 0.16, 0, 0],
  };
}
