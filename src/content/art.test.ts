import { describe, expect, it } from 'vitest';
import { ART_ID_PATTERN, ART_KINDS, ART_SPEC, artAspectRatio, artSize, expectedArtIds, isArtKind } from './art';

describe('art spec', () => {
  it('has a size for every kind, or per-ID sizes', () => {
    for (const kind of ART_KINDS) {
      const spec = ART_SPEC[kind];
      expect(spec.size ?? spec.perId, `${kind} has no size`).toBeDefined();
    }
  });

  it('matches the art contract sizes', () => {
    expect(artSize('cards', 'paper_cut')).toEqual({ width: 768, height: 576, alpha: 'opaque' });
    expect(artSize('enemies', 'chalk_debtor')).toEqual({ width: 640, height: 640, alpha: 'transparent' });
    expect(artSize('bosses', 'the_notary_p1')).toEqual({ width: 1024, height: 1024, alpha: 'transparent' });
    expect(artSize('backdrops', 'chalk_wards_a')).toEqual({ width: 1920, height: 1080, alpha: 'opaque' });
  });

  it('knows the nine Valve store sizes, and that only the logo is transparent', () => {
    const store = ART_SPEC.store.perId;
    expect(store && Object.keys(store)).toHaveLength(9);
    expect(artSize('store', 'library_hero')).toEqual({ width: 3840, height: 1240, alpha: 'opaque' });
    expect(artSize('store', 'library_logo')?.alpha).toBe('transparent');
    expect(artSize('store', 'client_icon')?.alpha).toBe('opaque');
  });

  it('returns null for a store ID Valve does not define', () => {
    expect(artSize('store', 'not_a_capsule')).toBeNull();
  });

  it('reports aspect ratios so a placeholder reserves the real box', () => {
    expect(artAspectRatio('cards', 'paper_cut')).toBeCloseTo(4 / 3);
    expect(artAspectRatio('icons', 'guard')).toBe(1);
    expect(artAspectRatio('backdrops', 'chalk_wards_a')).toBeCloseTo(16 / 9);
    // Unknown store IDs still need a box rather than a crash.
    expect(artAspectRatio('store', 'not_a_capsule')).toBe(1);
  });

  it('only accepts lower_snake_case IDs', () => {
    for (const id of ['paper_cut', 'the_notarys_countersign', 'wick_neutral', 'chalk_wards_a', 'a1']) {
      expect(ART_ID_PATTERN.test(id), id).toBe(true);
    }
    for (const id of ['Paper_Cut', 'paper-cut', "the_notary's", 'paper cut', '_leading', 'trailing_', 'double__bar']) {
      expect(ART_ID_PATTERN.test(id), id).toBe(false);
    }
  });

  it('guards the kind list', () => {
    expect(isArtKind('cards')).toBe(true);
    expect(isArtKind('sprites')).toBe(false);
  });

  it('derives every expected ID from content, with no duplicates and a bucket per kind', () => {
    const expected = expectedArtIds();
    expect(Object.keys(expected).sort()).toEqual([...ART_KINDS].sort());

    const all = ART_KINDS.flatMap((kind) => expected[kind]);
    // Derived rather than written down twice: adding a card adds a line to `art:check`
    // with no second edit, so the two lists cannot drift apart. The exact counts are
    // asserted in `content.test.ts`, next to the design doc numbers they come from.
    expect(all.length).toBeGreaterThan(0);
    for (const kind of ART_KINDS) {
      expect(new Set(expected[kind]).size, `${kind} has duplicates`).toBe(expected[kind].length);
      for (const id of expected[kind]) expect(ART_ID_PATTERN.test(id), `${kind}/${id}`).toBe(true);
    }
  });
});
