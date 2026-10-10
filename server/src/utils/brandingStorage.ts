import fs from 'fs';
import path from 'path';

/** Stored under data/ so Docker's server-data volume persists branding. */
export const BRANDING_DIR = path.join(process.cwd(), 'data', 'uploads', 'branding');
export const UPLOADS_ROOT = path.join(process.cwd(), 'data', 'uploads');
export const BRANDING_PUBLIC_PREFIX = '/uploads/branding';

export function ensureBrandingDir(): string {
  if (!fs.existsSync(BRANDING_DIR)) {
    fs.mkdirSync(BRANDING_DIR, { recursive: true });
  }
  return BRANDING_DIR;
}

export function brandingPublicUrl(fileName: string, version?: string | number | Date): string {
  const base = `${BRANDING_PUBLIC_PREFIX}/${fileName}`;
  if (!version) return base;
  const v = version instanceof Date ? version.getTime() : version;
  return `${base}?v=${v}`;
}

export function deleteBrandingFile(fileName: string | null | undefined): void {
  if (!fileName) return;
  const filePath = path.join(BRANDING_DIR, fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best effort cleanup.
  }
}
