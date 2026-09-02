// Flat config — replaces .eslintrc.js and .eslintignore, both of which eslint 9
// no longer reads. This is a faithful translation of the old config, not a
// re-think: same plugins, same rules, same ignores, so the lint result before
// and after the migration is comparable.
//
// Note on eslint 10: Mira's drift finding asks for 10.9.x and we are on 9.
// eslint-plugin-react's newest release (7.37.5) declares eslint "^9.7" and has
// no eslint 10 build, so 10 would mean linting a React codebase with no React
// rules. eslint-plugin-import is in the same position (peer tops out at ^9).
// This is an upstream constraint, not a preference — revisit when those two
// ship eslint 10 support.

const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  // Was .eslintignore. Flat config has no separate ignore file, and the
  // --ignore-path flag the lint scripts used was removed in eslint 9.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/src/generated/**',
      'vairiot-mobile/**',
      'vairiot-ios/**',
      '**/.claude/**',
      'infra/**',
      'scripts/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/jest.config.js',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // Was `env: { node, browser, es2022 }`.
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
      // eslint-plugin-import needs to be told about TS resolution now that the
      // shareable "import/typescript" config is no longer being extended.
      'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import/resolver': { node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] } },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // The old config got these two for free by extending
      // "plugin:@typescript-eslint/recommended" and "plugin:import/typescript".
      // Spreading only the `recommended` rules leaves them out, which is what
      // made no-redeclare and import/named fire 24 times on code the compiler
      // already checks.
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      ...reactPlugin.configs.recommended.rules,

      // react-hooks 7 recommended is a much bigger set than the v4 the project
      // was on: it adds 14 React Compiler rules (purity, immutability, refs,
      // set-state-in-render …). They look worth having, but turning them on as
      // a side effect of a version bump would land ~29 new errors that nobody
      // decided to take. Keep the two rules the project actually had; adopting
      // the compiler rules is its own piece of work.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Pre-existing `any`s are a cleanup backlog, not a CI blocker — new code
      // should still avoid them (warnings are visible in CI logs).
      '@typescript-eslint/no-explicit-any': 'warn',
      // `declare global { namespace Express … }` augmentation is the standard
      // way to extend req.user etc.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
      'import/no-unresolved': 'off', // handled by TypeScript
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Superseded by the @typescript-eslint version above; the base rule
      // cannot see through TS syntax.
      'no-unused-vars': 'off',
    },
  },

  // Must stay last: turns off everything that fights Prettier.
  prettier,
];
