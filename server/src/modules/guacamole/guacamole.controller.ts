import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { decryptVMPassword } from '../../utils/encryption';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, AuditAction } from '../../shared';
import { config } from '../../config/env';

const KEY = Buffer.from(
  config.GUACAMOLE_ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'),
);

function makeGuacamoleToken(params: {
  hostname: string;
  port: number;
  username: string;
  password: string;
  domain?: string | null;
  width?: number;
  height?: number;
  supportAudioInConsole?: boolean;
  disableAudio?: boolean;
  enableAudioInput?: boolean;
  enablePrinting?: boolean;
  printerName?: string | null;
  enableDrive?: boolean;
  driveName?: string | null;
  disableFileDownload?: boolean;
  disableFileUpload?: boolean;
  drivePath?: string | null;
  createDrivePath?: boolean;
  staticChannelNames?: string | null;
}): string {
  const settings: Record<string, string> = {
    hostname: params.hostname,
    port: String(params.port || 3389),
    username: params.username || '',
    password: params.password || '',
    domain: params.domain || '',
    width: String(params.width || 1920),
    height: String(params.height || 1080),
    dpi: '96',
    'color-depth': '24',
    security: 'any',
    'ignore-cert': 'true',
    'enable-wallpaper': 'true',
    'enable-theming': 'true',
    'enable-font-smoothing': 'true',
    'enable-desktop-composition': 'true',
    'resize-method': 'display-update',
  };

  if (params.disableAudio) settings['disable-audio'] = 'true';
  if (params.enableAudioInput) settings['enable-audio-input'] = 'true';
  if (params.enablePrinting) {
    settings['enable-printing'] = 'true';
    if (params.printerName) settings['printer-name'] = params.printerName;
  }
  if (params.enableDrive) {
    settings['enable-drive'] = 'true';
    if (params.driveName) settings['drive-name'] = params.driveName;
    if (params.drivePath) settings['drive-path'] = params.drivePath;
    if (params.createDrivePath) settings['create-drive-path'] = 'true';
    if (params.disableFileDownload) settings['disable-download'] = 'true';
    if (params.disableFileUpload) settings['disable-upload'] = 'true';
  }
  if (params.staticChannelNames) {
    settings['static-channels'] = params.staticChannelNames;
  }

  const payload = {
    connection: {
      type: 'rdp',
      settings,
    },
  };

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const enc = cipher.update(JSON.stringify(payload), 'utf8', 'base64') + cipher.final('base64');
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), value: enc })).toString('base64');
}

export async function connectVmSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { width, height } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }

    const vm = await prisma.vM.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!vm) {
      res.status(404).json({ success: false, error: 'VM configuration not found' });
      return;
    }

    if (!vm.isActive) {
      res.status(403).json({ success: false, error: 'Target VM is currently disabled/inactive' });
      return;
    }

    // Enforce authorization server-side
    if (userRole !== UserRole.ADMIN) {
      const isAssigned = vm.assignments.some(a => a.userId === userId);
      if (!isAssigned) {
        await createAuditLog({
          userId,
          userName: req.user?.username,
          action: AuditAction.AUTH_FAILURE,
          details: `Unauthorized attempt to connect to VM ${vm.name} (${vm.id})`,
          ipAddress: req.ip,
        });
        res.status(403).json({ success: false, error: 'Access denied. You are not assigned to this remote desktop.' });
        return;
      }
    }

    const decryptedPassword = decryptVMPassword(vm.encryptedPassword);

    const token = makeGuacamoleToken({
      hostname: vm.hostname,
      port: vm.port,
      username: vm.username,
      password: decryptedPassword,
      domain: vm.domain,
      width: typeof width === 'number' ? width : 1920,
      height: typeof height === 'number' ? height : 1080,
      supportAudioInConsole: vm.supportAudioInConsole,
      disableAudio: vm.disableAudio,
      enableAudioInput: vm.enableAudioInput,
      enablePrinting: vm.enablePrinting,
      printerName: vm.printerName,
      enableDrive: vm.enableDrive,
      driveName: vm.driveName || 'Guacamole',
      disableFileDownload: vm.disableFileDownload,
      disableFileUpload: vm.disableFileUpload,
      drivePath: vm.enableDrive ? `/tmp/${userId}` : undefined,
      createDrivePath: vm.enableDrive ? true : undefined,
      staticChannelNames: vm.staticChannelNames,
    });

    await createAuditLog({
      userId,
      userName: req.user?.username,
      action: AuditAction.VM_CONNECT,
      details: `Established remote session to ${vm.name} (${vm.hostname}:${vm.port})`,
      ipAddress: req.ip,
    });

    const protocol = req.protocol === 'https' ? 'wss' : 'ws';
    const host = req.get('host') || `localhost:${config.PORT}`;
    const wsUrl = `${protocol}://${host}/ws`;

    res.json({
      success: true,
      data: {
        token,
        wsUrl,
        vm: {
          id: vm.id,
          name: vm.name,
          protocol: vm.protocol,
          hostname: vm.hostname,
        },
      },
    });
  } catch (error) {
    console.error('connectVmSession error:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate Guacamole connection session' });
  }
}

