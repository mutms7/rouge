/**
 * The one piece of mutable state in the view: which run is going, and where the player's
 * attention is inside it.
 *
 * The run itself is *not* state in the React sense, it is a value. Every action produces a
 * whole new `RunState`, combat included, and the store holds the latest one. Everything on
 * screen is a function of that value, which is the property that makes the desync class of
 * bug impossible rather than merely unlikely. Animation interpolates between two values; it
 * never *is* the value.
 *
 * One store rather than one per screen, because a combat is a field on a run: two stores
 * would mean two copies of the same combat and a rule about which one wins.
 *
 * Everything else in here is attention. `cursor` is which choice the keyboard points at,
 * `logCursor` records how long the combat log was before the last action so the view can
 * throw floating numbers over what the engine did in the meantime, and `confirm` is the
 * second press that Settling needs because Settling cannot be taken back.
 */
import { create } from 'zustand';
import { RUN_CONTENT } from '../content/library';
import { isPlayerTurn } from '../engine/combat';
import { createRun, replayRun, runReduce, saveOf } from '../engine/run';
import type { RunAction, RunState } from '../engine/runtypes';
import type { Action, CombatState } from '../engine/types';
import { isLegalCombatAction, playAction, needsTarget } from './combat/store';
import { platform } from '../platform';
import { choicesFor, isIrreversible, type RunChoice } from './run/choices';

export type Targeting = {
  readonly uid: string;
  /** Index into the living enemies, in combatant order. */
  readonly index: number;
};

export type AppStore = {
  readonly run: RunState | null;
  /** A save was on disk at boot, or after the last write. Drives the title screen. */
  readonly hasSave: boolean;
  readonly seed: number;
  /**
   * The fight that just ended, held for one beat.
   *
   * The reducer settles a finished combat instantly, which is right and which would also mean
   * the board vanishes on the frame the last body falls. So the view keeps it until the
   * player dismisses it, and it is purely presentational: the run has already moved on.
   */
  readonly endedCombat: CombatState | null;

  /** Length of the combat log before the last action. New entries are the flashes. */
  readonly logCursor: number;
  /** Hand index the keyboard points at, in a fight. */
  readonly cursor: number;
  readonly hovered: string | null;
  readonly hoveredTarget: string | null;
  readonly targeting: Targeting | null;
  readonly helpOpen: boolean;

  /** Index into `choices`, outside a fight. */
  readonly choice: number;
  /** A choice waiting on a second press. Settling, and anything else you cannot undo. */
  readonly confirm: number | null;
  readonly sheetOpen: boolean;

  setSeed: (seed: number) => void;
  startRun: (seed: number) => void;
  resumeRun: () => boolean;
  abandonRun: () => void;

  dispatchRun: (action: RunAction) => void;
  dispatch: (action: Action) => void;
  playCard: (uid: string, targetId?: string) => void;

  setCursor: (cursor: number) => void;
  setHovered: (uid: string | null) => void;
  setHoveredTarget: (id: string | null) => void;
  beginTargeting: (uid: string) => void;
  moveTarget: (by: number) => void;
  cancel: () => void;
  toggleHelp: () => void;

  moveChoice: (by: number) => void;
  setChoice: (index: number) => void;
  /** Take the choice under the cursor, asking again first if it is irreversible. */
  commitChoice: () => void;
  toggleSheet: () => void;
  /** Leave the finished board behind. */
  onward: () => void;
};

/** Clamp the hand cursor after a play, so it never points past the end of the hand. */
export function clampCursor(state: CombatState | null, cursor: number): number {
  const size = state?.deck.hand.length ?? 0;
  if (size === 0) return 0;
  return Math.max(0, Math.min(size - 1, cursor));
}

const FRESH = {
  endedCombat: null,
  logCursor: 0,
  cursor: 0,
  hovered: null,
  hoveredTarget: null,
  targeting: null,
  helpOpen: false,
  choice: 0,
  confirm: null,
  sheetOpen: false,
} as const;

export const useApp = create<AppStore>()((set, get) => ({
  run: null,
  hasSave: platform().saves.load() !== null,
  seed: 1,
  ...FRESH,

  setSeed: (seed) => {
    set({ seed });
  },

  startRun: (seed) => {
    const run = createRun(RUN_CONTENT, seed);
    platform().saves.write(saveOf(run));
    set({ run, seed, hasSave: true, ...FRESH });
  },

  /**
   * Pick up where the tab closed.
   *
   * A replay that throws is a save this build cannot read, which after phase 5 changes the
   * content will happen to somebody. So it is caught, the save is dropped, and the player
   * gets the title screen instead of a white one.
   */
  resumeRun: () => {
    const save = platform().saves.load();
    if (!save) {
      set({ hasSave: false });
      return false;
    }
    try {
      const run = replayRun(RUN_CONTENT, save);
      set({ run, seed: run.seed, hasSave: true, ...FRESH, logCursor: run.combat?.log.length ?? 0 });
      return true;
    } catch {
      platform().saves.clear();
      set({ hasSave: false });
      return false;
    }
  },

  abandonRun: () => {
    platform().saves.clear();
    set({ run: null, hasSave: false, ...FRESH });
  },

  /**
   * Commit a run action, and save.
   *
   * Saving on every action rather than at node boundaries is what makes resuming mid-fight
   * work, and it costs nothing: the save is a seed plus this list.
   */
  dispatchRun: (action) => {
    const { run } = get();
    if (!run || run.outcome !== 'ongoing') return;

    const before = run.combat?.log.length ?? 0;
    const next = runReduce(run, action);

    if (next.outcome === 'ongoing') platform().saves.write(saveOf(next));
    // A finished run is not a run to resume. Phase 5 puts a summary screen in front of this.
    else platform().saves.clear();

    set({
      run: next,
      hasSave: next.outcome === 'ongoing',
      // The board the fight ended on, for one dismissal. Only a combat action can end one.
      endedCombat: action.k === 'combat' && run.combat !== null && next.combat === null ? next.lastCombat : null,
      logCursor: action.k === 'combat' ? before : 0,
      cursor: clampCursor(next.combat, get().cursor),
      hovered: null,
      targeting: null,
      choice: 0,
      confirm: null,
    });
  },

  /**
   * Commit a combat action.
   *
   * Guarded against illegal actions rather than letting the reducer throw, because the UI
   * has three ways in (click, keyboard, target picker) and a stale hover is not a bug in the
   * engine. `legalActions` is the same list the sim picks from.
   */
  dispatch: (action) => {
    const combat = get().run?.combat ?? null;
    if (!combat || !isPlayerTurn(combat)) return;
    if (!isLegalCombatAction(combat, action)) return;
    get().dispatchRun({ k: 'combat', action });
  },

  playCard: (uid, targetId) => {
    const combat = get().run?.combat ?? null;
    if (!combat) return;
    get().dispatch(playAction(combat, uid, targetId));
  },

  setCursor: (cursor) => {
    set({ cursor: clampCursor(get().run?.combat ?? null, cursor) });
  },

  setHovered: (uid) => {
    set({ hovered: uid });
  },

  setHoveredTarget: (id) => {
    set({ hoveredTarget: id });
  },

  beginTargeting: (uid) => {
    set({ targeting: { uid, index: 0 } });
  },

  moveTarget: (by) => {
    const { run, targeting } = get();
    const combat = run?.combat ?? null;
    if (!combat || !targeting) return;
    const count = combat.combatants.filter((c) => c.team === 'enemy' && c.hp > 0).length;
    if (count === 0) return;
    set({ targeting: { ...targeting, index: (((targeting.index + by) % count) + count) % count } });
  },

  cancel: () => {
    const { targeting, helpOpen, sheetOpen, confirm } = get();
    if (helpOpen) {
      set({ helpOpen: false });
      return;
    }
    if (sheetOpen) {
      set({ sheetOpen: false });
      return;
    }
    if (confirm !== null) {
      set({ confirm: null });
      return;
    }
    if (targeting) set({ targeting: null });
  },

  toggleHelp: () => {
    set({ helpOpen: !get().helpOpen, sheetOpen: false });
  },

  moveChoice: (by) => {
    const count = choices(get().run).length;
    if (count === 0) return;
    set({ choice: (((get().choice + by) % count) + count) % count, confirm: null });
  },

  /**
   * Point at a choice.
   *
   * Only disarms the confirm when the cursor actually moves. Otherwise clicking the same row
   * twice would rearm it forever, because a mouse click is a move *and* a commit, and the
   * second click would land on a freshly disarmed row.
   */
  setChoice: (index) => {
    const count = choices(get().run).length;
    if (count === 0) return;
    const next = Math.max(0, Math.min(count - 1, index));
    if (next === get().choice) return;
    set({ choice: next, confirm: null });
  },

  commitChoice: () => {
    const { run, choice, confirm } = get();
    if (!run) return;
    const list = choices(run);
    const picked = list[choice];
    if (!picked || picked.disabled) return;

    // Settling deletes a card permanently. One keystroke should not be able to do that, so
    // the first press arms and the second commits. The map needs no such thing.
    if (isIrreversible(picked) && confirm !== choice) {
      set({ confirm: choice });
      return;
    }
    get().dispatchRun(picked.action);
  },

  toggleSheet: () => {
    set({ sheetOpen: !get().sheetOpen, helpOpen: false });
  },

  onward: () => {
    set({ endedCombat: null, logCursor: 0 });
  },
}));

/** The choices on offer right now. Memoised on the run value, which only changes on action. */
let choiceCacheKey: RunState | null = null;
let choiceCache: RunChoice[] = [];

export function choices(run: RunState | null): RunChoice[] {
  if (!run) return [];
  if (choiceCacheKey === run) return choiceCache;
  choiceCacheKey = run;
  choiceCache = choicesFor(run);
  return choiceCache;
}

/** The live combat, or null between fights. */
export function useCombatState(): CombatState | null {
  return useApp((s) => s.run?.combat ?? null);
}

export { needsTarget };
