/**
 * Presentation settings.
 *
 * Reduced motion and fast-forward collapse to the same question at every call site (does
 * this animation run, yes or no) so there is one derived flag rather than two checks
 * scattered around, and exactly one place to add a third reason later.
 *
 * Fast-forward is *held* by default. Holding F skips animation for as long as you hold it;
 * the lock is there for people who never want it. Neither one can desync anything, because
 * neither one touches engine state: they only decide how long a transition takes.
 *
 * Everything a player can set from the settings screen (volume, mute, font scale,
 * colourblind-safe, a manual reduced-motion override, and whether fast-forward starts
 * locked) is small enough to round-trip through `localStorage` directly rather than through
 * `platform/`: it is a client preference, not save-game state, and it has no Steam Cloud
 * equivalent. `load`/`save` below follow the same never-throw shape as `platform/web.ts`.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { setAudioEnabled, setVolume } from './audio/audio';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const STORAGE_KEY = 'rouge:settings:v1';

/** Coarse steps rather than a free slider: legible at a glance, and there are only four. */
export const FONT_SCALES = [0.875, 1, 1.15, 1.3] as const;
export type FontScale = (typeof FONT_SCALES)[number];

type Persisted = {
  readonly volume: number;
  readonly audioMuted: boolean;
  readonly fontScale: FontScale;
  readonly colourblindSafe: boolean;
  readonly reducedMotionOverride: boolean;
  readonly fastForwardLocked: boolean;
};

const DEFAULTS: Persisted = {
  volume: 0.7,
  audioMuted: false,
  fontScale: 1,
  colourblindSafe: false,
  reducedMotionOverride: false,
  fastForwardLocked: false,
};

function isFontScale(value: unknown): value is FontScale {
  return typeof value === 'number' && (FONT_SCALES as readonly number[]).includes(value);
}

/** Never throws: a corrupt or absent record is just the defaults, the same as a fresh install. */
function loadPersisted(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof Persisted, unknown>>;
    return {
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
      audioMuted: typeof parsed.audioMuted === 'boolean' ? parsed.audioMuted : DEFAULTS.audioMuted,
      fontScale: isFontScale(parsed.fontScale) ? parsed.fontScale : DEFAULTS.fontScale,
      colourblindSafe: typeof parsed.colourblindSafe === 'boolean' ? parsed.colourblindSafe : DEFAULTS.colourblindSafe,
      reducedMotionOverride:
        typeof parsed.reducedMotionOverride === 'boolean' ? parsed.reducedMotionOverride : DEFAULTS.reducedMotionOverride,
      fastForwardLocked: typeof parsed.fastForwardLocked === 'boolean' ? parsed.fastForwardLocked : DEFAULTS.fastForwardLocked,
    };
  } catch {
    return DEFAULTS;
  }
}

function savePersisted(value: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Out of quota, or a browser that refuses storage. The session keeps the setting; it
    // just will not survive a reload, which is strictly better than a crash.
  }
}

export type SettingsStore = {
  /** Mirrors the OS preference. */
  readonly reducedMotion: boolean;
  /** The player asked for reduced motion from the settings screen, regardless of the OS. */
  readonly reducedMotionOverride: boolean;
  /** F is down right now. */
  readonly fastForwardHeld: boolean;
  /** The player turned it on and left it on (or it starts on, per the settings default). */
  readonly fastForwardLocked: boolean;
  readonly volume: number;
  readonly audioMuted: boolean;
  readonly fontScale: FontScale;
  readonly colourblindSafe: boolean;

  setReducedMotion: (value: boolean) => void;
  setReducedMotionOverride: (value: boolean) => void;
  setFastForwardHeld: (value: boolean) => void;
  toggleFastForwardLock: () => void;
  setVolume: (value: number) => void;
  setAudioMuted: (value: boolean) => void;
  setFontScale: (value: FontScale) => void;
  setColourblindSafe: (value: boolean) => void;
};

const persisted = loadPersisted();

/** The slice of the store that round-trips to `localStorage`, on every write. */
function persist(state: SettingsStore): void {
  savePersisted({
    volume: state.volume,
    audioMuted: state.audioMuted,
    fontScale: state.fontScale,
    colourblindSafe: state.colourblindSafe,
    reducedMotionOverride: state.reducedMotionOverride,
    fastForwardLocked: state.fastForwardLocked,
  });
}

export const useSettings = create<SettingsStore>()((set, get) => ({
  reducedMotion: false,
  reducedMotionOverride: persisted.reducedMotionOverride,
  fastForwardHeld: false,
  fastForwardLocked: persisted.fastForwardLocked,
  volume: persisted.volume,
  audioMuted: persisted.audioMuted,
  fontScale: persisted.fontScale,
  colourblindSafe: persisted.colourblindSafe,

  setReducedMotion: (value) => {
    set({ reducedMotion: value });
  },
  setReducedMotionOverride: (value) => {
    set({ reducedMotionOverride: value });
    persist(get());
  },
  setFastForwardHeld: (value) => {
    if (get().fastForwardHeld !== value) set({ fastForwardHeld: value });
  },
  toggleFastForwardLock: () => {
    set({ fastForwardLocked: !get().fastForwardLocked });
    persist(get());
  },
  setVolume: (value) => {
    const clamped = Math.max(0, Math.min(1, value));
    set({ volume: clamped });
    persist(get());
  },
  setAudioMuted: (value) => {
    set({ audioMuted: value });
    persist(get());
  },
  setFontScale: (value) => {
    set({ fontScale: value });
    persist(get());
  },
  setColourblindSafe: (value) => {
    set({ colourblindSafe: value });
    persist(get());
  },
}));

/**
 * Whether anything should animate. One predicate, every reason, no call site that has to
 * remember all of them.
 */
export function shouldSkipAnimation(settings: {
  readonly reducedMotion: boolean;
  readonly fastForwardHeld: boolean;
  readonly fastForwardLocked: boolean;
  readonly reducedMotionOverride?: boolean;
}): boolean {
  return (
    settings.reducedMotion ||
    settings.fastForwardHeld ||
    settings.fastForwardLocked ||
    (settings.reducedMotionOverride ?? false)
  );
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

/** Keep the audio engine's volume and mute in step with the store, including on first render. */
export function useAudioSettingsSync(): void {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.audioMuted);
  useEffect(() => {
    setVolume(volume);
  }, [volume]);
  useEffect(() => {
    setAudioEnabled(!muted);
  }, [muted]);
}

/** Keep `<html>` in step with the font scale and colourblind-safe settings. Both are CSS hooks. */
export function usePresentationSync(): void {
  const fontScale = useSettings((s) => s.fontScale);
  const colourblindSafe = useSettings((s) => s.colourblindSafe);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [fontScale]);
  useEffect(() => {
    if (colourblindSafe) document.documentElement.setAttribute('data-colourblind', 'true');
    else document.documentElement.removeAttribute('data-colourblind');
  }, [colourblindSafe]);
}
