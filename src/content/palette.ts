/**
 * The locked palette from `docs/ART_CONTRACT.md` §4.
 *
 * Seven colours, no additions. Generated art quantizes to these exact values and
 * the CSS custom properties in `src/app/styles/tokens.css` mirror them (there is a
 * test that fails if the two drift apart).
 *
 * Oxblood is semantic. It means debt, damage, or interest. Never decoration.
 */
export const PALETTE = {
  paper: '#E8DFCE',
  chalk: '#B9B3A6',
  slate: '#3B3A38',
  void: '#14110F',
  oxblood: '#8C2B2B',
  brine: '#2F6E6A',
  brass: '#B98B3C',
} as const;

export type PaletteName = keyof typeof PALETTE;

export const PALETTE_NAMES = Object.keys(PALETTE) as readonly PaletteName[];

/**
 * Card suits.
 *
 * Compound is not a draftable suit, it is what Interest makes. Hunger belongs to Small
 * Mercy and nothing in the demo uses it. Neutral is the eight cards in §9 that belong to
 * nobody.
 */
export const SUITS = ['lie', 'grief', 'oath', 'theft', 'hunger', 'neutral', 'compound'] as const;

export type Suit = (typeof SUITS)[number];

/**
 * Suit colours for placeholder tinting and card framing. Art contract §4.
 *
 * The contract names five suits and Compound, and is silent on neutral. With seven locked
 * colours and every one of them already spoken for, neutral gets paper on paper: an
 * untinted card, which reads correctly as "this belongs to nobody".
 */
export const SUIT_TINT: Record<Suit, PaletteName> = {
  lie: 'chalk',
  grief: 'brine',
  oath: 'slate',
  theft: 'brass',
  hunger: 'oxblood',
  neutral: 'paper',
  compound: 'oxblood',
};

/** Compound is "oxblood on void". Everything else sits on paper. */
export const SUIT_BASE: Record<Suit, PaletteName> = {
  lie: 'paper',
  grief: 'paper',
  oath: 'paper',
  theft: 'paper',
  hunger: 'paper',
  neutral: 'paper',
  compound: 'void',
};

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Deterministic linear mix. `amount` is how much of `top` survives, 0 to 1. */
export function mixHex(top: string, bottom: string, amount: number): string {
  const a = hexToRgb(top);
  const b = hexToRgb(bottom);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: a.r * t + b.r * (1 - t),
    g: a.g * t + b.g * (1 - t),
    b: a.b * t + b.b * (1 - t),
  });
}

/** Rough perceptual luminance, 0 to 1. Used to pick readable ink over a tint. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Squared distance in RGB space. Cheap enough to run over a whole image. */
export function rgbDistanceSq(a: Rgb, b: Rgb): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/**
 * Distance from a colour to the nearest palette entry. `art:check` warns when too
 * much of an image sits outside the palette, which usually means the quantizer in
 * the art pipeline was skipped.
 */
export function distanceToPalette(colour: Rgb): number {
  let best = Number.POSITIVE_INFINITY;
  for (const name of PALETTE_NAMES) {
    const d = rgbDistanceSq(colour, hexToRgb(PALETTE[name]));
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
