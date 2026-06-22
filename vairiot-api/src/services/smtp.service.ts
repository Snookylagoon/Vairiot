import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { encryptSecret, decryptSecret } from '../lib/crypto';

export interface SmtpView {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromAddress: string | null;
  active: boolean;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
  updatedAt: Date | null;
}

export interface SmtpUpsertInput {
  host: string;
  port: number;
  secure?: boolean;
  username?: string | null;
  password?: string | null;       // null = leave unchanged, '' = clear
  fromAddress: string;
  active?: boolean;
}

export async function getSmtpConfig(): Promise<SmtpView> {
  const row = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });
  if (!row) {
    return {
      configured: false, host: null, port: 587, secure: false,
      username: null, hasPassword: false, fromAddress: null,
      active: true, lastVerifiedAt: null, lastVerifyError: null, updatedAt: null,
    };
  }
  return {
    configured: true,
    host: row.host,
    port: row.port,
    secure: row.secure,
    username: row.username,
    hasPassword: !!row.passwordEnc,
    fromAddress: row.fromAddress,
    active: row.active,
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerifyError: row.lastVerifyError,
    updatedAt: row.updatedAt,
  };
}

export async function upsertSmtpConfig(input: SmtpUpsertInput, userId: string): Promise<SmtpView> {
  const existing = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });

  let passwordEnc: string | null | undefined;
  if (input.password === null || input.password === undefined) {
    passwordEnc = undefined; // leave as-is
  } else if (input.password === '') {
    passwordEnc = null;
  } else {
    passwordEnc = encryptSecret(input.password);
  }

  const data = {
    host: input.host,
    port: input.port,
    secure: input.secure ?? false,
    username: input.username ?? null,
    fromAddress: input.fromAddress,
    active: input.active ?? true,
    updatedByUserId: userId,
    ...(passwordEnc !== undefined ? { passwordEnc } : {}),
  };

  if (existing) {
    await prisma.smtpConfig.update({ where: { id: 'singleton' }, data });
  } else {
    await prisma.smtpConfig.create({
      data: { id: 'singleton', ...data, passwordEnc: passwordEnc ?? null },
    });
  }
  return getSmtpConfig();
}

async function buildTransport() {
  const row = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });
  if (!row || !row.active) throw new Error('SMTP is not configured or is disabled.');
  const auth = row.username && row.passwordEnc
    ? { user: row.username, pass: decryptSecret(row.passwordEnc) }
    : undefined;
  return {
    transport: nodemailer.createTransport({
      host: row.host, port: row.port, secure: row.secure, auth,
    }),
    fromAddress: row.fromAddress,
  };
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { transport } = await buildTransport();
    await transport.verify();
    await prisma.smtpConfig.update({
      where: { id: 'singleton' },
      data: { lastVerifiedAt: new Date(), lastVerifyError: null },
    });
    return { ok: true };
  } catch (e) {
    const error = (e as Error).message;
    await prisma.smtpConfig.update({
      where: { id: 'singleton' },
      data: { lastVerifyError: error },
    }).catch(() => {});
    return { ok: false, error };
  }
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const { transport, fromAddress } = await buildTransport();
    const info = await transport.sendMail({
      from: fromAddress,
      to,
      subject: 'Vairiot SMTP test',
      text: 'This is a test email from Vairiot. If you received this, SMTP is configured correctly.',
      html: '<p>This is a test email from <strong>Vairiot</strong>. If you received this, SMTP is configured correctly.</p>',
    });
    await prisma.smtpConfig.update({
      where: { id: 'singleton' },
      data: { lastVerifiedAt: new Date(), lastVerifyError: null },
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const error = (e as Error).message;
    await prisma.smtpConfig.update({
      where: { id: 'singleton' },
      data: { lastVerifyError: error },
    }).catch(() => {});
    return { ok: false, error };
  }
}
