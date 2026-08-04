/**
 * What the last action felt like.
 *
 * Same seam as `feed.ts`, one sense over: the engine resolves a whole exchange in one
 * synchronous call, so something has to read the slice of the log it appended and decide how
 * hard the screen shakes and what the room sounds like. This is that. Pure, takes the log
 * slice it is given, holds nothing.
 *
 * Both the shake and the audio come from *this one function* rather than from a listener in
 * each component. Two consequences worth the file: a hit is guaranteed to sound like it
 * looks, and neither can desync from the board, because neither is a queue. If nothing ever
 * called this, the fight would be silent and still, and still correct.
 */
import type { CombatState, LogEntry } from '../../engine/types';

/** Everything the demo makes a noise about. Ids are stable: the audio table keys off them. */
export type Cue =
  | 'card_play'
  | 'card_draw'
  | 'hit'
  | 'guard_break'
  | 'guard_hold'
  | 'interest'
  | 'stamp'
  | 'perjury'
  | 'reink'
  | 'death';

export type Impact = {
  /**
   * How hard the screen moves, 0 to 1.
   *
   * Scaled by the fraction of the player's maximum HP that just left, so a chip is a twitch
   * and the Notary's Final Notice is a thud. Damage to an enemy does not shake the screen:
   * the body already shakes, and shaking the room when *you* land a hit reads as being hit.
   */
  readonly shake: number;
  /** Beats the player's marker just advanced. The Tally's weight comes off this. */
  readonly advance: number;
  /**
   * The player's Guard went from something to nothing under a hit.
   *
   * Read as "something was blocked and there is nothing left", because the damage event
   * carries what Guard ate but not what survived. Guard melting a point at a time is not in
   * the log at all and is drawn from the bar's own previous value: it happens on every beat
   * of every fight, and an event per body per beat would be a log twice the size of the game
   * for a effect that is already on screen.
   */
  readonly guardBroke: boolean;
  /** Sounds to play, in log order, deduplicated. */
  readonly cues: readonly Cue[];
};

export const NO_IMPACT: Impact = {
  shake: 0,
  advance: 0,
  guardBroke: false,
  cues: [],
};

/**
 * A hit worth shaking for, as a fraction of max HP.
 *
 * Below this the screen holds still: the floating number and the body's own flinch carry
 * it. A deckbuilder where every 2-point chip rocks the camera is unreadable by beat ten.
 */
const SHAKE_FLOOR = 0.04;
/** The fraction of max HP that shakes as hard as the screen ever shakes. */
const SHAKE_FULL = 0.25;

function slice(state: CombatState, from: number): LogEntry[] {
  return state.log.slice(Math.max(0, from));
}

/**
 * Read the moment.
 *
 * `from` is an index into `state.log`, so the caller asks for "everything since the last
 * action" and this file remembers nothing.
 */
export function impactSince(state: CombatState, from: number): Impact {
  const player = state.combatants.find((c) => c.team === 'player');
  const playerId = player?.id ?? '';
  const maxHp = Math.max(1, player?.maxHp ?? 1);

  let lost = 0;
  let advance = 0;
  let blocked = 0;
  const cues: Cue[] = [];
  const add = (cue: Cue): void => {
    if (!cues.includes(cue)) cues.push(cue);
  };

  for (const entry of slice(state, from)) {
    const event = entry.event;
    switch (event.k) {
      case 'act':
        if (event.who === playerId) {
          if (event.what !== 'wait') add('card_play');
          advance += event.weight;
        }
        break;
      case 'draw':
        add('card_draw');
        break;
      case 'damage': {
        const through = Math.max(0, event.amount - event.blocked);
        if (event.who === playerId) {
          lost += through;
          blocked += event.blocked;
          if (through > 0) add('hit');
        } else if (through > 0) {
          add('hit');
        }
        break;
      }
      case 'interest':
        add('interest');
        break;
      case 'mark_stamped':
        add('stamp');
        break;
      case 'vulnerable':
        add('reink');
        break;
      case 'perjury_resolved':
        add('perjury');
        break;
      case 'death':
        add('death');
        break;
      default:
        break;
    }
  }

  const guardBroke = blocked > 0 && (player?.guard ?? 0) === 0;
  if (blocked > 0) cues.push(guardBroke ? 'guard_break' : 'guard_hold');

  const fraction = lost / maxHp;
  const shake =
    fraction < SHAKE_FLOOR ? 0 : Math.min(1, (fraction - SHAKE_FLOOR) / (SHAKE_FULL - SHAKE_FLOOR));

  return { shake, advance, guardBroke, cues };
}

/**
 * How long a slide on the Tally takes, given how far the clock just moved.
 *
 * Weight is the entire cost system (§3.2), so the track has to *feel* the difference between a
 * Weight 1 jab and a Weight 5 commitment; a flat duration makes both read as the same shrug.
 * Sub-linear rather than proportional, and capped, for two reasons: five beats should feel like
 * more than one rather than like five times the wait, and nobody clicking quickly should ever
 * get ahead of the marker they are trying to read.
 *
 * Takes the base duration rather than reading the settings, so zero in means zero out and
 * reduced motion needs no special case here.
 */
export function slideSeconds(base: number, advance: number): number {
  if (base <= 0) return 0;
  return base * (1 + Math.min(1.1, Math.sqrt(Math.max(0, advance)) * 0.42));
}
