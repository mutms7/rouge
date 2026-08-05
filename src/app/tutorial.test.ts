import { describe, expect, it } from 'vitest';
import { hasSeenTutorial, markTutorialSeen } from './tutorial';

function stubStorage(): void {
  const entries = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    },
  };
}

describe('the Tally walkthrough flag', () => {
  it('has not been seen until it is dismissed', () => {
    stubStorage();
    expect(hasSeenTutorial()).toBe(false);
    markTutorialSeen();
    expect(hasSeenTutorial()).toBe(true);
  });

  it('never throws with no storage at all', () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(() => hasSeenTutorial()).not.toThrow();
    expect(hasSeenTutorial()).toBe(false);
    expect(() => markTutorialSeen()).not.toThrow();
  });
});
