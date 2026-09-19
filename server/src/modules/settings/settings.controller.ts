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

const SETTINGS_ID = 'default';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/gif']);

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
      action: 'CUSTOMER_LOGO_UPDATED',
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
      action: 'CUSTOMER_LOGO_REMOVED',
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
