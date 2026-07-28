/**
 * The static half of the Node-purity guard.
 *
 * `src/engine/` and `src/content/` have to run in bare Node with no DOM, no clock and
 * no ambient randomness. ESLint enforces that while you are editing, and
 * `src/engine/purity.test.ts` proves it at runtime for the paths a combat actually
 * walks. This reads the source instead, which is the only one of the three that catches
 * a `new Date()` sitting down a branch no test exercised yet.
 *
 * Comments are stripped before matching, because these files talk about the very
 * globals they are banned from touching.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

export const PURE_ROOTS = ['src/engine', 'src/content'] as const;

export type PurityRule = {
  readonly id: string;
  readonly pattern: RegExp;
  readonly why: string;
};

export const PURITY_RULES: readonly PurityRule[] = [
  { id: 'math-random', pattern: /\bMath\s*\.\s*random\b/g, why: 'use the seeded Rng carried in the state' },
  { id: 'clock', pattern: /\bnew\s+Date\b|\bDate\s*\.\s*(?:now|parse|UTC)\b|\bperformance\s*\.\s*now\b/g, why: 'no clock in the pure half: pass time in' },
  {
    id: 'dom',
    pattern: /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB|alert)\b/g,
    why: 'no DOM: this has to run in bare Node',
  },
  { id: 'network', pattern: /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/g, why: 'no network in the pure half' },
  {
    id: 'async',
    pattern: /\b(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\s*\(/g,
    why: 'the engine is synchronous: animation lives in the view',
  },
  { id: 'host', pattern: /\bprocess\s*\.\s*\w+|\b__dirname\b|\b__filename\b/g, why: 'no host globals' },
  {
    id: 'host-import',
    pattern: /from\s+['"](?:node:[^'"]+|fs|path|os|crypto)['"]/g,
    why: 'engine/ and content/ import no host APIs',
  },
  {
    id: 'view-import',
    pattern: /from\s+['"](?:react|react-dom|zustand|motion|howler)[^'"]*['"]/g,
    why: 'the pure half is view-free',
  },
];

export type Violation = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly match: string;
  readonly why: string;
};

/**
 * Blank out comments, keeping line numbers intact.
 *
 * Deliberately simple. It does not parse, so a `//` inside a string literal would be
 * mistaken for a comment. Nothing in the pure half has one, and the failure mode is a
 * missed violation in a file ESLint is already watching.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (_match, prefix: string) => prefix);
}

export function scanSource(file: string, source: string): Violation[] {
  const stripped = stripComments(source);
  const violations: Violation[] = [];
  for (const rule of PURITY_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let hit: RegExpExecArray | null;
    while ((hit = pattern.exec(stripped)) !== null) {
      const line = stripped.slice(0, hit.index).split('\n').length;
      violations.push({ file, line, rule: rule.id, match: hit[0], why: rule.why });
      if (hit[0].length === 0) break;
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** Tests are exempt: they exist to poke at exactly these globals. */
export function isScannable(file: string): boolean {
  return file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (isScannable(full)) out.push(full);
  }
  return out;
}

export function scanPureTree(repoRoot: string, roots: readonly string[] = PURE_ROOTS): Violation[] {
  const violations: Violation[] = [];
  for (const root of roots) {
    for (const file of walk(join(repoRoot, root))) {
      const relPath = relative(repoRoot, file).split(sep).join(posix.sep);
      violations.push(...scanSource(relPath, readFileSync(file, 'utf8')));
    }
  }
  return violations;
}

export function formatViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.file}:${v.line}  ${v.match}  (${v.rule}: ${v.why})`).join('\n');
}
