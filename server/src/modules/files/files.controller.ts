import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AuthenticatedRequest } from '../../middleware/auth';
import { ensureUserDriveDirectory } from '../../utils/userDrive';

const GUACD_UID = 1000;
const GUACD_GID = 1000;

function chownForGuacd(filePath: string): void {
  try {
    fs.chownSync(filePath, GUACD_UID, GUACD_GID);
    fs.chmodSync(filePath, 0o664);
  } catch {
    // Best effort on non-root hosts.
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const authReq = req as AuthenticatedRequest;
    const username = authReq.user?.username;
    if (!username) {
      return cb(new Error('User not authenticated'), '');
    }
    cb(null, ensureUserDriveDirectory(username));
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  }
});

export async function uploadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  // Ensure guacd can see files dropped via the web UI into the shared drive.
  chownForGuacd(req.file.path);

  res.json({
    success: true,
    data: {
      filename: req.file.originalname,
      path: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }
  });
}

interface DriveEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

function listDriveEntries(rootDir: string, relativeDir = ''): DriveEntry[] {
  const absoluteDir = relativeDir ? path.join(rootDir, relativeDir) : rootDir;
  const entries: DriveEntry[] = [];

  let names: string[];
  try {
    names = fs.readdirSync(absoluteDir);
  } catch {
    return entries;
  }

  for (const name of names) {
    const relativePath = relativeDir ? path.posix.join(relativeDir.replace(/\\/g, '/'), name) : name;
    const absolutePath = path.join(absoluteDir, name);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(absolutePath);
    } catch {
      continue;
    }

    entries.push({
      path: relativePath,
      name,
      size: stat.isDirectory() ? 0 : stat.size,
      isDirectory: stat.isDirectory(),
      createdAt: stat.birthtime,
      modifiedAt: stat.mtime,
    });

    if (stat.isDirectory()) {
      entries.push(...listDriveEntries(rootDir, relativePath));
    }
  }

  return entries;
}

export async function listFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const userDir = ensureUserDriveDirectory(username);

  try {
    const entries = listDriveEntries(userDir);
    res.json({
      success: true,
      data: {
        root: userDir,
        username,
        entries,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read shared drive' });
  }
}

export async function downloadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const filename = req.params.filename;
  if (!filename) {
    res.status(400).json({ success: false, error: 'Filename is required' });
    return;
  }

  // Allow nested paths under the user drive, but never escape it.
  const userDir = ensureUserDriveDirectory(username);
  const safeRelative = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(userDir, safeRelative);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(userDir) + path.sep) && resolved !== path.resolve(userDir)) {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  res.download(resolved, path.basename(resolved));
}
