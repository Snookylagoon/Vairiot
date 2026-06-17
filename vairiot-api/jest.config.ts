import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts','!src/index.ts','!src/**/*.d.ts'],
  coverageThreshold: { global: { lines: 80 } },
};
export default config;
