import { describe, expect, it } from 'vitest';
import { formatViolations, isScannable, PURE_ROOTS, scanPureTree, scanSource, stripComments } from './purity-scan';

describe('purity scan', () => {
  it('finds nothing in engine/ or content/', () => {
    const violations = scanPureTree(process.cwd());
    expect(formatViolations(violations)).toBe('');
  });

  it('actually looked at some files', () => {
    expect(PURE_ROOTS).toEqual(['src/engine', 'src/content']);
    expect(isScannable('src/engine/combat.ts')).toBe(true);
    expect(isScannable('src/engine/combat.test.ts')).toBe(false);
    expect(isScannable('src/engine/art.css')).toBe(false);
  });

  it('catches the clock, the dice, the DOM and the wrong imports', () => {
    const bad = [
      `import { useState } from 'react';`,
      `import { readFileSync } from 'node:fs';`,
      `const roll = Math.random();`,
      `const started = Date.now();`,
      `const stamped = new Date();`,
      `const w = window.innerWidth;`,
      `setTimeout(() => {}, 0);`,
      `const mode = process.env.MODE;`,
    ].join('\n');
    const rules = scanSource('fake.ts', bad).map((v) => v.rule);

    expect(new Set(rules)).toEqual(
      new Set(['view-import', 'host-import', 'math-random', 'clock', 'dom', 'async', 'host']),
    );
  });

  it('reports the right line', () => {
    const source = ['const a = 1;', '', 'const b = Math.random();'].join('\n');
    expect(scanSource('fake.ts', source)).toEqual([
      { file: 'fake.ts', line: 3, rule: 'math-random', match: 'Math.random', why: expect.any(String) },
    ]);
  });

  it('ignores comments, since these files have to talk about what they cannot touch', () => {
    const source = [
      '/**',
      ' * No window, no document, no Math.random, no Date.now in here.',
      ' */',
      'export const fine = 1; // not even document',
    ].join('\n');
    expect(scanSource('fake.ts', source)).toEqual([]);
  });

  it('keeps line numbers intact while stripping', () => {
    const source = ['/* one', 'two', 'three */', 'code'].join('\n');
    expect(stripComments(source).split('\n')).toHaveLength(4);
    expect(stripComments(source).split('\n')[3]).toBe('code');
  });

  it('leaves a url alone', () => {
    expect(stripComments(`const u = 'https://example.com/x';`)).toContain('https://example.com/x');
  });
});
