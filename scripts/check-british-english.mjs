#!/usr/bin/env node
// Flags American spellings in user-facing text (project.md §2 rule 8:
// British English). Adapted from Vairiot CI.
//
// Checked: en-GB locale catalogues (the report renderer's included), Markdown
// documentation and string literals in TypeScript, React and Python sources.
// Code APIs that must keep the American spelling (CSS `color`, `Intl`,
// third-party option names) are allowed through the ALLOW list or an inline
// `// spelling-allow` comment on the same line.
//
//   node scripts/check-british-english.mjs            check the repository
//   node scripts/check-british-english.mjs --staged   check staged files only
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// American → British. Whole-word, case-insensitive.
const WORDS = {
  color: 'colour',
  colors: 'colours',
  colored: 'coloured',
  organization: 'organisation',
  organizations: 'organisations',
  organize: 'organise',
  organized: 'organised',
  authorize: 'authorise',
  authorized: 'authorised',
  unauthorized: 'unauthorised',
  authorization: 'authorisation',
  license: 'licence (noun)',
  licenses: 'licences (noun)',
  meter: 'metre (length)',
  meters: 'metres (length)',
  center: 'centre',
  centers: 'centres',
  catalog: 'catalogue',
  analyze: 'analyse',
  analyzed: 'analysed',
  customize: 'customise',
  customized: 'customised',
  initialize: 'initialise',
  initialized: 'initialised',
  normalize: 'normalise',
  recognize: 'recognise',
  synchronize: 'synchronise',
  optimize: 'optimise',
  favorite: 'favourite',
  behavior: 'behaviour',
  canceled: 'cancelled',
  labeled: 'labelled',
  labeling: 'labelling',
  traveled: 'travelled',
  modeling: 'modelling',
  fiber: 'fibre',
  fibers: 'fibres',
  gray: 'grey',
  utilization: 'utilisation',
  localization: 'localisation',
  serialize: 'serialise',
};

// Identifiers and phrases that must keep American spelling (external APIs).
const ALLOW = [
  /\bcolor-scheme\b/i,
  /\bbackground-color\b/i,
  /\bborder-color\b/i,
  /\btext-color\b/i,
  /\bcurrentColor\b/,
  /prefers-color-scheme/,
  /\bAuthorization\b/, // HTTP header name
  /\bUNAUTHORIZED\b/, // HTTP status name
  /Unauthorized/, // HTTP reason phrase in test fixtures
  /\bcolor:\s/, // CSS property
  /\bspelling-allow\b/,
  /(power|proximity|signal)[- ]?meters?/i, // instruments: "meter" is correct British English
  /powerMeter/,
  /\bcolor=/, // openpyxl keyword argument (Python)
];

const MD_FILES = /\.md$/;
const LOCALE_FILES =
  /((locales\/en-GB\/.*|vairiot_reports\/i18n\/en-GB)\.json|res\/values\/strings\.xml|\.xcstrings)$/;
const SOURCE_FILES = /\.(ts|tsx|py|kt|swift)$/;
const SKIP = /(node_modules|dist|coverage|generated|docs\/word\/|check-british-english)/;

function listFiles() {
  const staged = process.argv.includes('--staged');
  try {
    const cmd = staged
      ? 'git diff --cached --name-only --diff-filter=ACM'
      : 'git ls-files --cached --others --exclude-standard';
    return execSync(cmd, { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return execSync('find . -type f -not -path "*/node_modules/*"', { encoding: 'utf8' })
      .split('\n')
      .map((f) => f.replace(/^\.\//, ''))
      .filter(Boolean);
  }
}

// Text the rule applies to in each kind of file.
function checkedText(file, line) {
  if (MD_FILES.test(file) || LOCALE_FILES.test(file)) {
    // Ignore inline code in Markdown: identifiers keep their own spelling.
    return line.replace(/`[^`]*`/g, '');
  }
  // TypeScript: only string literals that read as prose (contain a space).
  // Tailwind class lists ("flex items-center gap-2") are framework identifiers
  // and keep their own spelling, so they are skipped.
  const strings = line.match(/'[^']*\s[^']*'|"[^"]*\s[^"]*"|`[^`]*\s[^`]*`/g) ?? [];
  return strings.filter((s) => !isClassList(s.slice(1, -1))).join(' ');
}

function isClassList(text) {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter((t) => !t.startsWith('${') && t !== '}');
  return (
    tokens.length > 0 &&
    tokens.every((t) => /^[a-z0-9!:\-/[\]._%#()=&>]+$/.test(t)) &&
    tokens.some((t) => t.includes('-') || t.includes(':'))
  );
}

const pattern = new RegExp(`\\b(${Object.keys(WORDS).join('|')})\\b`, 'gi');
const findings = [];

for (const file of listFiles()) {
  if (SKIP.test(file) || !existsSync(file)) continue;
  if (!MD_FILES.test(file) && !LOCALE_FILES.test(file) && !SOURCE_FILES.test(file)) continue;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (ALLOW.some((rule) => rule.test(line))) return;
      const text = checkedText(file, line);
      for (const match of text.matchAll(pattern)) {
        const word = match[0];
        // Joined to an identifier by - or : it is a CSS or Tailwind name
        // (text-gray-500, transition-colors, text-align:center), not prose.
        const before = text[match.index - 1];
        const after = text[match.index + word.length];
        if ('-:'.includes(before ?? ' ') || '-:'.includes(after ?? ' ')) continue;
        findings.push(`${file}:${index + 1}  "${word}" → ${WORDS[word.toLowerCase()]}`);
      }
    });
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  console.error(
    `\n✗ ${findings.length} American spelling(s) found (build rule 1: British English).`,
  );
  process.exit(1);
}
console.log('✓ British English check passed');
