import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AuthenticatedRequest } from '../../middleware/auth';

const UPLOADS_DIR = path.join(process.cwd(), 'drives');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.chmodSync(UPLOADS_DIR, 0o777);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const authReq = req as AuthenticatedRequest;
    const username = authReq.user?.username;
    if (!username) {
      return cb(new Error('User not authenticated'), '');
    }
    const userDir = path.join(UPLOADS_DIR, username);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
      fs.chownSync(userDir, 1000, 1000);
      const downloadDir = path.join(userDir, 'Download');
      fs.mkdirSync(downloadDir, { recursive: true });
      fs.chownSync(downloadDir, 1000, 1000);
    }
    cb(null, userDir);
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

  res.json({
    success: true,
    data: {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }
  });
}

export async function listFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const userDir = path.join(UPLOADS_DIR, username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
    fs.chownSync(userDir, 1000, 1000);
    const downloadDir = path.join(userDir, 'Download');
    fs.mkdirSync(downloadDir, { recursive: true });
    fs.chownSync(downloadDir, 1000, 1000);
  }

  try {
    const files = fs.readdirSync(userDir);
    const fileStats = files.map(filename => {
      const stat = fs.statSync(path.join(userDir, filename));
      return {
        filename,
        size: stat.size,
        createdAt: stat.birthtime,
      };
    });
    res.json({ success: true, data: fileStats });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read files' });
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

  // Prevent directory traversal attacks
  const safeFilename = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, username, safeFilename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  res.download(filePath, safeFilename);
}
