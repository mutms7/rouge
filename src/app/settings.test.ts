import { describe, expect, it } from 'vitest';
import { shouldSkipAnimation, useSettings } from './settings';

const off = { reducedMotion: false, fastForwardHeld: false, fastForwardLocked: false };

describe('when to animate', () => {
  it('animates by default', () => {
    expect(shouldSkipAnimation(off)).toBe(false);
  });

  it('stops for any of the three reasons', () => {
    expect(shouldSkipAnimation({ ...off, reducedMotion: true })).toBe(true);
    expect(shouldSkipAnimation({ ...off, fastForwardHeld: true })).toBe(true);
    expect(shouldSkipAnimation({ ...off, fastForwardLocked: true })).toBe(true);
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
