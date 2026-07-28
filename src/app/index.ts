/**
 * app/ is React. It renders engine state, dispatches actions, and owns all animation.
 *
 * The engine never waits for the view. Animation lives entirely in here and never
 * blocks or delays engine state, so a combat can resolve in a microsecond when nobody
 * is watching.
 */
export { App } from './App';
export * from './art';
export { strings } from './strings';
