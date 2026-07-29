/**
 * The pure part of the combat UI: what can be pointed at what.
 *
 * The store itself moved up to `app/store.ts` in phase 4, because a combat is a field on a
 * run and two stores would have meant two copies of the same `CombatState` plus a rule about
 * which one wins. What is left here is the three questions the view asks about a combat that
 * are not about attention at all, so they are functions of a state and nothing else, and they
 * are testable without a store.
 */
import { currentActor, legalActions } from '../../engine/combat';
import { isAlive } from '../../engine/tally';
import type { Action, CombatState, Combatant } from '../../engine/types';

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
 * `legalActions` only carries a `targetId` when there is a choice to make, so a card pointed
 * at the only body standing must arrive without one or it will not match. One function,
 * because the UI has three ways to commit a card and all three have to agree.
 */
export function playAction(state: CombatState, uid: string, targetId?: string): Action {
  if (targetId === undefined || !needsTarget(state, uid)) return { k: 'play_card', uid };
  return { k: 'play_card', uid, targetId };
}

/** The legal choices for one held card, from the engine's action list. */
export function legalCardActions(state: CombatState, uid: string): {
  readonly play: readonly Extract<Action, { readonly k: 'play_card' }>[];
  readonly discard: Extract<Action, { readonly k: 'discard_compound' }> | null;
} {
  const play: Extract<Action, { readonly k: 'play_card' }>[] = [];
  let discard: Extract<Action, { readonly k: 'discard_compound' }> | null = null;
  for (const action of legalActions(state)) {
    if (action.k === 'play_card' && action.uid === uid) play.push(action);
    if (action.k === 'discard_compound' && action.uid === uid) discard = action;
  }
  return { play, discard };
}

/** Compare an app action with the engine's legal action list, including its UID. */
export function isLegalCombatAction(state: CombatState, action: Action): boolean {
  return legalActions(state).some((legal) => {
    if (legal.k !== action.k) return false;
    if (legal.k === 'play_card' && action.k === 'play_card') {
      return legal.uid === action.uid && (legal.targetId ?? null) === (action.targetId ?? null);
    }
    if (legal.k === 'discard_compound' && action.k === 'discard_compound') return legal.uid === action.uid;
    return true;
  });
}

/** Whoever the track says acts next, or null once the fight is decided. */
export function actorOf(state: CombatState | null): Combatant | null {
  return state ? currentActor(state) : null;
}
