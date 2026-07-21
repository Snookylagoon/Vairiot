module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'import', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    '@typescript-eslint/no-unused-vars':      ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    // Pre-existing `any`s are a cleanup backlog, not a CI blocker — new code
    // should still avoid them (warnings are visible in CI logs).
    '@typescript-eslint/no-explicit-any':     'warn',
    // `declare global { namespace Express … }` augmentation is the standard
    // way to extend req.user etc.
    '@typescript-eslint/no-namespace':        ['error', { allowDeclarations: true }],
    'react/no-unescaped-entities':            'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'import/order': ['error', {
      groups: ['builtin','external','internal','parent','sibling','index'],
      'newlines-between': 'always',
      alphabetize: { order: 'asc' },
    }],
    'import/no-unresolved': 'off', // handled by TypeScript
    'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'src/generated/',
    '*.config.js',
    '*.config.ts',
  ],
};
