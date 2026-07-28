import { artAspectRatio, type ArtKind } from '../../content/art';
import { luminance, mixHex, PALETTE, SUIT_BASE, SUIT_TINT, type Suit } from '../../content/palette';

/**
 * Procedural placeholders, per `docs/ART_CONTRACT.md` §3.
 *
 * Not grey boxes. Suit-tinted, labelled with the content ID in mono, and carrying one
 * glyph keyed to what the thing is. That means every screenshot taken before the art
 * exists is legible, you can tell at a glance what is missing, and a missing file is
 * never a crash and never a broken-image icon.
 */

export type PlaceholderGlyph =
  | 'attack'
  | 'skill'
  | 'enemy'
  | 'boss'
  | 'token'
  | 'portrait'
  | 'backdrop'
  | 'icon'
  | 'node'
  | 'brand';

/** How much of the suit tint survives over the base. Art contract says 40%. */
const TINT_AMOUNT = 0.4;

const KIND_GLYPH: Record<ArtKind, PlaceholderGlyph> = {
  cards: 'skill',
  enemies: 'enemy',
  bosses: 'boss',
  portraits: 'portrait',
  backdrops: 'backdrop',
  tokens: 'token',
  icons: 'icon',
  nodes: 'node',
  store: 'brand',
  brand: 'brand',
};

/**
 * Kinds that are not cards still get a tint, spread across the palette so two missing
 * things side by side never look like the same missing thing. Nothing gets oxblood for
 * free: red means debt.
 */
const KIND_SUIT: Record<ArtKind, Suit> = {
  cards: 'lie',
  enemies: 'oath',
  bosses: 'oath',
  portraits: 'lie',
  backdrops: 'grief',
  tokens: 'theft',
  icons: 'oath',
  nodes: 'lie',
  store: 'grief',
  brand: 'oath',
};

export type Placeholder = {
  /** What gets printed on it, e.g. `cards/paper_cut`. */
  label: string;
  background: string;
  ink: string;
  glyph: PlaceholderGlyph;
  aspectRatio: number;
};

export function placeholderFor(
  kind: ArtKind,
  id: string,
  options: { suit?: Suit; glyph?: PlaceholderGlyph } = {},
): Placeholder {
  const suit = options.suit ?? KIND_SUIT[kind];
  const background = mixHex(PALETTE[SUIT_TINT[suit]], PALETTE[SUIT_BASE[suit]], TINT_AMOUNT);
  return {
    label: `${kind}/${id}`,
    background,
    ink: luminance(background) > 0.45 ? PALETTE.void : PALETTE.paper,
    glyph: options.glyph ?? KIND_GLYPH[kind],
    aspectRatio: artAspectRatio(kind, id),
  };
}

/**
 * One primitive shape per glyph, in a 0..100 viewBox. Shape hints, not illustrations:
 * the real art comes from the image pipeline and nowhere else.
 */
export const GLYPH_PATHS: Record<PlaceholderGlyph, string> = {
  attack: 'M50 12 L88 88 L12 88 Z',
  skill: 'M50 50 m-38 0 a38 38 0 1 0 76 0 a38 38 0 1 0 -76 0',
  enemy: 'M50 10 L86 36 L72 84 L28 84 L14 36 Z',
  boss: 'M50 8 L88 30 L88 70 L50 92 L12 70 L12 30 Z',
  token: 'M50 50 m-38 0 a38 38 0 1 0 76 0 a38 38 0 1 0 -76 0 M50 50 m-14 0 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0',
  portrait: 'M50 34 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0 M20 92 L20 76 L80 76 L80 92 Z',
  backdrop: 'M8 62 L38 32 L62 56 L92 26 L92 78 L8 78 Z',
  icon: 'M22 22 L78 22 L78 78 L22 78 Z',
  node: 'M50 10 L90 50 L50 90 L10 50 Z',
  brand: 'M10 40 L90 40 L90 60 L10 60 Z',
};
