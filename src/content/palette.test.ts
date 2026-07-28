import { describe, expect, it } from 'vitest';
import {
  distanceToPalette,
  hexToRgb,
  luminance,
  mixHex,
  PALETTE,
  PALETTE_NAMES,
  rgbToHex,
  SUITS,
  SUIT_BASE,
  SUIT_TINT,
} from './palette';

describe('palette', () => {
  it('is exactly the seven locked colours', () => {
    expect(PALETTE_NAMES).toEqual(['paper', 'chalk', 'slate', 'void', 'oxblood', 'brine', 'brass']);
    expect(PALETTE.oxblood).toBe('#8C2B2B');
  });

  it('round-trips hex and rgb', () => {
    for (const name of PALETTE_NAMES) {
      expect(rgbToHex(hexToRgb(PALETTE[name]))).toBe(PALETTE[name]);
    }
  });

  it('rejects anything that is not a six-digit hex', () => {
    expect(() => hexToRgb('#fff')).toThrow();
    expect(() => hexToRgb('oxblood')).toThrow();
  });

  it('mixes deterministically and clamps the ratio', () => {
    expect(mixHex(PALETTE.void, PALETTE.paper, 0)).toBe(PALETTE.paper);
    expect(mixHex(PALETTE.void, PALETTE.paper, 1)).toBe(PALETTE.void);
    expect(mixHex(PALETTE.void, PALETTE.paper, 2)).toBe(PALETTE.void);
    expect(mixHex(PALETTE.void, PALETTE.paper, -1)).toBe(PALETTE.paper);
    expect(mixHex(PALETTE.chalk, PALETTE.paper, 0.4)).toBe(mixHex(PALETTE.chalk, PALETTE.paper, 0.4));
  });

  it('puts paper light and void dark', () => {
    expect(luminance(PALETTE.paper)).toBeGreaterThan(0.8);
    expect(luminance(PALETTE.void)).toBeLessThan(0.1);
  });

  it('gives every suit a tint and a base, and only compound sits on void', () => {
    for (const suit of SUITS) {
      expect(PALETTE_NAMES).toContain(SUIT_TINT[suit]);
      expect(PALETTE_NAMES).toContain(SUIT_BASE[suit]);
    }
    expect(SUIT_BASE.compound).toBe('void');
    expect(SUIT_TINT.compound).toBe('oxblood');
    expect(SUITS.filter((suit) => SUIT_BASE[suit] === 'void')).toEqual(['compound']);
  });

  it('measures palette distance for the art check', () => {
    expect(distanceToPalette(hexToRgb(PALETTE.brine))).toBe(0);
    // A saturated green is nowhere near anything in the palette.
    expect(distanceToPalette({ r: 0, g: 255, b: 0 })).toBeGreaterThan(20);
  });
});
