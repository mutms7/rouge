/**
 * sim/ is the headless balance harness.
 *
 * Imports engine + content, never app. Plays thousands of seeded combats with a heuristic
 * policy and reports win rate per fight, average combat length in beats, damage taken, and
 * card play frequency.
 *
 * This is where balance decisions come from. Ten thousand runs is the only honest way to
 * balance a deckbuilder, and it only works because `engine/` is pure and deterministic: a
 * combat that resolves in a microsecond with no DOM is a combat you can play two thousand
 * of in a second.
 *
 * Phase 2 plays combats. Phase 5 extends this to whole runs, and phase 6 is where the
 * tables get acted on.
 */
export * from './estimate';
export * from './policy';
export * from './report';
export * from './run';
export * from './trial';
