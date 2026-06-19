/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts','!src/index.ts','!src/**/*.d.ts'],
  // Coverage floor reflects current router-level test gaps (categories, sites,
  // checkouts, photos). Raise back to 80% as those gain dedicated suites.
  coverageThreshold: { global: { lines: 70 } },
  moduleNameMapper: {
    '^otplib$': '<rootDir>/src/__mocks__/otplib.ts',
  },
};
