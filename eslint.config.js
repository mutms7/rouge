import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The bans below are the architecture, enforced. See the master brief:
 * `src/engine/` and `src/content/` must run in bare Node with no DOM and no
 * ambient randomness or clock. Everything non-deterministic arrives injected.
 */
const BANNED_GLOBALS = [
  // clock and randomness
  'Date',
  'performance',
  // DOM and browser
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'crypto',
  'alert',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  // node
  'process',
  '__dirname',
  '__filename',
];

const BANNED_PROPERTIES = [
  { object: 'Math', property: 'random', message: 'Use the injected Rng. Determinism is the whole deal.' },
  { object: 'Date', property: 'now', message: 'No clock in engine/ or content/. Pass time in if you need it.' },
];

const pureRules = {
  'no-restricted-globals': [
    'error',
    ...BANNED_GLOBALS.map((name) => ({
      name,
      message: `${name} is banned here: engine/ and content/ must be pure and run in bare Node.`,
    })),
  ],
  'no-restricted-properties': ['error', ...BANNED_PROPERTIES],
  'no-console': 'error',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'sim-out/**', 'public/**', 'tmp/**', 'src-tauri/**'],
  },

  // Baseline for every TS file in the repo.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // The pure half of the codebase.
  {
    files: ['src/engine/**/*.ts', 'src/content/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      ...pureRules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'os'], message: 'engine/ and content/ import no host APIs.' },
            { group: ['react', 'react-dom', 'react/*', 'zustand', 'motion', 'motion/*', 'howler'], message: 'engine/ and content/ are view-free.' },
            { group: ['**/app/**', '**/platform/**', '**/sim/**'], message: 'The dependency arrow points at engine/ and content/, never out of them.' },
          ],
        },
      ],
    },
  },

  // The engine does not know what content exists. Content satisfies engine types.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'os'], message: 'engine/ imports no host APIs.' },
            { group: ['react', 'react-dom', 'react/*', 'zustand', 'motion', 'motion/*', 'howler'], message: 'engine/ is view-free.' },
            { group: ['**/app/**', '**/platform/**', '**/sim/**', '**/content/**'], message: 'engine/ defines the shapes; content/ fills them in.' },
          ],
        },
      ],
    },
  },

  // The one file allowed to name the things engine/ is banned from touching, because
  // its whole job is taking them away and proving a combat still resolves.
  {
    files: ['src/engine/purity.test.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },

  /**
   * Engine tests may read the real content, and only the real content.
   *
   * The import ban exists so that shipped engine code cannot depend on which cards exist. A
   * test file is not shipped and cannot create that dependency: no bundle ever sees it. And
   * some of the things most worth asserting are only true of the real act, not of a fixture.
   * "Every path through Act 1 has a Reckoning on it" and "all eight Hollows resolve without
   * throwing" are exactly the bugs that would otherwise be found by a player.
   *
   * `sim/` comes with it for one reason: the heuristic policy is the only thing that can play a
   * fight to its end, and a run test that cannot finish a fight cannot test a run. Everything
   * else stays banned, and the purity rules above stay on, which is the half that matters.
   */
  {
    files: ['src/engine/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'os'], message: 'engine/ imports no host APIs.' },
            { group: ['react', 'react-dom', 'react/*', 'zustand', 'motion', 'motion/*', 'howler'], message: 'engine/ is view-free.' },
            { group: ['**/app/**', '**/platform/**'], message: 'Engine tests may read content and the sim policy. Not the view.' },
          ],
        },
      ],
    },
  },

  // The sim is headless too, but it is allowed a clock and a CLI.
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/app/**'], message: 'sim/ imports engine + content, never the view.' }] },
      ],
    },
  },

  // React.
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/app/**/*.tsx'],
    extends: [reactRefresh.configs.vite],
  },

  // Build scripts and config.
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
);
