#!/usr/bin/env node
// Sets or checks the one product version across every package
// (docs/managed-development-standard.md §8: one version, lockstep).
// Adapted from Vairiot CI.
//
//   node scripts/bump-version.mjs 2.0.1    set every version file to 2.0.1
//   node scripts/bump-version.mjs --check  fail if any version file differs from the root
//
// Version files: the root and workspace package.json files, their entries in
// package-lock.json, vairiot-reports/pyproject.toml, the Android versionName and
// the iOS MARKETING_VERSION (project.yml and the generated project.pbxproj),
// and the API's OpenAPI `info.version`.
// Build numbers are not touched: Android versionCode and iOS
// CURRENT_PROJECT_VERSION go up by one for every build handed to a device or
// tester, whatever the version (§8.3).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

const rootPackage = readJson('package.json');
const workspaces = rootPackage.workspaces;

// Text files whose version is found by a pattern with the version as group 2.
// A global pattern must match every occurrence (pbxproj has one per build
// configuration).
const TEXT_FILES = [
  {
    file: 'vairiot-reports/pyproject.toml',
    pattern: /(\[project\]\nname = "vairiot-reports"\nversion = ")([^"]+)(")/,
  },
  {
    file: 'vairiot-api/src/lib/openapi.ts',
    pattern: /(title: 'Vairiot Asset Management API',\n    version: ')([^']+)(')/,
  },
  {
    file: 'vairiot-mobile/app/build.gradle.kts',
    pattern: /(versionName = ")([^"]+)(")/,
  },
  {
    file: 'vairiot-ios/project.yml',
    pattern: /(MARKETING_VERSION: ")([^"]+)(")/,
  },
  {
    file: 'vairiot-ios/VairiotMobile.xcodeproj/project.pbxproj',
    pattern: /(MARKETING_VERSION = )([^;]+)(;)/g,
  },
];

function readJson(file) {
  return JSON.parse(readFileSync(join(root, file), 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

/** Every version the repository records, as [where, version] pairs. */
function collect() {
  const found = [['package.json', rootPackage.version]];
  for (const ws of workspaces) {
    found.push([`${ws}/package.json`, readJson(`${ws}/package.json`).version]);
  }
  const lock = readJson('package-lock.json');
  found.push(['package-lock.json (root)', lock.version]);
  found.push(['package-lock.json packages[""]', lock.packages[''].version]);
  for (const ws of workspaces) {
    found.push([`package-lock.json packages["${ws}"]`, lock.packages[ws]?.version]);
  }
  for (const { file, pattern } of TEXT_FILES) {
    const text = readFileSync(join(root, file), 'utf8');
    const matches = [...text.matchAll(new RegExp(pattern.source, 'g'))];
    if (matches.length === 0) found.push([file, undefined]);
    for (const m of matches) found.push([file, m[2]]);
  }
  return found;
}

function check() {
  const expected = rootPackage.version;
  const wrong = collect().filter(([, version]) => version !== expected);
  if (wrong.length > 0) {
    for (const [where, version] of wrong) {
      console.error(`✗ ${where} has ${version ?? 'no version'} (root is ${expected})`);
    }
    console.error('Run `node scripts/bump-version.mjs <version>` to set them all.');
    process.exit(1);
  }
  console.log(`✓ Every version file is at ${expected}`);
}

function set(version) {
  for (const file of ['package.json', ...workspaces.map((ws) => `${ws}/package.json`)]) {
    const pkg = readJson(file);
    pkg.version = version;
    writeJson(file, pkg);
  }
  const lock = readJson('package-lock.json');
  lock.version = version;
  lock.packages[''].version = version;
  for (const ws of workspaces) {
    if (lock.packages[ws]) lock.packages[ws].version = version;
  }
  writeJson('package-lock.json', lock);
  for (const { file, pattern } of TEXT_FILES) {
    const path = join(root, file);
    const text = readFileSync(path, 'utf8');
    if (!pattern.test(text)) {
      console.error(`✗ No version line found in ${file}`);
      process.exit(1);
    }
    writeFileSync(path, text.replace(pattern, `$1${version}$3`));
  }
  console.log(
    `✓ Version set to ${version}. Next: CHANGELOG.md, then commit as chore(release): ${version}`,
  );
}

const arg = process.argv[2];
if (arg === '--check') {
  check();
} else if (arg && SEMVER.test(arg)) {
  set(arg);
} else {
  console.error('Usage: node scripts/bump-version.mjs <major.minor.patch> | --check');
  process.exit(1);
}
