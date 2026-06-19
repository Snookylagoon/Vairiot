import { ValidationError } from '../lib/errors';

const MIN_LENGTH = 12;

export function validatePasswordPolicy(password: string): void {
  const issues: string[] = [];

  if (password.length < MIN_LENGTH) {
    issues.push(`at least ${MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    issues.push('a lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    issues.push('an uppercase letter');
  }
  if (!/\d/.test(password)) {
    issues.push('a digit');
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    issues.push('a special character');
  }

  if (issues.length > 0) {
    throw new ValidationError(
      `Password must contain ${issues.join(', ')}`,
    );
  }
}
