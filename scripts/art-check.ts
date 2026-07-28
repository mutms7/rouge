/**
 * The one place the code track and the art track meet.
 *
 * Compares every art ID the content expects against what is actually in
 * `public/art/`, and reports: missing files, orphan files (art with no matching
 * content ID, usually a typo), wrong dimensions, and images that should have
 * transparency but do not. It also warns on palette drift and on the weight budget.
 *
 * Warn-only by default. `--strict` makes it exit non-zero, which is how CI enforces
 * art-completeness from phase 9.
 */
import sharp, { type Metadata, type Sharp } from 'sharp';
import { ART_BUDGET, ART_KINDS, artSize, expectedArtIds, type ArtKind } from '../src/content/art';
import { distanceToPalette } from '../src/content/palette';
import { ART_ROOT, artPath, relFromRoot, scanArt, type ArtFile } from './lib/art-files';

const STRICT = process.argv.includes('--strict');

/** How far a pixel may sit from the nearest palette colour before it counts as drift. */
const PALETTE_TOLERANCE = 20;
/** Fraction of visible pixels allowed off-palette. Art contract §4. */
const PALETTE_DRIFT_LIMIT = 0.08;

type Finding = { level: 'error' | 'warn'; message: string };

const findings: Finding[] = [];
const fail = (message: string) => findings.push({ level: 'error', message });
const warn = (message: string) => findings.push({ level: 'warn', message });

async function main(): Promise<void> {
  const expected = expectedArtIds();
  const scan = await scanArt();
  for (const problem of scan.problems) warn(problem);

  const present = new Map<string, ArtFile[]>();
  for (const file of scan.files) {
    const key = `${file.kind}/${file.id}`;
    present.set(key, [...(present.get(key) ?? []), file]);
  }

  const rows: { kind: ArtKind; expected: number; present: number; missing: number }[] = [];
  let expectedTotal = 0;

  for (const kind of ART_KINDS) {
    const wanted = [...(expected[kind] ?? [])].sort();
    expectedTotal += wanted.length;
    const ids = new Set(scan.files.filter((f) => f.kind === kind).map((f) => f.id));

    const missing = wanted.filter((id) => !ids.has(id));
    for (const id of missing) fail(`missing  ${artPath(kind, id)}`);

    // Orphans only mean something once the content for that kind exists. Before that,
    // every file would look orphaned, which is noise rather than information.
    if (wanted.length > 0) {
      const wantedSet = new Set(wanted);
      for (const id of [...ids].sort()) {
        if (!wantedSet.has(id)) warn(`orphan   ${artPath(kind, id)} matches no content ID`);
      }
    }

    rows.push({ kind, expected: wanted.length, present: ids.size, missing: missing.length });
  }

  await inspectFiles(scan.files);

  printTable(rows, expectedTotal, scan.files.length);
  reportBudget(scan.files);

  if (expectedTotal === 0) {
    console.log('');
    console.log('  No content IDs yet, so there is nothing to compare against. Phase 2 encodes the');
    console.log('  content and this turns into the shared to-do list with the art side.');
  }

  printFindings();
}

async function inspectFiles(files: readonly ArtFile[]): Promise<void> {
  for (const file of files) {
    const spec = artSize(file.kind, file.id);
    let image: Sharp;
    let metadata: Metadata;
    try {
      image = sharp(file.path);
      metadata = await image.metadata();
    } catch (error) {
      fail(`unreadable  ${file.rel} (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const { width, height } = metadata;
    if (spec && (width !== spec.width || height !== spec.height)) {
      fail(`size     ${file.rel} is ${String(width)}x${String(height)}, expected ${String(spec.width)}x${String(spec.height)}`);
    }
    if (!spec) {
      warn(`size     ${file.rel} has no size in the art spec, so it was not checked`);
    }

    const stats = await image.stats().catch(() => null);
    const opaque = stats?.isOpaque ?? true;
    if (spec?.alpha === 'transparent' && (metadata.hasAlpha !== true || opaque)) {
      fail(`alpha    ${file.rel} should be transparent and is not`);
    }
    if (spec?.alpha === 'opaque' && metadata.hasAlpha === true && !opaque) {
      warn(`alpha    ${file.rel} should be opaque and has transparent pixels`);
    }

    const drift = await paletteDrift(file.path);
    if (drift !== null && drift > PALETTE_DRIFT_LIMIT) {
      warn(`palette  ${file.rel} has ${(drift * 100).toFixed(1)}% of pixels off-palette (limit ${String(PALETTE_DRIFT_LIMIT * 100)}%)`);
    }
  }
}

/** How many pixels to look at per image. Plenty for a 7-colour palette. */
const PALETTE_SAMPLES = 40_000;

/**
 * Fraction of visible pixels further than the tolerance from any palette colour.
 *
 * Decodes at full size and samples with a stride. Do not be tempted to `resize()`
 * this: webp and jpeg get decoded through shrink-on-load, which silently ignores
 * `kernel: 'nearest'` and interpolates, so a perfectly palette-snapped image comes
 * back with a couple of hundred invented colours and every file looks like it drifted.
 */
async function paletteDrift(file: string): Promise<number | null> {
  try {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { channels } = info;
    const pixels = Math.floor(data.length / channels);
    const stride = Math.max(1, Math.floor(pixels / PALETTE_SAMPLES));

    let visible = 0;
    let off = 0;
    for (let p = 0; p < pixels; p += stride) {
      const i = p * channels;
      if (channels >= 4 && (data[i + 3] ?? 255) < 128) continue;
      visible += 1;
      if (distanceToPalette({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }) > PALETTE_TOLERANCE) {
        off += 1;
      }
    }
    return visible === 0 ? null : off / visible;
  } catch {
    return null;
  }
}

function reportBudget(files: readonly ArtFile[]): void {
  if (files.length === 0) return;

  // What the game actually downloads: webp where it exists, png otherwise.
  const shipped = new Map<string, ArtFile>();
  for (const file of files) {
    const key = `${file.kind}/${file.id}`;
    const chosen = shipped.get(key);
    if (!chosen || (chosen.format === 'png' && file.format === 'webp')) shipped.set(key, file);
  }

  let total = 0;
  for (const file of shipped.values()) {
    total += file.bytes;
    if (file.kind === 'cards' && file.bytes > ART_BUDGET.perCardBytes) {
      warn(`weight   ${file.rel} is ${kb(file.bytes)}, over the ${kb(ART_BUDGET.perCardBytes)} per-card limit: too detailed for the style, regenerate rather than crunch it`);
    }
  }
  console.log(`  shipped weight ${kb(total)} of ${kb(ART_BUDGET.totalBytes)} budget`);
  if (total > ART_BUDGET.totalBytes) warn(`weight   total shipped art is ${kb(total)}, over the ${kb(ART_BUDGET.totalBytes)} budget`);
}

function printTable(
  rows: readonly { kind: ArtKind; expected: number; present: number; missing: number }[],
  expectedTotal: number,
  fileCount: number,
): void {
  console.log(`art:check  ${relFromRoot(ART_ROOT)}`);
  console.log('');
  console.log(`  ${'kind'.padEnd(10)}${'expected'.padStart(9)}${'present'.padStart(9)}${'missing'.padStart(9)}`);
  for (const row of rows) {
    console.log(
      `  ${row.kind.padEnd(10)}${String(row.expected).padStart(9)}${String(row.present).padStart(9)}${String(row.missing).padStart(9)}`,
    );
  }
  const presentTotal = rows.reduce((n, r) => n + r.present, 0);
  const missingTotal = rows.reduce((n, r) => n + r.missing, 0);
  console.log(`  ${'-'.repeat(37)}`);
  console.log(
    `  ${'total'.padEnd(10)}${String(expectedTotal).padStart(9)}${String(presentTotal).padStart(9)}${String(missingTotal).padStart(9)}`,
  );
  console.log(`  ${String(fileCount)} file(s) on disk`);
}

function printFindings(): void {
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');

  for (const group of [errors, warnings]) {
    if (group.length === 0) continue;
    console.log('');
    const shown = group.slice(0, 40);
    for (const finding of shown) console.log(`  ${finding.level === 'error' ? 'ERR ' : 'warn'}  ${finding.message}`);
    if (group.length > shown.length) console.log(`  ... and ${String(group.length - shown.length)} more`);
  }

  console.log('');
  if (errors.length === 0 && warnings.length === 0) {
    console.log('art:check  clean');
  } else {
    console.log(`art:check  ${String(errors.length)} error(s), ${String(warnings.length)} warning(s)`);
  }

  if (errors.length > 0 && STRICT) {
    process.exitCode = 1;
  } else if (errors.length > 0) {
    console.log('           warn-only for now. Pass --strict to fail the build (phase 9 turns this on in CI).');
  }
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.round(bytes / 1024)} KB`;
}

await main();
