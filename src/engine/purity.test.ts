/**
 * The Node-purity test from the brief, the runtime half.
 *
 * It removes the things the engine is not allowed to want, plays a whole combat, and
 * puts them back. `Math.random` and `Date` are replaced with versions that throw, and
 * the browser globals are defined as getters that throw, so a `typeof window` check is
 * as much of a failure as a real DOM call.
 *
 * The static half lives in `scripts/lib/purity-scan.ts`, which reads the source for the
 * same offences and catches things a single run cannot, like `new Date()` down a branch
 * nothing exercised. Between them: the engine runs in bare Node, and stays that way.
 *
 * This is not bureaucracy. It is the thing that makes the sim harness, tiny save files,
 * and reproducible bug reports possible at all.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createCombat, legalActions, reduce } from './combat';
import { DUMMY_CARDS, biterEnemy } from './dummies';

const BROWSER_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'XMLHttpRequest',
  'requestAnimationFrame',
] as const;

type Restore = () => void;

let restores: Restore[] = [];

function trapGlobals(): void {
  const target = globalThis as unknown as Record<string, unknown>;

  for (const name of BROWSER_GLOBALS) {
    const existing = Object.getOwnPropertyDescriptor(target, name);
    if (existing && existing.configurable === false) continue;
    try {
      Object.defineProperty(target, name, {
        configurable: true,
        get() {
          throw new Error(`engine/ reached for ${name}`);
        },
      });
    } catch {
      continue;
    }
    restores.push(() => {
      delete target[name];
      if (existing) Object.defineProperty(target, name, existing);
    });
  }

  const realRandom = Math.random;
  Math.random = () => {
    throw new Error('engine/ called Math.random: use the injected Rng');
  };
  restores.push(() => {
    Math.random = realRandom;
  });

  const realDate = globalThis.Date;
  const Trap = function () {
    throw new Error('engine/ reached for the clock');
  } as unknown as DateConstructor;
  globalThis.Date = Trap;
  restores.push(() => {
    globalThis.Date = realDate;
  });
}

function releaseGlobals(): void {
  for (const restore of restores.reverse()) restore();
  restores = [];
}

afterEach(releaseGlobals);

describe('engine purity', () => {
  it('plays a whole combat with the clock, the dice and the DOM taken away', () => {
    // Everything between the trap and the release is synchronous engine code, so
    // nothing else can trip over the missing globals.
    let outcome = 'ongoing';
    let steps = 0;
    let trapWorked = false;
    let failure: unknown = null;

    trapGlobals();
    try {
      try {
        Math.random();
      } catch {
        trapWorked = true;
      }

      let state = createCombat({
        seed: 99,
        library: DUMMY_CARDS,
        player: { hp: 40 },
        enemies: [biterEnemy(4, 5, { id: 'debtor', hp: 30 })],
        deck: ['jab', 'jab', 'brace', 'shove', 'whisper', 'nick', 'heavy', 'free', 'echo_jab', 'burn'],
      });
      while (state.outcome === 'ongoing' && steps < 500) {
        const action = legalActions(state)[0];
        if (!action) break;
        state = reduce(state, action);
        steps += 1;
      }
      outcome = state.outcome;
    } catch (error) {
      failure = error;
    } finally {
      releaseGlobals();
    }

    expect(failure).toBeNull();
    expect(trapWorked).toBe(true);
    expect(steps).toBeGreaterThan(3);
    expect(outcome).not.toBe('ongoing');
  });

  it('puts the globals back, so the trap cannot leak into other tests', () => {
    expect(typeof Math.random()).toBe('number');
    expect(typeof Date.now()).toBe('number');
  });
});
