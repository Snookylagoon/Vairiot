import nodemailer, { Transporter } from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
import { decryptSecret } from './crypto';

const prisma = new PrismaClient();

interface TransportSpec {
  transporter: Transporter;
  fromAddress: string;
  source: 'db' | 'env' | 'json';
}

let cached: TransportSpec | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000; // refetch DB config at most every minute

async function buildFromDb(): Promise<TransportSpec | null> {
  try {
    const row = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });
    if (!row || !row.active) return null;
    const auth = row.username && row.passwordEnc
      ? { user: row.username, pass: decryptSecret(row.passwordEnc) }
      : undefined;
    return {
      transporter: nodemailer.createTransport({
        host: row.host, port: row.port, secure: row.secure, auth,
      }),
      fromAddress: row.fromAddress,
      source: 'db',
    };
  } catch (e) {
    logger.warn(`SMTP DB config unavailable: ${(e as Error).message}`);
    return null;
  }
}

function buildFromEnv(): TransportSpec | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  return {
    transporter: nodemailer.createTransport({
      host, port, secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    }),
    fromAddress: process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>',
    source: 'env',
  };
}

function buildJson(): TransportSpec {
  return {
    transporter: nodemailer.createTransport({ jsonTransport: true }),
    fromAddress: 'Vairiot <no-reply@vairiot.local>',
    source: 'json',
  };
}

async function resolve(): Promise<TransportSpec> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  const spec = (await buildFromDb()) ?? buildFromEnv() ?? buildJson();
  if (!cached || cached.source !== spec.source) {
    logger.info(`SMTP transport source: ${spec.source}`);
  }
  cached = spec;
  cachedAt = now;
  return spec;
}

export async function getMailer(): Promise<Transporter> {
  return (await resolve()).transporter;
}

export async function getFromAddress(): Promise<string> {
  return (await resolve()).fromAddress;
}

/**
 * Verify connectivity at boot. Tries DB first, then env. JSON transport is skipped.
 */
export async function verifyMailer(): Promise<void> {
  const spec = await resolve();
  if (spec.source === 'json') {
    logger.warn('No SMTP configured — emails will be logged via JSON transport.');
    return;
  }
  try {
    await spec.transporter.verify();
    logger.info(`SMTP connection verified (source=${spec.source}, from=${spec.fromAddress})`);
  } catch (e) {
    logger.error(`SMTP verification failed (source=${spec.source}): ${(e as Error).message}`);
  }
}

export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>';
