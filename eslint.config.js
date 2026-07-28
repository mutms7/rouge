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
