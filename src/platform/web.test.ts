/**
 * The web platform, and one rule: `load` never throws.
 *
 * A save is a JSON blob in a browser the player could have edited by hand, written by a build
 * whose content will change in phase 5. All of that is "there is no save", not "the game is
 * broken", and the difference between those two on boot is a title screen or a white one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RUN_CONTENT } from '../content/library';
import { createRun, runReduce, saveOf } from '../engine/run';
import { parseSave, SAVE_KEY, webPlatform } from './web';

/**
 * A localStorage, in eleven lines.
 *
 * The suite runs in bare Node, deliberately: `engine/` has to and everything else is pure. The
 * alternative to this stub is a jsdom dependency for one Map, which is not a trade worth
 * making for the four methods this file actually touches.
 */
function stubStorage(): void {
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
}

beforeEach(() => {
  stubStorage();
});

describe('parsing a save', () => {
  it('takes a real one', () => {
    const run = createRun(RUN_CONTENT, 3);
    const stepped = runReduce(run, { k: 'travel', nodeId: run.map.layers[0]?.[0] ?? '' });
    const save = saveOf(stepped);
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('refuses everything else', () => {
    for (const junk of [
      null,
      undefined,
      42,
      'a string',
      {},
      { v: 2, seed: 1, actions: [] },
      { v: 1, seed: 'one', actions: [] },
      { v: 1, seed: Number.NaN, actions: [] },
      { v: 1, seed: 1 },
      { v: 1, seed: 1, actions: {} },
      { v: 1, seed: 1, actions: [{ k: 'teleport' }] },
      { v: 1, seed: 1, actions: ['travel'] },
    ]) {
      expect(parseSave(junk), JSON.stringify(junk)).toBeNull();
    }
  });
});

describe('the store', () => {
  it('writes, reads and clears', () => {
    const save = saveOf(createRun(RUN_CONTENT, 9));
    expect(webPlatform.saves.load()).toBeNull();
    webPlatform.saves.write(save);
    expect(webPlatform.saves.load()).toEqual(save);
    webPlatform.saves.clear();
    expect(webPlatform.saves.load()).toBeNull();
  });

  it('hands back null on a corrupt entry instead of throwing at boot', () => {
    window.localStorage.setItem(SAVE_KEY, '{not json');
    expect(webPlatform.saves.load()).toBeNull();
    window.localStorage.setItem(SAVE_KEY, '{"v":1}');
    expect(webPlatform.saves.load()).toBeNull();
  });

  it('swallows achievements and telemetry, silently, on the web', () => {
    expect(() => {
      webPlatform.achievements.unlock('first_settle');
      webPlatform.telemetry.event('node_entered', { kind: 'assay' });
    }).not.toThrow();
  });
});
