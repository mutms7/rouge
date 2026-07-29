/**
 * The Tally, as something you can lay out.
 *
 * One pure function from `CombatState` to a grid of cells and a lane per combatant. It
 * lives apart from the component and has no React in it, because the track is the piece
 * of UI most likely to be subtly wrong (off by a beat, a lap boundary in the wrong cell,
 * an intent pinned where it does not fire) and those are all bugs you want a unit test to
 * catch rather than your eyes.
 *
 * The window is always the lap ahead of *now*: cell 0 is `state.beat`, and everything
 * slides left as the clock advances. Absolute beats in, offsets out. The view never does
 * arithmetic on a beat.
 */
import { BEATS_PER_LAP } from '../../engine/constants';
import { guardAfterDecay } from '../../engine/effects';
import { isAlive, lapOf, trackBeat, visibleIntents } from '../../engine/tally';
import type { CombatState, Combatant, IntentDef, Team } from '../../engine/types';
import { displayNames } from './names';
import { isReinkIntent } from './notary';
import { intentDamage, summarize, type Chip } from './summary';

/** How many beats the strip shows. One lap, per §3.4: you read the whole window. */
export const WINDOW_BEATS = BEATS_PER_LAP;

export type TrackCell = {
  /** Absolute beat. */
  readonly beat: number;
  /** Where it sits on the 24-beat ring, which is the number printed on the ruler. */
  readonly trackBeat: number;
  /** Beat 0 of a lap. Drawn as a heavier rule: Interest fires on the boundary before it. */
  readonly lapStart: boolean;
  readonly offset: number;
};

export type TrackMarker = {
  readonly beat: number;
  readonly offset: number;
  /** Whoever is furthest behind, and therefore next to act. */
  readonly current: boolean;
  /** Past the right-hand edge of the window. Pinned to the last cell and flagged. */
  readonly clamped: boolean;
};

export type TrackIntent = {
  /** Stable across renders so motion can animate a chip rather than swap it. */
  readonly key: string;
  readonly enemyId: string;
  readonly beat: number;
  readonly offset: number;
  readonly intent: IntentDef;
  readonly chips: readonly Chip[];
  /** The Notary's two-beat vulnerability trigger, called out on the track. */
  readonly reink: boolean;
  /** Damage this one puts on you, for the preview arithmetic and the chip emphasis. */
  readonly damage: number;
};

/**
 * How far along the track this body's Guard reaches before it has melted away.
 *
 * Guard decays 1 per beat, which makes it the one stat in the game that is really a
 * *distance*, and drawing it as a number next to a portrait throws that away. Drawn on the
 * track next to the intents it is supposed to stop, "raise it late" stops being advice and
 * becomes something you can see. §3.3 calls this the skill ceiling; this is the UI that
 * lets a player find it.
 */
export type TrackGuard = {
  readonly n: number;
  /** Offset of the last cell still covered. */
  readonly through: number;
  /** Beats of it that a card or a Mark has held off the melt. */
  readonly frozenThrough: number;
};

export type TrackLane = {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly alive: boolean;
  readonly marker: TrackMarker | null;
  readonly guard: TrackGuard | null;
  readonly intents: readonly TrackIntent[];
};

export type TrackView = {
  /** Absolute beat of cell 0. */
  readonly start: number;
  readonly beats: number;
  readonly lap: number;
  readonly cells: readonly TrackCell[];
  /** Enemies first, the player last, so the player's lane sits nearest their hand. */
  readonly lanes: readonly TrackLane[];
};

function markerFor(combatant: Combatant, start: number, currentId: string | null): TrackMarker | null {
  if (!isAlive(combatant)) return null;
  const offset = combatant.position - start;
  return {
    beat: combatant.position,
    offset: Math.max(0, Math.min(WINDOW_BEATS - 1, offset)),
    current: combatant.id === currentId,
    clamped: offset > WINDOW_BEATS - 1,
  };
}

/**
 * Where this body's Guard runs out, asked of the engine one beat at a time.
 *
 * Walking it rather than computing `beat + guard` is deliberate: Drawn Line slows the
 * melt, A Widow's Thimble stops it for a lap, and Chalk Line freezes a slab of it, and
 * none of that is in the raw number. `guardAfterDecay` is the same function the reducer
 * uses when the clock actually moves, so the bar cannot promise Guard the fight will not
 * honour. Twenty-five iterations of arithmetic, once per lane, per render.
 */
function guardFor(combatant: Combatant, start: number): TrackGuard | null {
  if (!isAlive(combatant) || combatant.guard <= 0) return null;
  let through = 0;
  for (let offset = 1; offset < WINDOW_BEATS; offset += 1) {
    if (guardAfterDecay(combatant, start, start + offset) <= 0) break;
    through = offset;
  }
  return {
    n: combatant.guard,
    through,
    frozenThrough: Math.max(0, Math.min(WINDOW_BEATS - 1, combatant.guardFrozenUntil - start)),
  };
}

/**
 * Build the strip.
 *
 * `currentId` is passed in rather than recomputed so the caller can hand over whatever it
 * already knows about whose turn it is, including "nobody" once the fight is over.
 */
export function trackView(state: CombatState, currentId: string | null): TrackView {
  const start = state.beat;
  const names = displayNames(state);

  const cells: TrackCell[] = [];
  for (let offset = 0; offset < WINDOW_BEATS; offset += 1) {
    const beat = start + offset;
    cells.push({ beat, trackBeat: trackBeat(beat), lapStart: trackBeat(beat) === 0, offset });
  }

  // Everything the player is allowed to see, which is the horizon plus whatever Cold Read
  // bought them, then cropped to the window we can actually draw.
  const projected = visibleIntents(state).filter((p) => p.beat >= start && p.beat < start + WINDOW_BEATS);

  const lanes: TrackLane[] = [];
  for (const combatant of state.combatants) {
    if (combatant.team === 'player') continue;
    lanes.push({
      id: combatant.id,
      name: names[combatant.id] ?? combatant.name,
      team: combatant.team,
      alive: isAlive(combatant),
      marker: markerFor(combatant, start, currentId),
      guard: guardFor(combatant, start),
      intents: projected
        .filter((p) => p.enemyId === combatant.id)
        .map((p) => ({
          key: `${p.enemyId}:${String(p.index)}`,
          enemyId: p.enemyId,
          beat: p.beat,
          offset: p.beat - start,
          intent: p.intent,
          chips: summarize(p.intent.effects, { by: 'enemy' }),
          reink: isReinkIntent(p.intent.effects),
          damage: p.intent.targeting === 'none' || p.intent.targeting === 'self' ? 0 : intentDamage(p.intent.effects),
        })),
    });
  }

  const player = state.combatants.find((c) => c.team === 'player');
  if (player) {
    lanes.push({
      id: player.id,
      name: names[player.id] ?? player.name,
      team: player.team,
      alive: isAlive(player),
      marker: markerFor(player, start, currentId),
      guard: guardFor(player, start),
      intents: [],
    });
  }

  return { start, beats: WINDOW_BEATS, lap: lapOf(start), cells, lanes };
}
