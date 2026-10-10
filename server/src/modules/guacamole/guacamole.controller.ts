import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../db/prisma';
import { decryptVMPassword } from '../../utils/encryption';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, AuditAction, clampConnectionTimeout, getVmAccessBlockReason } from '../../shared';
import { config } from '../../config/env';
import { ensureUserDriveDirectory, guacDrivePath, normalizeCommonDriveRelative } from '../../utils/userDrive';
import * as sessionRegistry from '../sessions/sessionRegistry';

const KEY = Buffer.from(
  config.GUACAMOLE_ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'),
);

function setFlag(settings: Record<string, string>, key: string, enabled?: boolean) {
  if (enabled) settings[key] = 'true';
}

function makeGuacamoleToken(params: {
  hostname: string;
  port: number;
  username: string;
  password: string;
  domain?: string | null;
  width?: number;
  height?: number;
  dpi?: number | null;
  colorDepth?: number | null;
  forceLossless?: boolean;
  resizeMethod?: string | null;
  readOnly?: boolean;
  enableWallpaper?: boolean;
  enableTheming?: boolean;
  enableFontSmoothing?: boolean;
  enableFullWindowDrag?: boolean;
  enableDesktopComposition?: boolean;
  enableMenuAnimations?: boolean;
  disableBitmapCaching?: boolean;
  disableOffscreenCaching?: boolean;
  disableGlyphCaching?: boolean;
  disableGfx?: boolean;
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
  normalizeClipboard?: string | null;
  disableCopy?: boolean;
  disablePaste?: boolean;
  meta?: sessionRegistry.SessionMeta;
}): string {
  const settings: Record<string, string> = {
    hostname: params.hostname,
    port: String(params.port || 3389),
    username: params.username || '',
    password: params.password || '',
    domain: params.domain || '',
    width: String(params.width || 1920),
    height: String(params.height || 1080),
    dpi: String(params.dpi && params.dpi > 0 ? params.dpi : 96),
    'color-depth': String(params.colorDepth || 32),
    // Windows shows redirected drives as "{drive-name} on {client-name}".
    // Default guacd value is "Guacamole RDP" — replace with product brand.
    'client-name': 'Cloudgoo',
    security: 'any',
    'ignore-cert': 'true',
    'resize-method': params.resizeMethod === 'reconnect' ? 'reconnect' : 'display-update',
  };

  setFlag(settings, 'force-lossless', params.forceLossless);
  setFlag(settings, 'read-only', params.readOnly);
  setFlag(settings, 'enable-wallpaper', params.enableWallpaper);
  setFlag(settings, 'enable-theming', params.enableTheming);
  setFlag(settings, 'enable-font-smoothing', params.enableFontSmoothing);
  setFlag(settings, 'enable-full-window-drag', params.enableFullWindowDrag);
  setFlag(settings, 'enable-desktop-composition', params.enableDesktopComposition);
  setFlag(settings, 'enable-menu-animations', params.enableMenuAnimations);
  setFlag(settings, 'disable-bitmap-caching', params.disableBitmapCaching);
  setFlag(settings, 'disable-offscreen-caching', params.disableOffscreenCaching);
  setFlag(settings, 'disable-glyph-caching', params.disableGlyphCaching);
  setFlag(settings, 'disable-gfx', params.disableGfx);

  if (params.supportAudioInConsole) settings['console-audio'] = 'true';
  if (params.disableAudio) settings['disable-audio'] = 'true';
  if (params.enableAudioInput) settings['enable-audio-input'] = 'true';
  if (params.enablePrinting) {
    settings['enable-printing'] = 'true';
    // Appears in the remote session's printer list; print jobs arrive as PDF in the browser.
    settings['printer-name'] = params.printerName?.trim() || 'Cloudgoo PDF';
  }
  if (params.enableDrive) {
    settings['enable-drive'] = 'true';
    if (params.driveName) settings['drive-name'] = params.driveName;
    if (params.drivePath) settings['drive-path'] = params.drivePath;
    if (params.createDrivePath) settings['create-drive-path'] = 'true';
    // Shared-drive model: files land on the host folder via drive redirect.
    // Never stream a separate browser download — disable Guacamole download channel.
    settings['disable-download'] = 'true';
    if (params.disableFileUpload) settings['disable-upload'] = 'true';
  }
  if (params.staticChannelNames) {
    settings['static-channels'] = params.staticChannelNames;
  }

  if (params.normalizeClipboard === 'unix' || params.normalizeClipboard === 'windows') {
    settings['normalize-clipboard'] = params.normalizeClipboard;
  } else if (params.normalizeClipboard === 'preserve') {
    settings['normalize-clipboard'] = 'preserve';
  }
  setFlag(settings, 'disable-copy', params.disableCopy);
  setFlag(settings, 'disable-paste', params.disablePaste);

  // `meta` is read back server-side from the decrypted token on the guacamole-lite
  // open/close events; guacd never sees it (only `connection` is forwarded).
  const payload = {
    connection: {
      type: 'rdp',
      settings,
    },
    meta: params.meta,
  };

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  const enc = cipher.update(JSON.stringify(payload), 'utf8', 'base64') + cipher.final('base64');
  return Buffer.from(JSON.stringify({ iv: iv.toString('base64'), value: enc })).toString('base64');
}

function checkConnectionLimits(
  vm: { id: string; maxConnections: number; maxConnectionsPerUser: number },
  userId: string,
): string | null {
  if (vm.maxConnections > 0) {
    const inUse = sessionRegistry.countForVm(vm.id);
    if (inUse >= vm.maxConnections) {
      return `Connection limit reached (${inUse} of ${vm.maxConnections} in use). Try again later.`;
    }
  }
  if (vm.maxConnectionsPerUser > 0) {
    const mine = sessionRegistry.countForUserOnVm(vm.id, userId);
    if (mine >= vm.maxConnectionsPerUser) {
      return `You already have ${mine} session${mine === 1 ? '' : 's'} on this desktop (limit ${vm.maxConnectionsPerUser}). Close one before connecting again.`;
    }
  }
  return null;
}

type VmAccessResult =
  | { status: number; error: string }
  | { vm: { id: string } };

async function loadVmForUser(req: AuthenticatedRequest, vmId: string): Promise<VmAccessResult> {
  const vm = await prisma.vM.findUnique({
    where: { id: vmId },
    select: { id: true, isActive: true, assignments: { select: { userId: true } } },
  });
  if (!vm) return { status: 404, error: 'VM configuration not found' };
  if (req.user?.role !== UserRole.ADMIN && !vm.assignments.some((a) => a.userId === req.user?.userId)) {
    return { status: 403, error: 'Access denied. You are not assigned to this remote desktop.' };
  }
  return { vm: { id: vm.id } };
}

/** Active sessions on a VM, so the remote view can show who else is connected. */
export async function listVmSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }

    const result = await loadVmForUser(req, req.params.id);
    if ('error' in result) {
      res.status(result.status).json({ success: false, error: result.error });
      return;
    }

    const mySessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const sessions = sessionRegistry.listForVm(result.vm.id).map((s) => ({
      sessionId: s.sessionId,
      username: s.username,
      connectedAt: (s.connectedAt || s.createdAt).toISOString(),
      isMine: s.sessionId === mySessionId || (!mySessionId && s.userId === userId),
    }));

    res.json({ success: true, data: { sessions } });
  } catch (error) {
    console.error('listVmSessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
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

    const accessBlock = getVmAccessBlockReason({
      allowAccessAfter: vm.allowAccessAfter,
      doNotAllowAccessAfter: vm.doNotAllowAccessAfter,
      enableAccountAfter: vm.enableAccountAfter,
      disableAccountAfter: vm.disableAccountAfter,
    });
    if (accessBlock) {
      await createAuditLog({
        userId,
        userName: req.user?.username,
        action: AuditAction.AUTH_FAILURE,
        details: `Access schedule blocked connection to VM ${vm.name} (${vm.id}): ${accessBlock}`,
        ipAddress: req.ip,
      });
      res.status(403).json({ success: false, error: accessBlock });
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

    let sessionDrivePath: string | undefined;
    let sessionCreateDrivePath: boolean | undefined;

    if (vm.enableDrive && vm.commonDrive) {
      const relative = normalizeCommonDriveRelative(vm.drivePath || '');
      if (!relative) {
        res.status(400).json({
          success: false,
          error: 'Common folder path is missing or invalid. Set a folder name under the shared drives directory.',
        });
        return;
      }
      // Use the folder the admin named. Do not create a per-user folder.
      sessionDrivePath = guacDrivePath(relative);
      sessionCreateDrivePath = false;
    } else if (vm.enableDrive && req.user?.username) {
      ensureUserDriveDirectory(req.user.username);
      sessionDrivePath = guacDrivePath(req.user.username);
      sessionCreateDrivePath = true;
    }

    const sessionWidth =
      vm.displayWidth && vm.displayWidth > 0
        ? vm.displayWidth
        : typeof width === 'number'
          ? width
          : 1920;
    const sessionHeight =
      vm.displayHeight && vm.displayHeight > 0
        ? vm.displayHeight
        : typeof height === 'number'
          ? height
          : 1080;

    // Concurrent-session limits (0 = unlimited). Checked and reserved together so
    // two near-simultaneous connects cannot both slip under the cap.
    const username = req.user?.username || 'unknown';
    const limitError = checkConnectionLimits(vm, userId);
    if (limitError) {
      await createAuditLog({
        userId,
        userName: username,
        action: AuditAction.AUTH_FAILURE,
        details: `Connection to VM ${vm.name} (${vm.id}) refused: ${limitError}`,
        ipAddress: req.ip,
      });
      res.status(409).json({ success: false, error: limitError });
      return;
    }

    const sessionMeta: sessionRegistry.SessionMeta = {
      sessionId: crypto.randomUUID(),
      userId,
      username,
      vmId: vm.id,
      vmName: vm.name,
    };
    sessionRegistry.reserve(sessionMeta);

    const token = makeGuacamoleToken({
      meta: sessionMeta,
      hostname: vm.hostname,
      port: vm.port,
      username: vm.username,
      password: decryptedPassword,
      domain: vm.domain,
      width: sessionWidth,
      height: sessionHeight,
      dpi: vm.dpi,
      colorDepth: vm.colorDepth,
      forceLossless: vm.forceLossless,
      resizeMethod: vm.resizeMethod,
      readOnly: vm.readOnly,
      enableWallpaper: vm.enableWallpaper,
      enableTheming: vm.enableTheming,
      enableFontSmoothing: vm.enableFontSmoothing,
      enableFullWindowDrag: vm.enableFullWindowDrag,
      enableDesktopComposition: vm.enableDesktopComposition,
      enableMenuAnimations: vm.enableMenuAnimations,
      disableBitmapCaching: vm.disableBitmapCaching,
      disableOffscreenCaching: vm.disableOffscreenCaching,
      disableGlyphCaching: vm.disableGlyphCaching,
      disableGfx: vm.disableGfx,
      supportAudioInConsole: vm.supportAudioInConsole,
      disableAudio: vm.disableAudio,
      enableAudioInput: vm.enableAudioInput,
      // Remote Print → PDF → end-user's browser print dialog → their local printers.
      // Always on so Print in the RDP session reaches the user machine.
      enablePrinting: true,
      printerName: vm.printerName?.trim() || 'Cloudgoo PDF',
      enableDrive: vm.enableDrive,
      driveName: vm.driveName || 'Shared Drive',
      // Browser download channel is unused; host shared folder is the transfer path.
      disableFileDownload: true,
      disableFileUpload: vm.disableFileUpload,
      drivePath: sessionDrivePath,
      createDrivePath: sessionCreateDrivePath,
      staticChannelNames: vm.staticChannelNames,
      normalizeClipboard: vm.normalizeClipboard,
      disableCopy: vm.disableCopy,
      disablePaste: vm.disablePaste,
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
        sessionId: sessionMeta.sessionId,
        vm: {
          id: vm.id,
          name: vm.name,
          protocol: vm.protocol,
          hostname: vm.hostname,
          connectionTimeout: clampConnectionTimeout(vm.connectionTimeout),
        },
      },
    });
  } catch (error) {
    console.error('connectVmSession error:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate Guacamole connection session' });
  }
}
