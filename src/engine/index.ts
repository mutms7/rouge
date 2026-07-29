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
 * Phase 1 built the Tally: the track, Weight, Guard, Strain, and the keywords from §3.6.
 * Phase 2 added the rest of the effect vocabulary and the passive pipeline that Marks,
 * Tokens and enemy traits all run through. `vocabulary.ts` is the catalogue, and it says
 * which atoms the Tally resolves today and which ones phase 5 collects.
 *
 * Phase 4 put the run on top: `run.ts` is a second reducer, `(RunState, RunAction) => state`,
 * with a whole combat living inside it. Which is why a save is a seed plus one action log
 * and resuming mid-fight is not a special case.
 */
export * from './constants';
export * from './map';
export * from './mods';
export * from './rng';
export * from './run';
export * from './runmods';
export * from './runtypes';
export * from './tally';
export * from './types';
export * from './variants';
export * from './vocabulary';
export {
  cardWeightInHand,
  createCombat,
  currentActor,
  effectiveWeight,
  isPlayable,
  isPlayerTurn,
  legalActions,
  reduce,
} from './combat';
export {
  applyEffect,
  applyEffects,
  baseContext,
  dealDamage,
  decayGuard,
  guardAfterDecay,
  handPassives,
  passivesOf,
} from './effects';
export type { DamageOptions, EffectContext } from './effects';
