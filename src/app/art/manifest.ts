import { ART_KINDS, type ArtKind } from '../../content/art';

/**
 * The manifest is a flat list of the art IDs that actually have files, written by
 * `npm run art:manifest` and loaded once at boot. Nothing imports it statically, so
 * dropping in art and regenerating is enough. There is no per-asset wiring anywhere.
 */
export type ArtFormat = 'png' | 'webp';

export type ArtManifest = {
  version: 1;
  /** kind -> id -> formats present on disk. */
  art: Record<ArtKind, Record<string, ArtFormat[]>>;
};

export const MANIFEST_URL = '/art/manifest.json';

export function emptyManifest(): ArtManifest {
  const art = {} as ArtManifest['art'];
  for (const kind of ART_KINDS) art[kind] = {};
  return { version: 1, art };
}

let current: ArtManifest = emptyManifest();
let loaded = false;

export function setArtManifest(manifest: ArtManifest): void {
  current = manifest;
  loaded = true;
}

export function getArtManifest(): ArtManifest {
  return current;
}

export function isArtManifestLoaded(): boolean {
  return loaded;
}

export function artFileCount(manifest: ArtManifest = current): number {
  let n = 0;
  for (const kind of ART_KINDS) n += Object.keys(manifest.art[kind]).length;
  return n;
}

export function artKindCount(manifest: ArtManifest = current): number {
  return ART_KINDS.filter((kind) => Object.keys(manifest.art[kind]).length > 0).length;
}

/** Tolerant parse: a malformed or half-written manifest degrades to placeholders. */
export function parseArtManifest(raw: unknown): ArtManifest {
  const manifest = emptyManifest();
  if (typeof raw !== 'object' || raw === null) return manifest;
  const art = (raw as { art?: unknown }).art;
  if (typeof art !== 'object' || art === null) return manifest;
  for (const kind of ART_KINDS) {
    const entry = (art as Record<string, unknown>)[kind];
    if (typeof entry !== 'object' || entry === null) continue;
    for (const [id, formats] of Object.entries(entry)) {
      if (!Array.isArray(formats)) continue;
      const clean = formats.filter((f): f is ArtFormat => f === 'png' || f === 'webp');
      if (clean.length > 0) manifest.art[kind][id] = clean;
    }
  }
  return manifest;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Loads the manifest at boot. A missing or broken manifest is not an error: the game
 * runs on placeholders, which is the whole point of the contract.
 */
export async function loadArtManifest(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  url: string = MANIFEST_URL,
): Promise<ArtManifest> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`manifest fetch failed`);
    setArtManifest(parseArtManifest(await response.json()));
  } catch {
    current = emptyManifest();
    loaded = false;
  }
  return current;
}

export function hasArt(kind: ArtKind, id: string, manifest: ArtManifest = current): boolean {
  return (manifest.art[kind][id]?.length ?? 0) > 0;
}

/**
 * The URL for a piece of art, or null when there is no file and the caller should
 * render a placeholder. Prefers webp; the png is the fallback for anything that
 * cannot read it.
 */
export function artUrl(kind: ArtKind, id: string, manifest: ArtManifest = current): string | null {
  const formats = manifest.art[kind][id];
  if (!formats || formats.length === 0) return null;
  const format: ArtFormat = formats.includes('webp') ? 'webp' : 'png';
  return `/art/${kind}/${id}.${format}`;
}
