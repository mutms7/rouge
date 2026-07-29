/**
 * Floating numbers, and the only timer in the combat UI.
 *
 * The engine resolves an entire exchange in one call, so without this the board would go
 * from "you are at 68" to "you are at 55" with nothing in between. These are the in
 * between. They are pure decoration: derived from the slice of the combat log the last
 * action appended, and gone a moment later. If the timer never fired at all the board
 * would still be correct, which is why they are allowed to be the one thing here on a
 * clock.
 *
 * The flashes themselves are *derived*, not stored. The only piece of state is which
 * engine state has already had its turn, and it is set from a timer callback rather than
 * from the effect body, so there is no cascading render and nothing to fall behind.
 */
import { useEffect, useMemo, useState } from 'react';
import { shouldSkipAnimation, useSettings } from '../settings';
import { flashesSince, type Flash } from './feed';
import { useCombat } from './store';

/** How long a number hangs. Long enough to read, short enough to keep up with fast play. */
const LINGER_MS = 850;

const NONE: Flash[] = [];

export function useFlashes(): Flash[] {
  const state = useCombat((s) => s.state);
  const logCursor = useCombat((s) => s.logCursor);
  // Object identity, so a restart of the same fight is a different batch.
  const [expired, setExpired] = useState<object | null>(null);

  useEffect(() => {
    if (!state) return;
    // Read fast-forward at fire time rather than depending on it, so tapping F mid-flash
    // shortens the next one instead of restarting this one.
    const skip = shouldSkipAnimation(useSettings.getState());
    const timer = window.setTimeout(
      () => {
        setExpired(state);
      },
      skip ? 0 : LINGER_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  return useMemo(() => {
    if (!state || expired === state) return NONE;
    return flashesSince(state, logCursor);
  }, [state, expired, logCursor]);
}
