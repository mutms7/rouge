/**
 * The one piece of mutable state in the view: which combat is running, and where the
 * player's attention is.
 *
 * The engine state itself is *not* state in the React sense, it is a value: every action
 * produces a whole new `CombatState` and the store just holds the latest one. Everything
 * on screen is a function of that value, which is the property that makes the desync class
 * of bug impossible rather than merely unlikely. Animation interpolates between two
 * values; it never *is* the value.
 *
 * `logCursor` is the one concession to time passing. It records how long the log was
 * before the last action, so the view can throw floating numbers over whatever the engine
 * did in the meantime without keeping a queue that could fall behind.
 */
import { create } from 'zustand';
import { fightSetup } from '../../content/library';
import { createCombat, currentActor, isPlayerTurn, legalActions, reduce } from '../../engine/combat';
import { isAlive } from '../../engine/tally';
import type { Action, CombatState, Combatant } from '../../engine/types';

export type Targeting = {
  readonly uid: string;
  /** Index into the living enemies, in combatant order. */
  readonly index: number;
};

export type CombatStore = {
  readonly encounterId: string | null;
  readonly seed: number;
  readonly state: CombatState | null;
  /** Length of `state.log` before the last action. New entries are the flashes. */
  readonly logCursor: number;
  /** Hand index the keyboard is pointing at. */
  readonly cursor: number;
  /** Card the mouse is over. Beats the cursor for the preview, since it is more recent. */
  readonly hovered: string | null;
  /** Body the mouse is over. Points the preview without committing to targeting. */
  readonly hoveredTarget: string | null;
  readonly targeting: Targeting | null;
  readonly helpOpen: boolean;

  start: (encounterId: string, seed: number) => void;
  leave: () => void;
  dispatch: (action: Action) => void;
  playCard: (uid: string, targetId?: string) => void;
  setCursor: (cursor: number) => void;
  setHovered: (uid: string | null) => void;
  setHoveredTarget: (id: string | null) => void;
  beginTargeting: (uid: string) => void;
  moveTarget: (by: number) => void;
  cancel: () => void;
  toggleHelp: () => void;
};

/** Bodies a card may be pointed at, in the order the target cursor walks them. */
export function targetableEnemies(state: CombatState): Combatant[] {
  return state.combatants.filter((c) => c.team === 'enemy' && isAlive(c));
}

/** Whether committing this card needs a body picked first. */
export function needsTarget(state: CombatState, uid: string): boolean {
  const instance = state.deck.hand.find((c) => c.uid === uid);
  if (!instance) return false;
  const def = state.library[instance.cardId];
  if (!def || def.targeting !== 'opponent') return false;
  return targetableEnemies(state).length > 1;
}

/**
 * The action for playing this card at this body, normalised.
 *
 * `legalActions` only carries a `targetId` when there is a choice to make, so a card
 * pointed at the only body standing must arrive without one or it will not match. One
 * function, because the UI has three ways to commit a card and all three have to agree.
 */
export function playAction(state: CombatState, uid: string, targetId?: string): Action {
  if (targetId === undefined || !needsTarget(state, uid)) return { k: 'play_card', uid };
  return { k: 'play_card', uid, targetId };
}

/** Clamp the hand cursor after a play, so it never points past the end of the hand. */
function clampCursor(state: CombatState | null, cursor: number): number {
  const size = state?.deck.hand.length ?? 0;
  if (size === 0) return 0;
  return Math.max(0, Math.min(size - 1, cursor));
}

export const useCombat = create<CombatStore>()((set, get) => ({
  encounterId: null,
  seed: 0,
  state: null,
  logCursor: 0,
  cursor: 0,
  hovered: null,
  hoveredTarget: null,
  targeting: null,
  helpOpen: false,

  start: (encounterId, seed) => {
    const state = createCombat(fightSetup({ seed, encounterId }));
    set({
      encounterId,
      seed,
      state,
      logCursor: 0,
      cursor: 0,
      hovered: null,
      hoveredTarget: null,
      targeting: null,
      helpOpen: false,
    });
  },

  leave: () => {
    set({
      encounterId: null,
      state: null,
      logCursor: 0,
      cursor: 0,
      hovered: null,
      hoveredTarget: null,
      targeting: null,
    });
  },

  /**
   * Commit an action.
   *
   * Guarded against illegal actions rather than letting the reducer throw, because the UI
   * has three ways in (click, keyboard, target picker) and a stale hover is not a bug in
   * the engine. `legalActions` is the same list the sim picks from.
   */
  dispatch: (action) => {
    const { state } = get();
    if (!state || !isPlayerTurn(state)) return;
    const legal = legalActions(state).some((option) => {
      if (option.k !== action.k) return false;
      if (option.k !== 'play_card' || action.k !== 'play_card') return true;
      return option.uid === action.uid && (option.targetId ?? null) === (action.targetId ?? null);
    });
    if (!legal) return;

    const next = reduce(state, action);
    set({
      state: next,
      logCursor: state.log.length,
      cursor: clampCursor(next, get().cursor),
      hovered: null,
      targeting: null,
    });
  },

  playCard: (uid, targetId) => {
    const { state } = get();
    if (!state) return;
    get().dispatch(playAction(state, uid, targetId));
  },

  setCursor: (cursor) => {
    set({ cursor: clampCursor(get().state, cursor) });
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
    const { state, targeting } = get();
    if (!state || !targeting) return;
    const count = targetableEnemies(state).length;
    if (count === 0) return;
    set({ targeting: { ...targeting, index: (((targeting.index + by) % count) + count) % count } });
  },

  cancel: () => {
    const { targeting, helpOpen } = get();
    if (helpOpen) {
      set({ helpOpen: false });
      return;
    }
    if (targeting) set({ targeting: null });
  },

  toggleHelp: () => {
    set({ helpOpen: !get().helpOpen });
  },
}));

/** Whoever the track says acts next, or null once the fight is decided. */
export function actorOf(state: CombatState | null): Combatant | null {
  return state ? currentActor(state) : null;
}
