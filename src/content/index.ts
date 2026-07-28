/**
 * content/ is the data. Cards, enemies, tokens, events, act layout.
 *
 * Typed literals with `satisfies`, so typos are compile errors, plus a Zod pass at
 * build time for the things types cannot catch (duplicate IDs, dangling Mark
 * references). Card effects are data, not functions. If a card needs a bespoke
 * function, the effect vocabulary is missing an atom: add the atom.
 *
 * Pure. No DOM, no clock, no ambient randomness. Enforced by lint.
 *
 * Phase 2 fills this in. Phase 0 only needs the palette and the art contract.
 */
export * from './art';
export * from './palette';
