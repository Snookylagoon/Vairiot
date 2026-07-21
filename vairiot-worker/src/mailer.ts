import { PrismaClient } from '@prisma/client';
import nodemailer, { Transporter, SendMailOptions, SentMessageInfo } from 'nodemailer';
import { Resend } from 'resend';

import { decryptSecret } from './crypto';
import { logger } from './logger';

const prisma = new PrismaClient();

interface TransportSpec {
  provider: 'smtp' | 'resend';
  fromAddress: string;
  source: 'db' | 'env' | 'json';
  nodemailer?: Transporter;
  resend?: Resend;
}

let cached: TransportSpec | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

async function buildFromDb(): Promise<TransportSpec | null> {
  try {
    const row = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });
    if (!row || !row.active) return null;

    if (row.provider === 'resend') {
      if (!row.passwordEnc) return null;
      return {
        provider: 'resend',
        fromAddress: row.fromAddress,
        source: 'db',
        resend: new Resend(decryptSecret(row.passwordEnc)),
      };
    }

    const auth = row.username && row.passwordEnc
      ? { user: row.username, pass: decryptSecret(row.passwordEnc) }
      : undefined;
    return {
      provider: 'smtp',
      nodemailer: nodemailer.createTransport({
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
  // Compose passes unset vars as "" (not undefined), so trim + falsy-coalesce.
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  return {
    provider: 'smtp',
    nodemailer: nodemailer.createTransport({
      host, port, secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    }),
    fromAddress: process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>',
    source: 'env',
  };
}

function buildJson(): TransportSpec {
  return {
    provider: 'smtp',
    nodemailer: nodemailer.createTransport({ jsonTransport: true }),
    fromAddress: 'Vairiot <no-reply@vairiot.local>',
    source: 'json',
  };
}

async function resolve(): Promise<TransportSpec> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) return cached;
  const spec = (await buildFromDb()) ?? buildFromEnv() ?? buildJson();
  if (!cached || cached.source !== spec.source) {
    logger.info(`Mail transport source: ${spec.source} (provider: ${spec.provider})`);
  }
  cached = spec;
  cachedAt = now;
  return spec;
}

export async function getMailer(): Promise<Transporter> {
  const spec = await resolve();
  if (spec.provider === 'resend') {
    return createResendTransport(spec.resend!, spec.fromAddress);
  }
  return spec.nodemailer!;
}

export async function getFromAddress(): Promise<string> {
  return (await resolve()).fromAddress;
}

/**
 * Send an email through the resolved transport. When no real mail server is
 * configured (source 'json' — the logging-only fallback) also log the full
 * rendered message, so its contents — invite links, digest bodies — are
 * actually visible instead of silently discarded. The startup log promises
 * "emails will be logged"; this is what makes that true.
 */
export async function sendMail(opts: SendMailOptions): Promise<SentMessageInfo> {
  const spec = await resolve();
  const transporter = spec.provider === 'resend'
    ? createResendTransport(spec.resend!, spec.fromAddress)
    : spec.nodemailer!;
  const info = await transporter.sendMail(opts);
  if (spec.source === 'json') {
    const rendered = (info as { message?: unknown }).message;
    const body = Buffer.isBuffer(rendered) ? rendered.toString('utf8')
      : typeof rendered === 'string' ? rendered
      : JSON.stringify(info);
    logger.info(`[mail-preview] no SMTP configured — message logged instead of sent:\n${body}`);
  }
  return info;
}

function createResendTransport(resend: Resend, defaultFrom: string): Transporter {
  return nodemailer.createTransport({
    name: 'resend',
    version: '1.0.0',
    send: async (mail: any, callback: any) => {
      try {
        const msg = mail.message.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of msg) chunks.push(chunk as Buffer);
        Buffer.concat(chunks); // drain the stream

        const envelope = mail.message.getEnvelope();
        const { data, error } = await resend.emails.send({
          from: (mail.data.from as string) ?? defaultFrom,
          to: Array.isArray(envelope.to) ? envelope.to : [envelope.to],
          subject: mail.data.subject ?? '',
          text: typeof mail.data.text === 'string' ? mail.data.text : undefined,
          html: typeof mail.data.html === 'string' ? mail.data.html : undefined,
          attachments: mail.data.attachments
            ? (mail.data.attachments as any[]).map(a => ({
                filename: a.filename,
                content: a.content,
                content_type: a.contentType,
              }))
            : undefined,
        });
        if (error) {
          callback(new Error(error.message));
        } else {
          callback(null, { messageId: data?.id, envelope, accepted: envelope.to, rejected: [] } as any);
        }
      } catch (e) {
        callback(e as Error);
      }
    },
  } as any);
}

export async function verifyMailer(): Promise<void> {
  const spec = await resolve();
  if (spec.source === 'json') {
    logger.warn('No email configured — emails will be logged via JSON transport.');
    return;
  }
  try {
    if (spec.provider === 'resend') {
      const { error } = await spec.resend!.domains.list();
      if (error) throw new Error(error.message);
      logger.info(`Resend connection verified (source=${spec.source}, from=${spec.fromAddress})`);
    } else {
      await spec.nodemailer!.verify();
      logger.info(`SMTP connection verified (source=${spec.source}, from=${spec.fromAddress})`);
    }
  } catch (e) {
    logger.error(`Mail verification failed (source=${spec.source}): ${(e as Error).message}`);
  }
}

export const FROM_ADDRESS = process.env.SMTP_FROM ?? 'Vairiot <no-reply@vairiot.local>';
