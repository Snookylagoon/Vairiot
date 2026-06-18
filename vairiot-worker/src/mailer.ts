import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

let cached: Transporter | null = null;

export function getMailer(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  if (!host) {
    // Dev fallback: stream transport just logs the email instead of sending.
    logger.warn('SMTP_HOST not set — using JSON transport (emails logged, not sent).');
    cached = nodemailer.createTransport({ jsonTransport: true });
    return cached;
  }
  cached = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return cached;
}

export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>';
