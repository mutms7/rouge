/**
 * What happens if you play this.
 *
 * The phase brief calls the hover preview the single most important piece of UI in the
 * game, and it is right: Weight is the entire cost system, so a player who cannot see
 * what a heavy card hands the enemy reads the whole thing as random.
 *
 * So this does not estimate. It *asks the engine*. `reduce` is pure, cheap, and returns a
 * new state without touching the one it was given, so previewing a card is one speculative
 * reduce and a diff. The preview therefore cannot disagree with what happens when you
 * commit, because it is the same code path, run twice with the same seed.
 *
 * Two things fall out of that which are worth naming:
 *
 * - Random outcomes inside the span (a discard at random, `damage_random`) resolve the
 *   same way in the preview as they will in the play, because the Rng lives in the state
 *   and the state is identical. There is no leak of *future* randomness: only of the one
 *   action you are already hovering.
 * - `landsOn` comes off the simulated marker, not off `beat + weight`, so Haste reads
 *   correctly. Doubling Back is Weight 2 and Haste 5, and the ghost lands three beats
 *   better off than you started, which is what the card says and what the arithmetic in a
 *   player's head refuses to do.
 */
import { effectiveWeight, isPlayerTurn, legalActions, reduce } from '../../engine/combat';
import { isAlive, lapOf } from '../../engine/tally';
import type { Action, CombatState, Combatant } from '../../engine/types';

export type PreviewBody = {
  readonly id: string;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly guardBefore: number;
  readonly guardAfter: number;
  readonly positionBefore: number;
  readonly positionAfter: number;
  readonly dies: boolean;
};

export type PlayPreview = {
  readonly action: Action;
  /** What it costs right now, boons and discounts already applied. */
  readonly weight: number;
  /** Where the player's marker is now. */
  readonly from: number;
  /** Where it ends up. Not always `from + weight`: Haste pulls it back. */
  readonly landsOn: number;
  /** Beats handed to the enemy. The band drawn on the track. */
  readonly span: number;
  /** Chip keys for the enemy actions that fire before you act again. */
  readonly interveningKeys: readonly string[];
  /** Damage that actually lands on you, from the simulation rather than from the chips. */
  readonly damageTaken: number;
  readonly hpAfter: number;
  readonly guardAfter: number;
  readonly strainAfter: number;
  readonly bodies: readonly PreviewBody[];
  /** True when a lap boundary falls inside the span. Interest bills you on the way past. */
  readonly crossesLap: boolean;
  readonly kills: readonly string[];
  readonly fatal: boolean;
  readonly wins: boolean;
};

function playerOf(state: CombatState): Combatant | null {
  return state.combatants.find((c) => c.team === 'player') ?? null;
}

function sameAction(a: Action, b: Action): boolean {
  if (a.k !== b.k) return false;
  if (a.k !== 'play_card' || b.k !== 'play_card') return true;
  return a.uid === b.uid && (a.targetId ?? null) === (b.targetId ?? null);
}

/**
 * The preview, or null when the action is not one the player may take right now.
 *
 * Null rather than a throw, because the caller is a hover handler and a mouse moving over
 * a Compound is not a bug.
 */
export function previewAction(state: CombatState, action: Action): PlayPreview | null {
  if (!isPlayerTurn(state)) return null;
  if (!legalActions(state).some((legal) => sameAction(legal, action))) return null;

  const before = playerOf(state);
  if (!before) return null;

  const weight = action.k === 'play_card' ? (effectiveWeight(state, action.uid) ?? 0) : 1;
  const from = before.position;

  const after = reduce(state, action);
  const playerAfter = playerOf(after);
  if (!playerAfter) return null;
  const landsOn = playerAfter.position;

  // Which chips the band lights up, counted rather than projected.
  //
  // An enemy's `intentIndex` only moves when it actually acts, so the indices between the
  // two states are exactly the actions that fire before the player comes up again, and
  // they key against the same `<enemyId>:<index>` the track draws its chips with. Counting
  // beats instead would lie in both directions: Small Print Slips the Chalk Hound out of
  // the span it looked like it was in, and a Slip on the player pulls extra actions into
  // one that looked safe.
  const interveningKeys: string[] = [];
  for (const foe of state.combatants) {
    if (foe.team !== 'enemy' || !isAlive(foe)) continue;
    const now = after.combatants.find((c) => c.id === foe.id);
    if (!now) continue;
    for (let index = foe.intentIndex; index < now.intentIndex; index += 1) {
      interveningKeys.push(`${foe.id}:${String(index)}`);
    }
  }

  const bodies: PreviewBody[] = [];
  const kills: string[] = [];
  for (const body of state.combatants) {
    if (body.team !== 'enemy') continue;
    const now = after.combatants.find((c) => c.id === body.id);
    if (!now) continue;
    const dies = isAlive(body) && !isAlive(now);
    if (dies) kills.push(body.name);
    bodies.push({
      id: body.id,
      hpBefore: body.hp,
      hpAfter: Math.max(0, now.hp),
      guardBefore: body.guard,
      guardAfter: now.guard,
      positionBefore: body.position,
      positionAfter: now.position,
      dies,
    });
  }

  return {
    action,
    weight,
    from,
    landsOn,
    span: Math.max(0, landsOn - from),
    interveningKeys,
    damageTaken: Math.max(0, before.hp - playerAfter.hp),
    hpAfter: Math.max(0, playerAfter.hp),
    guardAfter: playerAfter.guard,
    strainAfter: after.strain,
    bodies,
    crossesLap: lapOf(landsOn) > lapOf(from),
    kills,
    fatal: after.outcome === 'lost',
    wins: after.outcome === 'won',
  };
}
