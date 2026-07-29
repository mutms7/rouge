/**
 * The seam. One interface, two implementations, and nothing above it knows which it got.
 *
 * Web is localStorage and no-ops. Tauri is files in the app data directory (which is where
 * Steam Cloud will point) plus Steamworks through Tauri commands, and it arrives in phase 8
 * without changing a line above this file. That is the entire reason this exists in phase 4
 * rather than in phase 8: it is nearly free now and it is an audit later.
 *
 * Everything here is synchronous. localStorage is, and a save is a seed plus an action log,
 * so it is a few kilobytes at the outside. When the Tauri side needs to be async, `save` gets
 * a promise and the call sites stop caring, because none of them read the result.
 */
import type { RunSave } from '../engine/runtypes';

export type SaveStore = {
  /** The run in progress, or null. Returns null rather than throwing on a corrupt file. */
  load: () => RunSave | null;
  write: (save: RunSave) => void;
  clear: () => void;
};

/**
 * Achievements. Six of them land in phase 8; the web build swallows them.
 *
 * The calls go in *now*, at the moments they describe, so phase 8 is a Steamworks binding
 * and not a hunt through the reducer for where "first Settle" happens.
 */
export type Achievements = {
  unlock: (id: string) => void;
};

export type Telemetry = {
  event: (name: string, data?: Readonly<Record<string, string | number | boolean>>) => void;
};

export type Platform = {
  readonly name: 'web' | 'tauri';
  readonly saves: SaveStore;
  readonly achievements: Achievements;
  readonly telemetry: Telemetry;
};

/** The demo's achievement ids. Phase 8 wires them to Steam; the strings are the contract. */
export const ACHIEVEMENTS = {
  firstSettle: 'first_settle',
  firstInterest: 'first_interest',
  beatNotary: 'beat_notary',
  beatNotaryClean: 'beat_notary_no_interest',
  thinDeck: 'finish_with_eight',
  nothingHere: 'nothing_here',
} as const;
