/**
 * Writes `public/art/manifest.json`: a flat list of every art ID that actually has a
 * file on disk. The game loads it once at boot. An ID in the manifest renders real
 * art; an ID that is missing renders a procedural placeholder.
 *
 * Run after dropping new art in. `npm run dev` and `npm run build` both do it for you.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ART_KINDS } from '../src/content/art';
import { ART_ROOT, groupByKind, relFromRoot, scanArt } from './lib/art-files';

const MANIFEST_PATH = path.join(ART_ROOT, 'manifest.json');

async function main(): Promise<void> {
  const scan = await scanArt();
  const art = groupByKind(scan.files);
  const manifest = { version: 1 as const, art };

  await mkdir(ART_ROOT, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const ids = ART_KINDS.reduce((n, kind) => n + Object.keys(art[kind]).length, 0);
  const populated = ART_KINDS.filter((kind) => Object.keys(art[kind]).length > 0);

  console.log(`art:manifest  ${String(ids)} id(s), ${String(scan.files.length)} file(s) -> ${relFromRoot(MANIFEST_PATH)}`);
  for (const kind of populated) {
    console.log(`  ${kind.padEnd(10)} ${String(Object.keys(art[kind]).length)}`);
  }
  if (scan.problems.length > 0) {
    console.log('');
    for (const problem of scan.problems) console.warn(`  warn  ${problem}`);
  }
}

await main();
