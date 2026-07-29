/**
 * The track. Pure arithmetic over positions, no state changes.
 *
 * Markers hold an *absolute* beat, not a position on the ring. That is the one
 * modelling decision the whole Tally rests on: with absolute positions, "furthest
 * behind acts next" is just the minimum, ordering stays total across lap boundaries,
 * and the clock can never be ambiguous about who is behind whom. `position % 24` is a
 * display concern.
 */
import { BEATS_PER_LAP } from './constants';
import type { CardDef, CardInstance, Combatant, IntentDef, ProjectedIntent, Team } from './types';

/** Which lap an absolute beat falls in. Lap 0 is beats 0 to 23. */
export function lapOf(beat: number): number {
  return Math.floor(beat / BEATS_PER_LAP);
}

/** Where an absolute beat sits on the 24-beat ring. */
export function trackBeat(beat: number): number {
  const b = beat % BEATS_PER_LAP;
  return b < 0 ? b + BEATS_PER_LAP : b;
}

export function isAlive(combatant: { readonly hp: number }): boolean {
  return combatant.hp > 0;
}

export function living<T extends { readonly hp: number }>(combatants: readonly T[]): T[] {
  return combatants.filter(isAlive);
}

export function opponentsOf<T extends { readonly team: Team }>(combatants: readonly T[], team: Team): T[] {
  return combatants.filter((c) => c.team !== team);
}

/** The beat of whoever is furthest behind, or null if nobody is left standing. */
export function frontBeat(combatants: readonly Combatant[]): number | null {
  let front: number | null = null;
  for (const c of combatants) {
    if (!isAlive(c)) continue;
    if (front === null || c.position < front) front = c.position;
  }
  return front;
}

/**
 * Who acts next: furthest behind wins, and a tie goes to the player. §3.1.
 *
 * Enemy-against-enemy ties fall to whoever appears first in the combatant list, which
 * is stable and needs no dice.
 */
export function nextActor(combatants: readonly Combatant[]): Combatant | null {
  let best: Combatant | null = null;
  for (const c of combatants) {
    if (!isAlive(c)) continue;
    if (best === null || c.position < best.position) {
      best = c;
      continue;
    }
    if (c.position === best.position && best.team !== 'player' && c.team === 'player') best = c;
  }
  return best;
}

/** What this instance costs to play. Echo copies carry a positive delta. */
export function cardWeight(def: CardDef, instance: CardInstance): number {
  return Math.max(0, def.weight + instance.weightDelta);
}

/**
 * Every enemy action inside the visible window, pinned to its beat. §3.4.
 *
 * Planning in this game is spatial, so the view needs the whole lap ahead rather than
 * just the next intent. Intent weights are validated at or above 1, so the walk always
 * terminates.
 */
export function projectIntents(
  state: { readonly beat: number; readonly combatants: readonly Combatant[] },
  horizon: number = BEATS_PER_LAP,
): ProjectedIntent[] {
  const limit = state.beat + horizon;
  const out: ProjectedIntent[] = [];
  for (const combatant of state.combatants) {
    if (!isAlive(combatant) || combatant.intents.length === 0) continue;
    let beat = combatant.position;
    let index = combatant.intentIndex;
    while (beat < limit) {
      const intent = combatant.intents[index % combatant.intents.length] as IntentDef;
      out.push({ enemyId: combatant.id, beat, trackBeat: trackBeat(beat), index, intent });
      beat += intent.weight;
      index += 1;
    }
  }
  out.sort((a, b) => a.beat - b.beat || a.enemyId.localeCompare(b.enemyId) || a.index - b.index);
  return out;
}

/**
 * What the player is actually allowed to see, given the horizon and whatever they read.
 *
 * Two different things buy visibility and they buy it in different units. Tell and the
 * Salt-Rimed Spectacles push the horizon out by a whole lap, which is a distance. Cold
 * Read buys "the enemy's next 2 intents", which is a count and does not care how far
 * away they are. So: project generously, then take the union of both allowances.
 */
export function visibleIntents(state: {
  readonly beat: number;
  readonly combatants: readonly Combatant[];
  readonly intentHorizon: number;
  readonly intentsRevealed: number;
}): ProjectedIntent[] {
  const horizon = Math.max(state.intentHorizon, BEATS_PER_LAP);
  const generous = projectIntents(state, horizon + BEATS_PER_LAP * 2);
  const withinHorizon = generous.filter((p) => p.beat < state.beat + horizon);
  if (state.intentsRevealed <= 0) return withinHorizon;

  // Count the extra reveals per enemy, so reading one body does not spend the allowance
  // on a different one.
  const extra: ProjectedIntent[] = [];
  const seen = new Map<string, number>();
  for (const projected of generous) {
    if (withinHorizon.includes(projected)) continue;
    const used = seen.get(projected.enemyId) ?? 0;
    if (used >= state.intentsRevealed) continue;
    seen.set(projected.enemyId, used + 1);
    extra.push(projected);
  }
  return [...withinHorizon, ...extra].sort(
    (a, b) => a.beat - b.beat || a.enemyId.localeCompare(b.enemyId) || a.index - b.index,
  );
}
