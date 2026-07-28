import { beforeEach, describe, expect, it } from 'vitest';
import type { ArtManifest } from './manifest';
import {
  artFileCount,
  artKindCount,
  artUrl,
  emptyManifest,
  hasArt,
  isArtManifestLoaded,
  loadArtManifest,
  parseArtManifest,
  setArtManifest,
} from './manifest';

function manifestWith(art: Partial<ArtManifest['art']>): ArtManifest {
  const manifest = emptyManifest();
  Object.assign(manifest.art, art);
  return manifest;
}

const loaded = manifestWith({
  cards: { paper_cut: ['png', 'webp'], flinch: ['png'] },
  enemies: { chalk_debtor: ['webp'] },
});

beforeEach(() => {
  setArtManifest(emptyManifest());
});

describe('artUrl', () => {
  it('returns null for art that has no file, which is what triggers the placeholder', () => {
    setArtManifest(loaded);
    expect(artUrl('cards', 'the_ninth_lie')).toBeNull();
    expect(hasArt('cards', 'the_ninth_lie')).toBe(false);
  });

  it('prefers webp and falls back to png', () => {
    setArtManifest(loaded);
    expect(artUrl('cards', 'paper_cut')).toBe('/art/cards/paper_cut.webp');
    expect(artUrl('cards', 'flinch')).toBe('/art/cards/flinch.png');
    expect(artUrl('enemies', 'chalk_debtor')).toBe('/art/enemies/chalk_debtor.webp');
  });

  it('addresses art purely by kind and content ID', () => {
    setArtManifest(manifestWith({ bosses: { the_notary_p2: ['png'] } }));
    expect(artUrl('bosses', 'the_notary_p2')).toBe('/art/bosses/the_notary_p2.png');
  });

  it('finds nothing in an empty manifest', () => {
    expect(artUrl('tokens', 'ledger_bone')).toBeNull();
    expect(artFileCount()).toBe(0);
    expect(artKindCount()).toBe(0);
  });
});

describe('parseArtManifest', () => {
  it('keeps well-formed entries', () => {
    const parsed = parseArtManifest({ version: 1, art: { cards: { paper_cut: ['png'] } } });
    expect(parsed.art.cards).toEqual({ paper_cut: ['png'] });
    expect(artFileCount(parsed)).toBe(1);
  });

  it('drops junk instead of throwing, because a broken manifest must not break the game', () => {
    expect(artFileCount(parseArtManifest(null))).toBe(0);
    expect(artFileCount(parseArtManifest('nope'))).toBe(0);
    expect(artFileCount(parseArtManifest({ art: 7 }))).toBe(0);
    const mixed = parseArtManifest({
      art: {
        cards: { paper_cut: ['png', 'gif'], broken: 'png', empty: [] },
        sprites: { nope: ['png'] },
      },
    });
    expect(mixed.art.cards).toEqual({ paper_cut: ['png'] });
    expect(artFileCount(mixed)).toBe(1);
  });
});

describe('loadArtManifest', () => {
  it('loads and marks itself loaded', async () => {
    const manifest = await loadArtManifest(
      () => Promise.resolve({ ok: true, json: () => Promise.resolve({ version: 1, art: { cards: { flinch: ['webp'] } } }) }),
      '/art/manifest.json',
    );
    expect(artUrl('cards', 'flinch', manifest)).toBe('/art/cards/flinch.webp');
    expect(isArtManifestLoaded()).toBe(true);
  });

  it('degrades to placeholders on a 404', async () => {
    const manifest = await loadArtManifest(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    expect(artFileCount(manifest)).toBe(0);
    expect(isArtManifestLoaded()).toBe(false);
  });

  it('degrades to placeholders when the fetch throws', async () => {
    const manifest = await loadArtManifest(() => Promise.reject(new Error('offline')));
    expect(artFileCount(manifest)).toBe(0);
    expect(isArtManifestLoaded()).toBe(false);
  });

  it('degrades to placeholders on unparseable json', async () => {
    const manifest = await loadArtManifest(() => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) }));
    expect(artFileCount(manifest)).toBe(0);
  });
});
