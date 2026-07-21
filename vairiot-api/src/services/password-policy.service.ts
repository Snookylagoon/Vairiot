import { ValidationError } from '../lib/errors';

// Minimum length (not an exact length — long passphrases are encouraged).
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
// A password this long is treated as a passphrase and exempt from the
// character-class diversity requirement.
const PASSPHRASE_LENGTH = 16;

// Small blocklist of obviously weak choices. Not a substitute for a breach-list
// check (HIBP) — see the note in validatePasswordPolicy — but catches the worst.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'letmein', 'welcome',
  'qwerty', 'qwertyuiop', 'admin', 'administrator', 'iloveyou', 'monkey',
  'dragon', 'football', 'baseball', 'abc123', '123456', '1234567', '12345678',
  '123456789', '1234567890', '000000', '111111', 'changeme', 'vairiot',
  'vairiot123', 'test1234', 'secret', 'sunshine', 'princess',
]);

export const PASSWORD_POLICY_HINT =
  `At least ${MIN_LENGTH} characters. Any characters allowed (letters, numbers, symbols, spaces). ` +
  `Shorter passwords must mix at least three of: lower-case, upper-case, digits, symbols. ` +
  `A passphrase of ${PASSPHRASE_LENGTH}+ characters is accepted as-is.`;

function characterClassCount(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  return classes;
}

export function validatePasswordPolicy(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (password.length > MAX_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_LENGTH} characters`);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new ValidationError('That password is too common — choose something less guessable');
  }
  // Passphrases (long) are strong on length alone; shorter passwords must be diverse.
  if (password.length < PASSPHRASE_LENGTH && characterClassCount(password) < 3) {
    throw new ValidationError(
      'Password must include at least three of: lower-case letters, upper-case letters, numbers, and symbols ' +
      `(or use a passphrase of ${PASSPHRASE_LENGTH}+ characters)`,
    );
  }
}
