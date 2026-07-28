import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ART_ID_PATTERN, ART_KINDS, isArtKind, type ArtKind } from '../../src/content/art';

export type ArtFormat = 'png' | 'webp';

export type ArtFile = {
  kind: ArtKind;
  id: string;
  format: ArtFormat;
  /** Absolute path on disk. */
  path: string;
  /** Path relative to the repo root, with forward slashes. For printing. */
  rel: string;
  bytes: number;
};

export type ArtScan = {
  root: string;
  files: ArtFile[];
  /** Names that will silently never show up in game: typos, stray formats, junk. */
  problems: string[];
};

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const ART_ROOT = path.join(REPO_ROOT, 'public', 'art');

export function relFromRoot(absolute: string): string {
  return path.relative(REPO_ROOT, absolute).split(path.sep).join('/');
}

/** Where a given piece of art is expected to live. */
export function artPath(kind: ArtKind, id: string, format: ArtFormat = 'png'): string {
  return `public/art/${kind}/${id}.${format}`;
}

function isFormat(ext: string): ext is ArtFormat {
  return ext === 'png' || ext === 'webp';
}

/**
 * Walks `public/art/`. Only ever looks at the directories the contract names, so a
 * stray folder is reported rather than silently indexed.
 */
export async function scanArt(root: string = ART_ROOT): Promise<ArtScan> {
  const files: ArtFile[] = [];
  const problems: string[] = [];

  const entries = await readdir(root, { withFileTypes: true }).catch(() => null);
  if (!entries) return { root, files, problems: [`No art directory at ${relFromRoot(root)}`] };

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) {
      if (entry.name !== 'manifest.json') problems.push(`Loose file in public/art/: ${entry.name}`);
      continue;
    }
    if (!isArtKind(entry.name)) {
      problems.push(`Unknown art directory public/art/${entry.name}/ (expected one of: ${ART_KINDS.join(', ')})`);
      continue;
    }
    const kind: ArtKind = entry.name;
    const dir = path.join(root, kind);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names.sort()) {
      if (name.startsWith('.')) continue;
      const ext = path.extname(name).slice(1).toLowerCase();
      const id = path.basename(name, path.extname(name));
      if (!isFormat(ext)) {
        problems.push(`Not a png or webp: ${artPathLike(kind, name)}`);
        continue;
      }
      if (!ART_ID_PATTERN.test(id)) {
        problems.push(
          `Bad ID "${id}" in ${artPathLike(kind, name)}: IDs are lower_snake_case and must match the content data exactly.`,
        );
        continue;
      }
      const absolute = path.join(dir, name);
      const info = await stat(absolute);
      files.push({ kind, id, format: ext, path: absolute, rel: relFromRoot(absolute), bytes: info.size });
    }
  }

  files.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.format.localeCompare(b.format));
  return { root, files, problems };
}

function artPathLike(kind: ArtKind, name: string): string {
  return `public/art/${kind}/${name}`;
}

/** kind -> id -> formats present, sorted. The shape the manifest ships. */
export function groupByKind(files: readonly ArtFile[]): Record<ArtKind, Record<string, ArtFormat[]>> {
  const grouped = {} as Record<ArtKind, Record<string, ArtFormat[]>>;
  for (const kind of ART_KINDS) grouped[kind] = {};
  for (const file of files) {
    const bucket = grouped[file.kind];
    const formats = bucket[file.id] ?? [];
    if (!formats.includes(file.format)) formats.push(file.format);
    formats.sort();
    bucket[file.id] = formats;
  }
  return grouped;
}
