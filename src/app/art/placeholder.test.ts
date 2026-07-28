import { describe, expect, it } from 'vitest';
import { ART_KINDS } from '../../content/art';
import { mixHex, PALETTE } from '../../content/palette';
import { GLYPH_PATHS, placeholderFor, type PlaceholderGlyph } from './placeholder';

describe('placeholderFor', () => {
  it('labels itself with kind and content ID, so a screenshot says what is missing', () => {
    expect(placeholderFor('cards', 'paper_cut').label).toBe('cards/paper_cut');
    expect(placeholderFor('bosses', 'the_notary_p1').label).toBe('bosses/the_notary_p1');
  });

  it('tints by suit at 40% over paper', () => {
    const lie = placeholderFor('cards', 'paper_cut', { suit: 'lie' });
    const theft = placeholderFor('cards', 'sleight', { suit: 'theft' });
    expect(lie.background).not.toBe(theft.background);
    // 40% chalk (B9B3A6) over paper (E8DFCE), channel by channel.
    expect(lie.background).toBe('#D5CDBE');
  });

  it('puts compound on void with light ink', () => {
    const compound = placeholderFor('cards', 'arrears', { suit: 'compound' });
    expect(compound.ink).toBe(PALETTE.paper);
    const lie = placeholderFor('cards', 'paper_cut', { suit: 'lie' });
    expect(lie.ink).toBe(PALETTE.void);
  });

  it('is deterministic', () => {
    expect(placeholderFor('tokens', 'ledger_bone')).toEqual(placeholderFor('tokens', 'ledger_bone'));
  });

  it('reserves the right box per kind', () => {
    expect(placeholderFor('cards', 'paper_cut').aspectRatio).toBeCloseTo(4 / 3);
    expect(placeholderFor('enemies', 'chalk_debtor').aspectRatio).toBe(1);
    expect(placeholderFor('backdrops', 'chalk_wards_a').aspectRatio).toBeCloseTo(16 / 9);
  });

  it('picks a glyph per kind and lets cards override it by type', () => {
    expect(placeholderFor('enemies', 'chalk_hound').glyph).toBe('enemy');
    expect(placeholderFor('tokens', 'a_jar_of_teeth').glyph).toBe('token');
    expect(placeholderFor('cards', 'flinch').glyph).toBe('skill');
    expect(placeholderFor('cards', 'paper_cut', { glyph: 'attack' }).glyph).toBe('attack');
  });

  it('has a shape for every glyph', () => {
    const glyphs: PlaceholderGlyph[] = [
      'attack',
      'skill',
      'enemy',
      'boss',
      'token',
      'portrait',
      'backdrop',
      'icon',
      'node',
      'brand',
    ];
    for (const glyph of glyphs) {
      expect(GLYPH_PATHS[glyph], glyph).toMatch(/^M/);
    }
    expect(Object.keys(GLYPH_PATHS).sort()).toEqual([...glyphs].sort());
  });

  it('never reaches for oxblood by default, because red only ever means debt', () => {
    const debtRed = mixHex(PALETTE.oxblood, PALETTE.paper, 0.4);
    for (const kind of ART_KINDS) {
      expect(placeholderFor(kind, 'x').background, kind).not.toBe(debtRed);
    }
    // Only the suits that mean debt get there.
    expect(placeholderFor('cards', 'x', { suit: 'hunger' }).background).toBe(debtRed);
  });
});
