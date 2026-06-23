import { ValidationError } from '../lib/errors';

const REQUIRED_LENGTH = 12;
const ALPHANUMERIC_ONLY = /^[A-Za-z0-9]+$/;

export const PASSWORD_POLICY_HINT =
  `Exactly ${REQUIRED_LENGTH} characters — letters (A–Z, a–z) and numbers (0–9) only. No spaces or special characters.`;

export function validatePasswordPolicy(password: string): void {
  if (password.length !== REQUIRED_LENGTH) {
    throw new ValidationError(
      `Password must be exactly ${REQUIRED_LENGTH} characters`,
    );
  }
  if (!ALPHANUMERIC_ONLY.test(password)) {
    throw new ValidationError(
      'Password must contain only letters and numbers (no spaces or special characters)',
    );
  }
}
