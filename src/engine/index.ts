/**
 * engine/ is pure TypeScript. Deterministic. Zero DOM, zero React, zero browser APIs.
 *
 * It is a reducer: `(state, action) => state`. No mutation, no side effects, no
 * async. Every random decision goes through an injected `Rng` seeded off the run
 * seed, with separate streams per concern so changing one thing does not reshuffle
 * everything downstream.
 *
 * It must run in bare Node. There is a lint boundary and (from phase 1) a test that
 * imports this in a node environment and fails if anything reaches for `window`,
 * `document`, `Date`, or `Math.random`.
 *
 * Phase 1 builds the Tally in here. Nothing to export yet.
 */
export {};
