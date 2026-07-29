/**
 * The art contract, as data.
 *
 * `docs/ART_CONTRACT.md` §2 is the source of truth for directories, sizes and
 * transparency. This file is that table in TypeScript so both the runtime (which
 * needs aspect ratios for placeholders) and the build scripts (which validate real
 * files) read the same numbers.
 *
 * Art is addressed by content ID. There is no registry and no wiring: a file at
 * `public/art/<kind>/<id>.png` shows up, its absence shows a placeholder.
 */
import { CARD_LIST } from './cards';
import { ENEMY_LIST } from './enemies';
import { BRAND_ASSET_IDS, CHARACTERS, ICON_IDS, NODES, STORE_ASSET_IDS, STRATA } from './run';
import { TOKEN_LIST } from './tokens';

export const ART_KINDS = [
  'cards',
  'enemies',
  'bosses',
  'portraits',
  'backdrops',
  'tokens',
  'icons',
  'nodes',
  'store',
  'brand',
] as const;

export type ArtKind = (typeof ART_KINDS)[number];

export type ArtAlpha = 'transparent' | 'opaque';

export type ArtSize = { width: number; height: number; alpha: ArtAlpha };

type ArtKindSpec = {
  /** Default size for the kind. Absent when every ID has its own size (store). */
  readonly size?: ArtSize;
  /** Per-ID overrides. Valve asset sizes live here. */
  readonly perId?: Readonly<Record<string, ArtSize>>;
};

const transparent = (width: number, height: number): ArtSize => ({ width, height, alpha: 'transparent' });
const opaque = (width: number, height: number): ArtSize => ({ width, height, alpha: 'opaque' });

export const ART_SPEC: Readonly<Record<ArtKind, ArtKindSpec>> = {
  cards: { size: opaque(768, 576) },
  enemies: { size: transparent(640, 640) },
  bosses: { size: transparent(1024, 1024) },
  portraits: { size: transparent(512, 640) },
  backdrops: { size: opaque(1920, 1080) },
  tokens: { size: transparent(256, 256) },
  icons: { size: transparent(128, 128) },
  nodes: { size: transparent(96, 96) },
  store: {
    // Valve rejects uploads that are off by a pixel. Verify against their current
    // asset guide before the store page goes up, they do change these.
    perId: {
      header_capsule: opaque(920, 430),
      small_capsule: opaque(462, 174),
      main_capsule: opaque(1232, 706),
      vertical_capsule: opaque(748, 896),
      library_capsule: opaque(600, 900),
      library_header: opaque(460, 215),
      library_hero: opaque(3840, 1240),
      library_logo: transparent(1280, 720),
      client_icon: opaque(32, 32),
    },
  },
  brand: { size: transparent(1600, 400) },
};

/** IDs are lower_snake_case, always, and match the content data exactly. */
export const ART_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function isArtKind(value: string): value is ArtKind {
  return (ART_KINDS as readonly string[]).includes(value);
}

/** The size an ID is expected to be, or null when the kind has no fixed size for it. */
export function artSize(kind: ArtKind, id: string): ArtSize | null {
  const spec = ART_SPEC[kind];
  return spec.perId?.[id] ?? spec.size ?? null;
}

/** Width over height, for reserving the right box before an image exists. */
export function artAspectRatio(kind: ArtKind, id: string): number {
  const size = artSize(kind, id);
  if (size) return size.width / size.height;
  const fallback = ART_SPEC[kind].size;
  return fallback ? fallback.width / fallback.height : 1;
}

/**
 * Every art ID the demo expects, derived from content.
 *
 * This is the shared to-do list with the art side, and it is *derived* rather than
 * written down twice on purpose: adding a card to `cards.ts` adds a line to
 * `npm run art:check` with no second edit, and there is no way for the two lists to
 * drift apart. 129 files for the demo, per art contract §5.
 *
 * Bosses are the one exception to "one ID, one file": phases are separate images, so a
 * boss contributes `<id>_p1` and `<id>_p2` to `bosses/` and nothing to `enemies/`.
 */
export function expectedArtIds(): Record<ArtKind, string[]> {
  const ids = {} as Record<ArtKind, string[]>;
  for (const kind of ART_KINDS) ids[kind] = [];

  for (const card of CARD_LIST) ids.cards.push(card.id);

  for (const enemy of ENEMY_LIST) {
    if (enemy.artKind === 'bosses') {
      const phases = 1 + (enemy.phases?.length ?? 0);
      for (let phase = 1; phase <= phases; phase += 1) ids.bosses.push(`${enemy.id}_p${String(phase)}`);
    } else {
      ids.enemies.push(enemy.id);
    }
  }

  for (const token of TOKEN_LIST) ids.tokens.push(token.id);
  for (const node of NODES) ids.nodes.push(node.id);
  for (const icon of ICON_IDS) ids.icons.push(icon);
  for (const asset of STORE_ASSET_IDS) ids.store.push(asset);
  for (const asset of BRAND_ASSET_IDS) ids.brand.push(asset);

  for (const stratum of STRATA) ids.backdrops.push(...stratum.backdrops);
  for (const character of CHARACTERS) {
    for (const expression of character.expressions) ids.portraits.push(`${character.id}_${expression}`);
  }

  return ids;
}

/** Weight budget from art contract §7, in bytes. */
export const ART_BUDGET = {
  /** Everything the web demo loads, after compression. */
  totalBytes: 6 * 1024 * 1024,
  /** A single card illustration over this is too detailed for the style. */
  perCardBytes: 80 * 1024,
} as const;
