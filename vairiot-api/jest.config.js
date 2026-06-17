/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts','!src/index.ts','!src/**/*.d.ts'],
  coverageThreshold: { global: { lines: 80 } },
};
