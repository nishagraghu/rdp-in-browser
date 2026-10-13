import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma';
import { decryptVMPassword } from './encryption';

export type SmtpEncryption = 'none' | 'starttls' | 'ssl';

export interface SmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  fromEmail: string;
  fromName: string;
}

export interface StoredSmtpSettings {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
  smtpEncryption: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
}

export function isSmtpConfigured(settings: StoredSmtpSettings): boolean {
  return Boolean(
    settings.smtpHost &&
      settings.smtpPort &&
      settings.smtpUsername &&
      settings.smtpPasswordEncrypted &&
      settings.smtpFromEmail,
  );
}

function buildTransportOptions(config: SmtpConfigInput) {
  const secure = config.encryption === 'ssl';
  return {
    host: config.host,
    port: config.port,
    secure,
    requireTLS: config.encryption === 'starttls',
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: {
      // Allow common self-signed / corporate SMTP relays
      rejectUnauthorized: false,
    },
  };
}

export async function loadSmtpConfig(): Promise<SmtpConfigInput | null> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'default' } });
  if (!settings || !isSmtpConfigured(settings)) {
    return null;
  }

  let password = '';
  try {
    password = decryptVMPassword(settings.smtpPasswordEncrypted!);
  } catch (err) {
    console.error('Failed to decrypt SMTP password', err);
    return null;
  }

  return {
    host: settings.smtpHost!,
    port: settings.smtpPort!,
    username: settings.smtpUsername!,
    password,
    encryption: (settings.smtpEncryption as SmtpEncryption) || 'starttls',
    fromEmail: settings.smtpFromEmail!,
    fromName: settings.smtpFromName || settings.smtpFromEmail!,
  };
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  smtpOverride?: SmtpConfigInput;
}): Promise<void> {
  const smtp = options.smtpOverride || (await loadSmtpConfig());
  if (!smtp) {
    throw new Error('SMTP is not configured. Set it up under Admin Configuration.');
  }

  const transporter = nodemailer.createTransport(buildTransportOptions(smtp));
  const from = smtp.fromName
    ? `"${smtp.fromName.replace(/"/g, '')}" <${smtp.fromEmail}>`
    : smtp.fromEmail;

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  userName?: string,
): Promise<void> {
  const greeting = userName ? `Hi ${userName},` : 'Hello,';
  const subject = 'Your login verification code';
  const text = `${greeting}\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not attempt to log in, you can ignore this email.\n`;
  const html = `
    <p>${greeting}</p>
    <p>Your verification code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>This code expires in <strong>10 minutes</strong>.</p>
    <p>If you did not attempt to log in, you can ignore this email.</p>
  `;
  await sendMail({ to, subject, text, html });
}

export async function verifySmtpConnection(config: SmtpConfigInput): Promise<void> {
  const transporter = nodemailer.createTransport(buildTransportOptions(config));
  await transporter.verify();
}
