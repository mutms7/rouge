/**
 * Presentation settings. Phase 7 puts a screen on these; phase 3 needs two of them now.
 *
 * Reduced motion is a Steam-readiness requirement from day one, and fast-forward is in the
 * phase brief. They collapse to the same question at every call site (does this animation
 * run, yes or no) so there is one derived flag rather than two checks scattered around,
 * and exactly one place to add a third reason later.
 *
 * Fast-forward is *held* by default. Holding F skips animation for as long as you hold it;
 * the lock is there for people who never want it. Neither one can desync anything, because
 * neither one touches engine state: they only decide how long a transition takes.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type SettingsStore = {
  /** Mirrors the OS preference unless the player overrides it in phase 7. */
  readonly reducedMotion: boolean;
  /** F is down right now. */
  readonly fastForwardHeld: boolean;
  /** The player turned it on and left it on. */
  readonly fastForwardLocked: boolean;
  setReducedMotion: (value: boolean) => void;
  setFastForwardHeld: (value: boolean) => void;
  toggleFastForwardLock: () => void;
};

export const useSettings = create<SettingsStore>()((set, get) => ({
  reducedMotion: false,
  fastForwardHeld: false,
  fastForwardLocked: false,
  setReducedMotion: (value) => {
    set({ reducedMotion: value });
  },
  setFastForwardHeld: (value) => {
    if (get().fastForwardHeld !== value) set({ fastForwardHeld: value });
  },
  toggleFastForwardLock: () => {
    set({ fastForwardLocked: !get().fastForwardLocked });
  },
}));

/**
 * Whether anything should animate. One predicate, three reasons, no call site that has to
 * remember all of them.
 */
export function shouldSkipAnimation(settings: {
  readonly reducedMotion: boolean;
  readonly fastForwardHeld: boolean;
  readonly fastForwardLocked: boolean;
}): boolean {
  return settings.reducedMotion || settings.fastForwardHeld || settings.fastForwardLocked;
}

/** True when nothing should animate. Every transition in the view reads this. */
export function useSkipAnimation(): boolean {
  return useSettings(shouldSkipAnimation);
}

/** Seconds a transition should take. Zero is a jump cut, which is the point of F. */
export function useDuration(seconds: number): number {
  return useSkipAnimation() ? 0 : seconds;
}

/** Keep the store in step with the OS preference, including while the app is open. */
export function useReducedMotionSync(): void {
  const setReducedMotion = useSettings((s) => s.setReducedMotion);
  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      setReducedMotion(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [setReducedMotion]);
}
