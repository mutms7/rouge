import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_NAMES } from '../../content/palette';

/**
 * The palette exists twice: once as CSS custom properties for the UI, once as
 * TypeScript for placeholder tinting and the art checker. Two copies drift, so this
 * fails the build the moment they disagree.
 */
const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

describe('css tokens', () => {
  it('declares every palette colour with the exact locked hex', () => {
    for (const name of PALETTE_NAMES) {
      const match = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(css);
      expect(match, `--${name} is not declared in tokens.css`).not.toBeNull();
      expect(match?.[1]?.toUpperCase()).toBe(PALETTE[name].toUpperCase());
    }
  });

  it('declares no colour outside the palette', () => {
    const locked = new Set(PALETTE_NAMES.map((name) => PALETTE[name].toUpperCase()));
    const hexes = [...css.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) expect(locked, `${hex} is not in the palette`).toContain(hex);
  });

  it('keeps the font scale hook the whole UI hangs off', () => {
    expect(css).toContain('--font-scale');
  });
});
