/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // vairiot-shared ships an ESM build; resolve it from source as the API does.
  moduleNameMapper: {
    '^vairiot-shared$': '<rootDir>/../vairiot-shared/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // D8 ratchet (stage 2.1): every source file counts, not only those the
  // tests load; the gate is the measured value and is never lowered.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**', '!src/index.ts'],
  coverageThreshold: { global: { lines: 10 } },
};
