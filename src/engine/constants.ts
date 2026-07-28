/**
 * Numbers the Tally itself needs.
 *
 * `BEATS_PER_LAP` and the Strain threshold are locked by §3 of the design doc.
 * Everything else here is a first pass: the hand cap, the starting hand, and what a
 * `wait` costs are all balance knobs the sim harness gets to argue with in phase 2.
 */

/** One full cycle of the track. §3.1. */
export const BEATS_PER_LAP = 24;

/** At 10 Strain you take 5 and reset to 0. §3.5. */
export const STRAIN_THRESHOLD = 10;
export const STRAIN_DAMAGE = 5;

/** First pass. The hand persists across the whole fight, so the cap is the brake. */
export const HAND_CAP = 10;
export const STARTING_HAND = 5;

/**
 * What it costs to act without playing anything.
 *
 * There is no end-turn button, but a hand can empty out and the Mark "Stillness"
 * wants deliberate idling to be legal, so waiting is an action like any other: it
 * advances your marker and draws you a card.
 */
export const WAIT_WEIGHT = 1;

/** Echo hands you the copy at Weight +1. §3.6. */
export const ECHO_WEIGHT_PENALTY = 1;

/**
 * Safety valve on the resolution loop. A combat that needs more steps than this to
 * get back to the player has a bug in it, and hanging is worse than throwing.
 */
export const MAX_RESOLVE_STEPS = 4096;
