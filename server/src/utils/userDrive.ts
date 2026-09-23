import fs from 'fs';
import path from 'path';

export const DRIVES_ROOT = path.join(process.cwd(), 'drives');
const GUACD_UID = 1000;
const GUACD_GID = 1000;

export function ensureDrivesRoot(): void {
  if (!fs.existsSync(DRIVES_ROOT)) {
    fs.mkdirSync(DRIVES_ROOT, { recursive: true });
  }

  try {
    fs.chownSync(DRIVES_ROOT, GUACD_UID, GUACD_GID);
  } catch {
    // May fail on non-root hosts; subdirectories still get explicit ownership.
  }

  try {
    fs.chmodSync(DRIVES_ROOT, 0o775);
  } catch {
    // Best effort.
  }
}

export function ensureUserDriveDirectory(username: string): string {
  ensureDrivesRoot();

  const userDir = path.join(DRIVES_ROOT, username);
  const downloadDir = path.join(userDir, 'Download');

  fs.mkdirSync(downloadDir, { recursive: true });

  try {
    fs.chownSync(userDir, GUACD_UID, GUACD_GID);
    fs.chownSync(downloadDir, GUACD_UID, GUACD_GID);
    fs.chmodSync(userDir, 0o775);
    fs.chmodSync(downloadDir, 0o775);
  } catch (error) {
    console.error(`Failed to set drive directory ownership for ${username}:`, error);
  }

  return userDir;
}

export function getUserDrivePath(username: string): string {
  return ensureUserDriveDirectory(username);
}

const COMMON_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._\- ]*$/;

/** Folder name relative to the shared-drives root. Rejects absolute paths and "..". */
export function normalizeCommonDriveRelative(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('..') || trimmed.includes(':')) return null;

  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 8) return null;
  if (!parts.every((part) => COMMON_SEGMENT.test(part))) return null;

  const resolved = path.resolve(DRIVES_ROOT, ...parts);
  const root = path.resolve(DRIVES_ROOT);
  if (resolved === root || !resolved.startsWith(root + path.sep)) return null;

  return parts.join('/');
}

export function commonDriveAbsolute(relative: string): string {
  return path.resolve(DRIVES_ROOT, ...relative.split('/'));
}

export function commonDriveExists(relative: string): boolean {
  try {
    return fs.statSync(commonDriveAbsolute(relative)).isDirectory();
  } catch {
    return false;
  }
}

/** Path guacd sees. DRIVES_PATH is mounted at /drives. */
export function guacDrivePath(relative: string): string {
  return `/drives/${relative}`;
}
