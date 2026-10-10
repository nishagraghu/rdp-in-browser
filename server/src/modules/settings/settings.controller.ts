import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../../db/prisma';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  UPLOADS_ROOT,
  brandingPublicUrl,
  deleteBrandingFile,
  ensureBrandingDir,
} from '../../utils/brandingStorage';
import { createAuditLog } from '../../utils/auditLogger';
import { encryptVMPassword } from '../../utils/encryption';
import {
  isSmtpConfigured,
  sendMail,
  SmtpEncryption,
  verifySmtpConnection,
} from '../../utils/email';
import { AuditAction, validateEmail } from '../../shared';

const SETTINGS_ID = 'default';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif']);
const SMTP_ENCRYPTION_OPTIONS = new Set<SmtpEncryption>(['none', 'starttls', 'ssl']);

function extensionForMime(mime: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    case 'image/gif':
      return '.gif';
    default:
      return '.png';
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ensureBrandingDir());
  },
  filename: (_req, file, cb) => {
    const ext = extensionForMime(file.mimetype, file.originalname);
    cb(null, `customer-logo${ext}`);
  },
});

export const logoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only image files are allowed (PNG, JPEG, WebP, GIF, SVG)'));
      return;
    }
    cb(null, true);
  },
});

async function getOrCreateSettings() {
  return prisma.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
}

function toLogoDto(settings: {
  logoFileName: string | null;
  logoOriginalName: string | null;
  logoMimeType: string | null;
  logoPath: string | null;
  updatedAt: Date;
  updatedById: string | null;
}) {
  const hasLogo = Boolean(settings.logoFileName && settings.logoPath);
  return {
    hasLogo,
    logoUrl: hasLogo && settings.logoFileName
      ? brandingPublicUrl(settings.logoFileName, settings.updatedAt)
      : null,
    originalName: settings.logoOriginalName,
    mimeType: settings.logoMimeType,
    updatedAt: settings.updatedAt.toISOString(),
    updatedById: settings.updatedById,
  };
}

/** Public — used by login page before authentication. */
export async function getLogoSettings(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: toLogoDto(settings) });
  } catch (err) {
    console.error('getLogoSettings error', err);
    res.status(500).json({ success: false, error: 'Failed to load logo settings' });
  }
}

export async function uploadCustomerLogo(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No image uploaded' });
      return;
    }

    const existing = await getOrCreateSettings();
    const previousFile = existing.logoFileName;
    const newFileName = req.file.filename;

    // Remove previous logo if it used a different filename/extension.
    if (previousFile && previousFile !== newFileName) {
      deleteBrandingFile(previousFile);
    }

    const relativePath = path.join('branding', newFileName).replace(/\\/g, '/');
    const settings = await prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        logoFileName: newFileName,
        logoOriginalName: req.file.originalname,
        logoMimeType: req.file.mimetype,
        logoPath: relativePath,
        updatedById: req.user?.userId ?? null,
      },
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.CUSTOMER_LOGO_UPDATED,
      details: `Uploaded customer logo: ${req.file.originalname}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: toLogoDto(settings) });
  } catch (err) {
    console.error('uploadCustomerLogo error', err);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // ignore
      }
    }
    const message = err instanceof Error ? err.message : 'Failed to upload logo';
    res.status(500).json({ success: false, error: message });
  }
}

export async function deleteCustomerLogo(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const existing = await getOrCreateSettings();
    deleteBrandingFile(existing.logoFileName);

    const settings = await prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        logoFileName: null,
        logoOriginalName: null,
        logoMimeType: null,
        logoPath: null,
        updatedById: req.user?.userId ?? null,
      },
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.CUSTOMER_LOGO_REMOVED,
      details: 'Removed customer logo',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: toLogoDto(settings) });
  } catch (err) {
    console.error('deleteCustomerLogo error', err);
    res.status(500).json({ success: false, error: 'Failed to remove logo' });
  }
}

export function ensureBrandingStorageReady(): void {
  ensureBrandingDir();
  if (!fs.existsSync(UPLOADS_ROOT)) {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  }
}

function toSmtpDto(settings: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
  smtpEncryption: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  updatedAt: Date;
}) {
  return {
    configured: isSmtpConfigured(settings),
    host: settings.smtpHost,
    port: settings.smtpPort,
    username: settings.smtpUsername,
    hasPassword: Boolean(settings.smtpPasswordEncrypted),
    encryption: (settings.smtpEncryption as SmtpEncryption | null) || null,
    fromEmail: settings.smtpFromEmail,
    fromName: settings.smtpFromName,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

/** Admin-only — SMTP password is never returned in plaintext. */
export async function getSmtpSettings(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: toSmtpDto(settings) });
  } catch (err) {
    console.error('getSmtpSettings error', err);
    res.status(500).json({ success: false, error: 'Failed to load SMTP settings' });
  }
}

export async function updateSmtpSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      host,
      port,
      username,
      password,
      encryption,
      fromEmail,
      fromName,
    } = req.body as {
      host?: string;
      port?: number | string;
      username?: string;
      password?: string;
      encryption?: string;
      fromEmail?: string;
      fromName?: string;
    };

    if (!host || !String(host).trim()) {
      res.status(400).json({ success: false, error: 'SMTP host is required' });
      return;
    }

    const portNum = typeof port === 'string' ? parseInt(port, 10) : Number(port);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      res.status(400).json({ success: false, error: 'SMTP port must be between 1 and 65535' });
      return;
    }

    if (!username || !String(username).trim()) {
      res.status(400).json({ success: false, error: 'SMTP username is required' });
      return;
    }

    const enc = (encryption || 'starttls') as SmtpEncryption;
    if (!SMTP_ENCRYPTION_OPTIONS.has(enc)) {
      res.status(400).json({ success: false, error: 'Encryption must be none, starttls, or ssl' });
      return;
    }

    if (!fromEmail || !validateEmail(fromEmail)) {
      res.status(400).json({ success: false, error: 'A valid From Email is required' });
      return;
    }

    const existing = await getOrCreateSettings();
    const passwordProvided = typeof password === 'string' && password.length > 0;

    if (!passwordProvided && !existing.smtpPasswordEncrypted) {
      res.status(400).json({ success: false, error: 'SMTP password is required' });
      return;
    }

    const updateData: Record<string, unknown> = {
      smtpHost: String(host).trim(),
      smtpPort: portNum,
      smtpUsername: String(username).trim(),
      smtpEncryption: enc,
      smtpFromEmail: String(fromEmail).toLowerCase().trim(),
      smtpFromName: fromName ? String(fromName).trim() : null,
      updatedById: req.user?.userId ?? null,
    };

    if (passwordProvided) {
      updateData.smtpPasswordEncrypted = encryptVMPassword(password);
    }

    const settings = await prisma.appSettings.update({
      where: { id: SETTINGS_ID },
      data: updateData,
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.SMTP_SETTINGS_UPDATED,
      details: `Updated SMTP settings for host ${settings.smtpHost}:${settings.smtpPort}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: toSmtpDto(settings) });
  } catch (err) {
    console.error('updateSmtpSettings error', err);
    res.status(500).json({ success: false, error: 'Failed to save SMTP settings' });
  }
}

export async function testSmtpSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      host,
      port,
      username,
      password,
      encryption,
      fromEmail,
      fromName,
      testRecipient,
    } = req.body as {
      host?: string;
      port?: number | string;
      username?: string;
      password?: string;
      encryption?: string;
      fromEmail?: string;
      fromName?: string;
      testRecipient?: string;
    };

    const existing = await getOrCreateSettings();
    const resolvedHost = (host && String(host).trim()) || existing.smtpHost;
    const portNum = port != null && port !== ''
      ? (typeof port === 'string' ? parseInt(port, 10) : Number(port))
      : existing.smtpPort;
    const resolvedUsername = (username && String(username).trim()) || existing.smtpUsername;
    const enc = ((encryption || existing.smtpEncryption || 'starttls') as SmtpEncryption);
    const resolvedFromEmail = (fromEmail && String(fromEmail).trim()) || existing.smtpFromEmail;
    const resolvedFromName = (fromName && String(fromName).trim()) || existing.smtpFromName || resolvedFromEmail;

    let resolvedPassword = '';
    if (typeof password === 'string' && password.length > 0) {
      resolvedPassword = password;
    } else if (existing.smtpPasswordEncrypted) {
      const { decryptVMPassword } = await import('../../utils/encryption');
      resolvedPassword = decryptVMPassword(existing.smtpPasswordEncrypted);
    }

    if (!resolvedHost || !portNum || !resolvedUsername || !resolvedPassword || !resolvedFromEmail) {
      res.status(400).json({
        success: false,
        error: 'Complete SMTP settings (including password) are required to send a test email',
      });
      return;
    }

    if (!SMTP_ENCRYPTION_OPTIONS.has(enc)) {
      res.status(400).json({ success: false, error: 'Invalid encryption setting' });
      return;
    }

    if (!validateEmail(resolvedFromEmail)) {
      res.status(400).json({ success: false, error: 'Invalid From Email' });
      return;
    }

    const recipientInput = testRecipient ? String(testRecipient).trim() : '';
    let toAddress = recipientInput;
    if (!toAddress) {
      const admin = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true },
      });
      toAddress = admin?.email || resolvedFromEmail;
    }

    if (!toAddress || !validateEmail(toAddress)) {
      res.status(400).json({ success: false, error: 'A valid test recipient email is required' });
      return;
    }

    const smtpConfig = {
      host: resolvedHost,
      port: portNum,
      username: resolvedUsername,
      password: resolvedPassword,
      encryption: enc,
      fromEmail: resolvedFromEmail.toLowerCase().trim(),
      fromName: resolvedFromName || resolvedFromEmail,
    };

    await verifySmtpConnection(smtpConfig);
    await sendMail({
      to: toAddress,
      subject: 'SMTP test — configuration successful',
      text: 'This is a test email from Admin Configuration. Your SMTP settings are working.',
      html: '<p>This is a test email from <strong>Admin Configuration</strong>.</p><p>Your SMTP settings are working.</p>',
      smtpOverride: smtpConfig,
    });

    res.json({
      success: true,
      message: `Test email sent to ${toAddress}`,
      data: { recipient: toAddress },
    });
  } catch (err) {
    console.error('testSmtpSettings error', err);
    const message = err instanceof Error ? err.message : 'SMTP test failed';
    res.status(400).json({ success: false, error: message });
  }
}
