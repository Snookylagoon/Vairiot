import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { encryptSecret, decryptSecret } from '../lib/crypto';

export type SmtpProvider = 'smtp' | 'resend';

export interface SmtpView {
  configured: boolean;
  provider: SmtpProvider;
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
  provider?: SmtpProvider;
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
      configured: false, provider: 'smtp', host: null, port: 587, secure: false,
      username: null, hasPassword: false, fromAddress: null,
      active: true, lastVerifiedAt: null, lastVerifyError: null, updatedAt: null,
    };
  }
  return {
    configured: true,
    provider: (row.provider as SmtpProvider) ?? 'smtp',
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
    provider: input.provider ?? 'smtp',
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

interface MailTransport {
  provider: SmtpProvider;
  fromAddress: string;
  nodemailer?: nodemailer.Transporter;
  resend?: Resend;
}

async function buildTransport(): Promise<MailTransport> {
  const row = await prisma.smtpConfig.findUnique({ where: { id: 'singleton' } });
  if (!row || !row.active) throw new Error('Email is not configured or is disabled.');

  if (row.provider === 'resend') {
    if (!row.passwordEnc) throw new Error('Resend API key is required.');
    return {
      provider: 'resend',
      fromAddress: row.fromAddress,
      resend: new Resend(decryptSecret(row.passwordEnc)),
    };
  }

  const auth = row.username && row.passwordEnc
    ? { user: row.username, pass: decryptSecret(row.passwordEnc) }
    : undefined;
  return {
    provider: 'smtp',
    fromAddress: row.fromAddress,
    nodemailer: nodemailer.createTransport({
      host: row.host, port: row.port, secure: row.secure, auth,
    }),
  };
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const t = await buildTransport();
    if (t.provider === 'resend') {
      const { data, error } = await t.resend!.domains.list();
      if (error) throw new Error(error.message);
      await prisma.smtpConfig.update({
        where: { id: 'singleton' },
        data: { lastVerifiedAt: new Date(), lastVerifyError: null },
      });
      return { ok: true };
    }
    await t.nodemailer!.verify();
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

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email using the configured SMTP/Resend transport.
 * Throws if email is not configured — callers should catch and continue if
 * the mail is non-critical (e.g. an invite email during tenant creation).
 */
export async function sendMail(input: SendMailInput): Promise<{ messageId?: string }> {
  const t = await buildTransport();
  if (t.provider === 'resend') {
    const { data, error } = await t.resend!.emails.send({
      from: t.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
  const info = await t.nodemailer!.sendMail({
    from: t.fromAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? input.text,
  });
  return { messageId: info.messageId };
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const t = await buildTransport();

    if (t.provider === 'resend') {
      const { data, error } = await t.resend!.emails.send({
        from: t.fromAddress,
        to,
        subject: 'Vairiot email test',
        text: 'This is a test email from Vairiot. If you received this, email delivery is configured correctly.',
        html: '<p>This is a test email from <strong>Vairiot</strong>. If you received this, email delivery is configured correctly.</p>',
      });
      if (error) throw new Error(error.message);
      await prisma.smtpConfig.update({
        where: { id: 'singleton' },
        data: { lastVerifiedAt: new Date(), lastVerifyError: null },
      });
      return { ok: true, messageId: data?.id };
    }

    const info = await t.nodemailer!.sendMail({
      from: t.fromAddress,
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
