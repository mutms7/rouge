/**
 * content/ is the data. Cards, enemies, tokens, events, act layout.
 *
 * Typed literals with `satisfies`, so typos are compile errors, plus a Zod pass at build
 * time for the things types cannot catch (duplicate IDs, dangling Mark references, an
 * encounter naming a body that is not there). Card effects are data, not functions. If a
 * card needs a bespoke function, the effect vocabulary is missing an atom: add the atom.
 *
 * Pure. No DOM, no clock, no ambient randomness. Enforced by lint and by
 * `scripts/lib/purity-scan.ts`.
 *
 * The demo's whole content set lives here: 45 cards with their Marks, 20 Tokens, the 12
 * Act 1 bodies across 11 fights, 8 Hollows, and the run layout Act 1 hangs off.
 */
export * from './art';
export * from './cards';
export * from './enemies';
export * from './hollows';
export * from './library';
export * from './marks';
export * from './palette';
export * from './rules-text';
export * from './run';
export * from './tokens';
export * from './types';
