import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

let cached: Transporter | null = null;

export function getMailer(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  if (!host) {
    logger.warn('SMTP_HOST not set — using JSON transport (emails logged, not sent).');
    cached = nodemailer.createTransport({ jsonTransport: true });
    return cached;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  // Default: implicit TLS on 465, STARTTLS upgrade on everything else.
  const secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return cached;
}

export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>';

/**
 * Verify SMTP connectivity at boot so misconfiguration surfaces immediately
 * rather than at first audit-complete delivery. No-op when SMTP_HOST is unset
 * (JSON transport doesn't need verification).
 */
export async function verifyMailer(): Promise<void> {
  if (!process.env.SMTP_HOST) return;
  try {
    await getMailer().verify();
    logger.info(`SMTP connection verified: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587} (from: ${FROM_ADDRESS})`);
  } catch (e) {
    logger.error(`SMTP verification failed: ${(e as Error).message}. Audit-complete emails will fail until SMTP_* env vars are corrected.`);
  }
}
