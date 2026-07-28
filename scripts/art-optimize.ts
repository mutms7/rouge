/**
 * Emits a `.webp` next to every `.png` in `public/art/`.
 *
 * The web demo is the marketing, so it has to load fast on a bad connection. Flat
 * seven-colour art compresses absurdly well: lossless webp keeps the palette exact
 * (no ringing on flat blocks) and still lands far under budget.
 *
 * The png stays untouched as the source of truth and the fallback. The webp is
 * generated, gitignored, and rebuilt by `npm run build`.
 */
import { stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { ART_BUDGET } from '../src/content/art';
import { scanArt } from './lib/art-files';

const FORCE = process.argv.includes('--force');

async function main(): Promise<void> {
  const scan = await scanArt();
  const sources = scan.files.filter((file) => file.format === 'png');

  let written = 0;
  let skipped = 0;
  let pngBytes = 0;
  let webpBytes = 0;

  for (const source of sources) {
    const target = source.path.replace(/\.png$/, '.webp');
    pngBytes += source.bytes;

    const existing = await stat(target).catch(() => null);
    if (!FORCE && existing && existing.mtimeMs >= (await stat(source.path)).mtimeMs) {
      webpBytes += existing.size;
      skipped += 1;
      continue;
    }

    // sharp drops metadata unless asked to keep it, which is what we want.
    const buffer = await sharp(source.path).webp({ lossless: true, effort: 6 }).toBuffer();
    await writeFile(target, buffer);
    webpBytes += buffer.byteLength;
    written += 1;
  }

  if (sources.length === 0) {
    console.log('art:optimize  no png files in public/art/ yet, nothing to do');
    return;
  }

  console.log(
    `art:optimize  ${String(written)} written, ${String(skipped)} up to date  ${mb(pngBytes)} png -> ${mb(webpBytes)} webp`,
  );
  if (webpBytes > ART_BUDGET.totalBytes) {
    console.warn(`art:optimize  warn  shipped art is ${mb(webpBytes)}, over the ${mb(ART_BUDGET.totalBytes)} budget`);
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

await main();
