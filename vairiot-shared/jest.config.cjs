/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // NodeNext sources import with .js extensions; strip them for ts-jest.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  // D8 ratchet (stage 2.1): every source file counts, not only those the
  // tests load; the gate is the measured value and is never lowered.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**', '!src/index.ts'],
  coverageThreshold: { global: { lines: 95 } },
};
