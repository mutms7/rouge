/**
 * engine/ is pure TypeScript. Deterministic. Zero DOM, zero React, zero browser APIs.
 *
 * It is a reducer: `(state, action) => state`. No mutation, no side effects, no async.
 * Every random decision goes through a seeded `Rng` carried in the state, with separate
 * streams per concern so changing one thing does not reshuffle everything downstream.
 *
 * It must run in bare Node. `purity.test.ts` traps `window`, `document`, `Date` and
 * `Math.random` at runtime and plays a whole combat with them removed, and
 * `scripts/lib/purity-scan.ts` reads the source for the same offences.
 *
 * Phase 1 is the Tally: the track, Weight, Guard, Strain, and the keywords from §3.6.
 * The deck economy, Marks, and the run above combat arrive in phases 4 and 5.
 */
export * from './constants';
export * from './rng';
export * from './tally';
export * from './types';
export { cardWeightInHand, createCombat, currentActor, isPlayerTurn, legalActions, reduce } from './combat';
export { applyEffect, applyEffects, dealDamage, decayGuard } from './effects';
export type { DamageOptions, EffectContext } from './effects';
