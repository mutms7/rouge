/**
 * The web platform. localStorage for saves, nothing for the rest.
 *
 * Two things worth the words. First, `load` never throws: a save is a JSON blob in a browser
 * the player could have edited, a schema that phase 5 will change, and a run that a bad
 * action log could crash on replay. All three of those are "there is no save", not "the game
 * is broken", so this validates the shape and hands back null when it does not like what it
 * sees. Losing a run is bad; a white screen on boot is worse.
 *
 * Second, the storage call sites are wrapped, because localStorage throws in private-mode
 * Safari and when the quota is full, and a game that cannot save should still be playable.
 */
import type { RunAction, RunSave } from '../engine/runtypes';
import type { Platform, SaveStore } from './types';

const SAVE_KEY = 'rouge:run:v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Shape-check a decoded save.
 *
 * Deliberately shallow: it confirms the action log is a list of things with a `k` the
 * reducer knows, and leaves the rest to `replayRun`, which is the only thing that can
 * really tell whether an action log is valid. The caller catches a failed replay.
 */
function parseSave(value: unknown): RunSave | null {
  if (!isRecord(value)) return null;
  if (value['v'] !== 1) return null;
  if (typeof value['seed'] !== 'number' || !Number.isFinite(value['seed'])) return null;
  if (!Array.isArray(value['actions'])) return null;

  const kinds = new Set(['travel', 'combat', 'answer', 'decline']);
  for (const action of value['actions'] as unknown[]) {
    if (!isRecord(action) || typeof action['k'] !== 'string' || !kinds.has(action['k'])) return null;
  }
  return { v: 1, seed: value['seed'], actions: value['actions'] as readonly RunAction[] };
}

function webSaves(): SaveStore {
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (raw === null) return null;
        return parseSave(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    write: (save) => {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      } catch {
        // Out of quota, or a browser that refuses to store anything. The run continues in
        // memory, which is strictly better than an exception in the middle of a fight.
      }
    },
    clear: () => {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Nothing to do about it and nothing depending on it.
      }
    },
  };
}

export const webPlatform: Platform = {
  name: 'web',
  saves: webSaves(),
  achievements: {
    unlock: () => {
      // Steam owns these. Phase 8 replaces this object, not its call sites.
    },
  },
  telemetry: {
    event: () => {
      // Nothing is collected in the demo. The seam exists so that decision stays reversible.
    },
  },
};

export { parseSave, SAVE_KEY };
