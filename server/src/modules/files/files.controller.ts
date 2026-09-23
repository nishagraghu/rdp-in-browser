import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../../db/prisma';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole } from '../../shared';
import {
  commonDriveAbsolute,
  commonDriveExists,
  ensureUserDriveDirectory,
  normalizeCommonDriveRelative,
} from '../../utils/userDrive';

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

interface DriveChoice {
  vmId: string;
  name: string;
  mode: 'common' | 'personal';
  label: string;
}

interface ResolvedDrive {
  mode: 'common' | 'personal' | 'choose';
  root: string | null;
  label: string;
  vmId?: string;
  exists: boolean;
  canDelete: boolean;
  choices: DriveChoice[];
  message?: string;
}

function vmIdFromRequest(req: AuthenticatedRequest): string | undefined {
  const fromQuery = typeof req.query.vmId === 'string' ? req.query.vmId.trim() : '';
  return fromQuery || undefined;
}

function resolveInside(root: string, relativePath: string): string | null {
  const safeRelative = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, safeRelative);
  const rootResolved = path.resolve(root);

  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    return null;
  }

  return resolved;
}

async function loadAccessibleDriveVms(req: AuthenticatedRequest) {
  const userId = req.user?.userId;
  const isAdmin = req.user?.role === UserRole.ADMIN;
  if (!isAdmin && !userId) return [];

  return prisma.vM.findMany({
    where: {
      isActive: true,
      enableDrive: true,
      ...(isAdmin ? {} : { assignments: { some: { userId: userId! } } }),
    },
    select: {
      id: true,
      name: true,
      commonDrive: true,
      drivePath: true,
    },
    orderBy: { name: 'asc' },
  });
}

function commonRelative(drivePath: string | null | undefined): string | null {
  return normalizeCommonDriveRelative(drivePath || '');
}

function personalDrive(username: string): ResolvedDrive {
  const root = ensureUserDriveDirectory(username);
  return {
    mode: 'personal',
    root,
    label: username,
    exists: true,
    canDelete: true,
    choices: [],
  };
}

function commonDrive(vm: { id: string; drivePath: string | null }): ResolvedDrive | { error: string } {
  const relative = commonRelative(vm.drivePath);
  if (!relative) {
    return { error: 'Common folder path is missing or invalid on this desktop.' };
  }

  const exists = commonDriveExists(relative);
  return {
    mode: 'common',
    root: commonDriveAbsolute(relative),
    label: relative,
    vmId: vm.id,
    exists,
    canDelete: true,
    choices: [],
    message: exists
      ? undefined
      : `Folder "${relative}" is not on the host yet. Create it under the shared drives directory. This app will not create it.`,
  };
}

async function resolveRequestDrive(req: AuthenticatedRequest): Promise<ResolvedDrive | { error: string; status: number }> {
  const username = req.user?.username;
  if (!username || !req.user?.userId) {
    return { error: 'Unauthenticated', status: 401 };
  }

  const requestedVmId = vmIdFromRequest(req);

  if (requestedVmId) {
    const vm = await prisma.vM.findUnique({
      where: { id: requestedVmId },
      include: { assignments: { select: { userId: true } } },
    });
    if (!vm || !vm.isActive) {
      return { error: 'Desktop not found', status: 404 };
    }
    if (req.user.role !== UserRole.ADMIN && !vm.assignments.some((a) => a.userId === req.user?.userId)) {
      return { error: 'You are not assigned to this desktop', status: 403 };
    }
    if (!vm.enableDrive) {
      return { error: 'Shared drive is turned off for this desktop', status: 400 };
    }
    if (vm.commonDrive) {
      const resolved = commonDrive(vm);
      if ('error' in resolved) return { error: resolved.error, status: 400 };
      return resolved;
    }
    return { ...personalDrive(username), vmId: vm.id };
  }

  const vms = await loadAccessibleDriveVms(req);
  if (vms.length === 0) {
    return personalDrive(username);
  }

  if (vms.length === 1) {
    const only = vms[0];
    if (only.commonDrive) {
      const resolved = commonDrive(only);
      if ('error' in resolved) return { error: resolved.error, status: 400 };
      return resolved;
    }
    return { ...personalDrive(username), vmId: only.id };
  }

  const commonVms = vms.filter((vm) => vm.commonDrive);
  const personalVms = vms.filter((vm) => !vm.commonDrive);
  const commonPaths = [...new Set(commonVms.map((vm) => commonRelative(vm.drivePath)).filter((p): p is string => !!p))];

  if (personalVms.length === 0 && commonPaths.length === 1) {
    const match = commonVms.find((vm) => commonRelative(vm.drivePath) === commonPaths[0]);
    if (match) {
      const resolved = commonDrive(match);
      if ('error' in resolved) return { error: resolved.error, status: 400 };
      return resolved;
    }
  }

  if (commonVms.length === 0) {
    return personalDrive(username);
  }

  const choices: DriveChoice[] = [];
  const seenPaths = new Set<string>();
  for (const vm of commonVms) {
    const relative = commonRelative(vm.drivePath);
    if (!relative || seenPaths.has(relative)) continue;
    seenPaths.add(relative);
    choices.push({ vmId: vm.id, name: vm.name, mode: 'common', label: relative });
  }
  if (personalVms.length > 0) {
    choices.push({
      vmId: personalVms[0].id,
      name: 'My folder',
      mode: 'personal',
      label: username,
    });
  }

  return {
    mode: 'choose',
    root: null,
    label: '',
    exists: false,
    canDelete: false,
    choices,
    message: 'Choose which shared folder to open.',
  };
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    resolveRequestDrive(req as AuthenticatedRequest)
      .then((drive) => {
        if ('error' in drive) {
          cb(new Error(drive.error), '');
          return;
        }
        if (drive.mode === 'choose' || !drive.root) {
          cb(new Error('Choose a shared folder before uploading'), '');
          return;
        }
        if (!drive.exists) {
          cb(new Error(drive.message || 'Shared folder does not exist'), '');
          return;
        }
        cb(null, drive.root);
      })
      .catch(() => cb(new Error('Failed to open shared drive'), ''));
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

export async function uploadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }

  chownForGuacd(req.file.path);

  res.json({
    success: true,
    data: {
      filename: req.file.originalname,
      path: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
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

function drivePayload(username: string, drive: ResolvedDrive, entries: DriveEntry[] = []) {
  return {
    username,
    mode: drive.mode,
    label: drive.label,
    vmId: drive.vmId,
    exists: drive.exists,
    missing: drive.mode === 'common' && !drive.exists,
    canDelete: drive.canDelete && drive.exists,
    message: drive.message,
    choices: drive.choices,
    entries,
  };
}

export async function listFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const drive = await resolveRequestDrive(req);
  if ('error' in drive) {
    res.status(drive.status).json({ success: false, error: drive.error });
    return;
  }

  if (!drive.root || !drive.exists) {
    res.json({ success: true, data: drivePayload(username, drive) });
    return;
  }

  try {
    const entries = listDriveEntries(drive.root);
    res.json({ success: true, data: drivePayload(username, drive, entries) });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to read shared drive' });
  }
}

export async function downloadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const rawPath =
    (typeof req.query.path === 'string' && req.query.path) ||
    req.params.filename ||
    '';

  if (!rawPath) {
    res.status(400).json({ success: false, error: 'File path is required' });
    return;
  }

  const drive = await resolveRequestDrive(req);
  if ('error' in drive) {
    res.status(drive.status).json({ success: false, error: drive.error });
    return;
  }
  if (!drive.root || !drive.exists) {
    res.status(404).json({ success: false, error: drive.message || 'Shared folder not found' });
    return;
  }

  const resolved = resolveInside(drive.root, rawPath);
  if (!resolved) {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  res.download(resolved, path.basename(resolved));
}

export async function deleteDriveEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const username = req.user?.username;
  if (!username) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return;
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!rawPath) {
    res.status(400).json({ success: false, error: 'File path is required' });
    return;
  }

  const drive = await resolveRequestDrive(req);
  if ('error' in drive) {
    res.status(drive.status).json({ success: false, error: drive.error });
    return;
  }
  if (!drive.canDelete || !drive.root || !drive.exists) {
    res.status(400).json({ success: false, error: drive.message || 'Nothing to remove' });
    return;
  }

  const resolved = resolveInside(drive.root, rawPath);
  const root = path.resolve(drive.root);
  if (!resolved || resolved === root) {
    res.status(400).json({ success: false, error: 'Invalid path' });
    return;
  }

  if (!fs.existsSync(resolved)) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  try {
    fs.rmSync(resolved, { recursive: true, force: false });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to remove file' });
  }
}
