import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { artPath, groupByKind, scanArt, type ArtScan } from './art-files';

let root: string;
let scan: ArtScan;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'rouge-art-'));
  await mkdir(path.join(root, 'cards'), { recursive: true });
  await mkdir(path.join(root, 'enemies'), { recursive: true });
  await mkdir(path.join(root, 'sprites'), { recursive: true });

  await writeFile(path.join(root, 'cards', 'paper_cut.png'), 'x');
  await writeFile(path.join(root, 'cards', 'paper_cut.webp'), 'xx');
  await writeFile(path.join(root, 'cards', 'flinch.png'), 'xxx');
  // Distinct from any lowercase fixture on purpose: Windows would fold the two
  // together and this test has to mean the same thing on both filesystems.
  await writeFile(path.join(root, 'cards', 'Cold_Read.png'), 'x'); // wrong case
  await writeFile(path.join(root, 'cards', 'small-print.png'), 'x'); // wrong separator
  await writeFile(path.join(root, 'cards', 'notes.txt'), 'x'); // not art
  await writeFile(path.join(root, 'enemies', 'chalk_debtor.png'), 'x');
  await writeFile(path.join(root, 'sprites', 'whatever.png'), 'x'); // not a kind
  await writeFile(path.join(root, 'stray.png'), 'x');

  scan = await scanArt(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scanArt', () => {
  it('indexes valid files only', () => {
    expect(scan.files.map((f) => `${f.kind}/${f.id}.${f.format}`)).toEqual([
      'cards/flinch.png',
      'cards/paper_cut.png',
      'cards/paper_cut.webp',
      'enemies/chalk_debtor.png',
    ]);
  });

  it('records byte sizes for the weight budget', () => {
    expect(scan.files.find((f) => f.id === 'flinch')?.bytes).toBe(3);
  });

  it('reports every name that would silently never show up in game', () => {
    const joined = scan.problems.join('\n');
    expect(joined).toContain('Cold_Read');
    expect(joined).toContain('small-print');
    expect(joined).toContain('notes.txt');
    expect(joined).toContain('sprites');
    expect(joined).toContain('stray.png');
    expect(scan.problems).toHaveLength(5);
  });

  it('does not mind a missing art directory', async () => {
    const empty = await scanArt(path.join(root, 'nope'));
    expect(empty.files).toEqual([]);
    expect(empty.problems).toHaveLength(1);
  });
});

describe('groupByKind', () => {
  it('collapses formats onto one ID', () => {
    const grouped = groupByKind(scan.files);
    expect(grouped.cards).toEqual({ flinch: ['png'], paper_cut: ['png', 'webp'] });
    expect(grouped.enemies).toEqual({ chalk_debtor: ['png'] });
    expect(grouped.tokens).toEqual({});
  });
});

describe('artPath', () => {
  it('is the one place a path gets built', () => {
    expect(artPath('cards', 'paper_cut')).toBe('public/art/cards/paper_cut.png');
    expect(artPath('bosses', 'the_notary_p1', 'webp')).toBe('public/art/bosses/the_notary_p1.webp');
  });
});
