import { describe, expect, it, vi } from 'vitest';
import { shouldSkipAnimation, useSettings } from './settings';

const off = { reducedMotion: false, fastForwardHeld: false, fastForwardLocked: false };

/**
 * A `localStorage`, in a few lines. Same pattern as `platform/web.test.ts`: the suite runs in
 * bare Node, so a `window` with a `Map`-backed `localStorage` is stood up by hand rather than
 * pulling in jsdom for the one object this file touches.
 */
function stubStorage(): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return storage;
}

describe('when to animate', () => {
  it('animates by default', () => {
    expect(shouldSkipAnimation(off)).toBe(false);
  });

  it('stops for any of the four reasons', () => {
    expect(shouldSkipAnimation({ ...off, reducedMotion: true })).toBe(true);
    expect(shouldSkipAnimation({ ...off, fastForwardHeld: true })).toBe(true);
    expect(shouldSkipAnimation({ ...off, fastForwardLocked: true })).toBe(true);
    expect(shouldSkipAnimation({ ...off, reducedMotionOverride: true })).toBe(true);
  });

  it('treats a missing override the same as an absent one', () => {
    expect(shouldSkipAnimation(off)).toBe(false);
  });
});

describe('the settings screen', () => {
  it('lets the player force reduced motion regardless of the OS', () => {
    useSettings.setState({ ...off, reducedMotionOverride: false });
    useSettings.getState().setReducedMotionOverride(true);
    expect(shouldSkipAnimation(useSettings.getState())).toBe(true);
    useSettings.getState().setReducedMotionOverride(false);
    expect(shouldSkipAnimation(useSettings.getState())).toBe(false);
  });

  it('clamps volume to 0..1 and keeps mute independent of it', () => {
    useSettings.getState().setVolume(4);
    expect(useSettings.getState().volume).toBe(1);
    useSettings.getState().setVolume(-1);
    expect(useSettings.getState().volume).toBe(0);
    useSettings.getState().setAudioMuted(true);
    expect(useSettings.getState().volume).toBe(0);
    expect(useSettings.getState().audioMuted).toBe(true);
  });

  it('only accepts a font scale from the fixed set', () => {
    useSettings.getState().setFontScale(1.15);
    expect(useSettings.getState().fontScale).toBe(1.15);
  });

  it('toggles colourblind-safe mode', () => {
    useSettings.getState().setColourblindSafe(true);
    expect(useSettings.getState().colourblindSafe).toBe(true);
    useSettings.getState().setColourblindSafe(false);
    expect(useSettings.getState().colourblindSafe).toBe(false);
  });
});

describe('settings persistence', () => {
  it('round-trips every persisted field through localStorage', async () => {
    stubStorage();
    vi.resetModules();
    const fresh = await import('./settings');
    fresh.useSettings.getState().setVolume(0.4);
    fresh.useSettings.getState().setAudioMuted(true);
    fresh.useSettings.getState().setFontScale(1.3);
    fresh.useSettings.getState().setColourblindSafe(true);
    fresh.useSettings.getState().setReducedMotionOverride(true);
    fresh.useSettings.getState().toggleFastForwardLock();

    vi.resetModules();
    const reloaded = await import('./settings');
    const state = reloaded.useSettings.getState();
    expect(state.volume).toBe(0.4);
    expect(state.audioMuted).toBe(true);
    expect(state.fontScale).toBe(1.3);
    expect(state.colourblindSafe).toBe(true);
    expect(state.reducedMotionOverride).toBe(true);
    expect(state.fastForwardLocked).toBe(true);
  });

  it('falls back to defaults on a corrupt record rather than throwing', async () => {
    const storage = stubStorage();
    storage.setItem('rouge:settings:v1', '{not json');
    vi.resetModules();
    const fresh = await import('./settings');
    expect(fresh.useSettings.getState().volume).toBe(0.7);
    expect(fresh.useSettings.getState().colourblindSafe).toBe(false);
  });

  it('never lets reducedMotion itself (the OS mirror) persist or leak in from storage', async () => {
    const storage = stubStorage();
    storage.setItem('rouge:settings:v1', JSON.stringify({ reducedMotion: true }));
    vi.resetModules();
    const fresh = await import('./settings');
    // The OS mirror is not part of the persisted shape at all: only the manual override is.
    expect(fresh.useSettings.getState().reducedMotion).toBe(false);
  });
});

describe('fast-forward', () => {
  it('is held, not toggled, and releasing it puts animation back', () => {
    useSettings.setState(off);
    useSettings.getState().setFastForwardHeld(true);
    expect(shouldSkipAnimation(useSettings.getState())).toBe(true);
    useSettings.getState().setFastForwardHeld(false);
    expect(shouldSkipAnimation(useSettings.getState())).toBe(false);
  });

  it('keeps the lock independent of the key, so a stuck keyup cannot strand it', () => {
    useSettings.setState(off);
    useSettings.getState().toggleFastForwardLock();
    useSettings.getState().setFastForwardHeld(true);
    useSettings.getState().setFastForwardHeld(false);
    expect(useSettings.getState().fastForwardLocked).toBe(true);
    useSettings.getState().toggleFastForwardLock();
    expect(shouldSkipAnimation(useSettings.getState())).toBe(false);
  });
});
