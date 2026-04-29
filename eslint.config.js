// Flat-config for ESLint v9. Permissive on stylistic issues; strict on the
// patterns most likely to be real bugs (unused vars with non-underscore
// prefix, missing react-hook deps, react-refresh boundaries).
//
// Existing violations are baselined informally — CI runs eslint as
// continue-on-error until a triage pass clears the backlog. New code is
// expected to pass cleanly.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'build',
      'node_modules',
      '.vercel',
      '.browser-profiles',
      'coverage',
      'scripts/auto-poster',
      'supabase/functions',
      '*.config.js',
      '*.config.ts',
      'scripts/handler-regression/coverage-report.md',
      'scripts/handler-regression/cohesion-report.md',
      'scripts/handler-regression/centrality-report.md',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Codebase intentionally uses any in many places (LLM JSON parses,
      // dynamic supabase rows, etc). Off rather than fight every site.
      '@typescript-eslint/no-explicit-any': 'off',
      // Unused vars should warn; underscore-prefix is the convention for
      // intentionally-unused.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Empty-block sometimes used for fire-and-forget catch handlers.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Ban `console.log` in production code? Not yet — too many existing.
      'no-console': 'off',
      // The Handler intentionally constructs many template strings; backtick
      // mixed with single-quote inside is fine.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The regression scripts use Node globals (process, console, fetch, etc.)
    files: ['scripts/handler-regression/**/*.{mjs,js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
