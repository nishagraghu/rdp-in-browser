import { Response } from 'express';
import net from 'net';
import { prisma } from '../../db/prisma';
import { encryptVMPassword } from '../../utils/encryption';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  UserRole,
  VmProtocol,
  AuditAction,
  clampConnectionTimeout,
  normalizeAccessTime,
  normalizeAccessDate,
} from '../../shared';
import { commonDriveExists, normalizeCommonDriveRelative } from '../../utils/userDrive';

function resolveCommonDriveInput(
  commonDrive: unknown,
  drivePath: unknown,
): { commonDrive: boolean; drivePath: string | null } | { error: string } {
  const enabled = Boolean(commonDrive);
  if (!enabled) {
    return {
      commonDrive: false,
      drivePath: drivePath ? String(drivePath).trim() : null,
    };
  }

  const relative = normalizeCommonDriveRelative(drivePath ? String(drivePath) : '');
  if (!relative) {
    return {
      error: 'Common folder path must be a folder name under the shared drives directory, such as "common".',
    };
  }
  if (!commonDriveExists(relative)) {
    return {
      error: `Folder "${relative}" does not exist under the shared drives directory. Create it on the host first. This app will not create it.`,
    };
  }

  return { commonDrive: true, drivePath: relative };
}

export async function getVms(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.userId;

    let vms;

    if (userRole === UserRole.ADMIN) {
      vms = await prisma.vM.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      });
    } else {
      // Normal USER: Return ONLY active VMs assigned to this specific user!
      const userAssignments = await prisma.vMUserAssignment.findMany({
        where: {
          userId,
          vm: { isActive: true },
        },
        include: {
          vm: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      vms = userAssignments.map(a => a.vm);
    }

    const sanitized = vms.map(vm => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { encryptedPassword, ...rest } = vm as Record<string, unknown>;
      return {
        ...rest,
        createdAt: (vm.createdAt as Date).toISOString(),
        updatedAt: (vm.updatedAt as Date).toISOString(),
        assignedUsers: (vm as { assignments?: Array<{ user: unknown }> }).assignments?.map(a => a.user) || [],
      };
    });

    res.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('getVms error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch VMs' });
  }
}

export async function getVmById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const vm = await prisma.vM.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!vm) {
      res.status(404).json({ success: false, error: 'VM not found' });
      return;
    }

    // Check authorization for non-admin
    if (userRole !== UserRole.ADMIN) {
      if (!vm.isActive) {
        res.status(403).json({ success: false, error: 'VM is currently inactive' });
        return;
      }
      const isAssigned = vm.assignments.some(a => a.userId === userId);
      if (!isAssigned) {
        res.status(403).json({ success: false, error: 'Access denied. You are not assigned to this VM.' });
        return;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { encryptedPassword, ...sanitized } = vm;

    res.json({
      success: true,
      data: {
        ...sanitized,
        createdAt: vm.createdAt.toISOString(),
        updatedAt: vm.updatedAt.toISOString(),
        assignedUsers: vm.assignments.map(a => a.user),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch VM details' });
  }
}

export async function createVm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { 
      name, description, protocol, hostname, port, username, password, domain, assignedUserIds,
      supportAudioInConsole, disableAudio, enableAudioInput, enablePrinting, printerName,
      enableDrive, driveName, disableFileDownload, disableFileUpload, drivePath, createDrivePath, commonDrive, staticChannelNames,
      normalizeClipboard, disableCopy, disablePaste,
      displayWidth, displayHeight, dpi, colorDepth, forceLossless, resizeMethod, readOnly,
      connectionTimeout,
      allowAccessAfter, doNotAllowAccessAfter, enableAccountAfter, disableAccountAfter,
      enableWallpaper, enableTheming, enableFontSmoothing, enableFullWindowDrag,
      enableDesktopComposition, enableMenuAnimations, disableBitmapCaching,
      disableOffscreenCaching, disableGlyphCaching, disableGfx,
    } = req.body;

    if (!name || !hostname || !username || !password) {
      res.status(400).json({ success: false, error: 'Name, hostname, username, and password are required' });
      return;
    }

    const vmProtocol = protocol && Object.values(VmProtocol).includes(protocol as VmProtocol) ? protocol : VmProtocol.RDP;
    const vmPort = port ? parseInt(String(port), 10) : 3389;

    const encryptedPassword = encryptVMPassword(String(password));

    const common = resolveCommonDriveInput(commonDrive, drivePath);
    if ('error' in common) {
      res.status(400).json({ success: false, error: common.error });
      return;
    }

    const parseOptionalInt = (value: unknown): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const newVm = await prisma.vM.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        protocol: vmProtocol,
        hostname: String(hostname).trim(),
        port: vmPort,
        connectionTimeout: clampConnectionTimeout(connectionTimeout),
        username: String(username).trim(),
        encryptedPassword,
        domain: domain ? String(domain).trim() : null,
        isActive: true,
        allowAccessAfter: normalizeAccessTime(allowAccessAfter),
        doNotAllowAccessAfter: normalizeAccessTime(doNotAllowAccessAfter),
        enableAccountAfter: normalizeAccessDate(enableAccountAfter),
        disableAccountAfter: normalizeAccessDate(disableAccountAfter),
        supportAudioInConsole: Boolean(supportAudioInConsole),
        disableAudio: Boolean(disableAudio),
        enableAudioInput: Boolean(enableAudioInput),
        enablePrinting: Boolean(enablePrinting),
        printerName: printerName ? String(printerName).trim() : null,
        enableDrive: Boolean(enableDrive),
        driveName: driveName ? String(driveName).trim() : null,
        disableFileDownload: Boolean(disableFileDownload),
        disableFileUpload: Boolean(disableFileUpload),
        drivePath: common.drivePath,
        createDrivePath: common.commonDrive ? false : Boolean(createDrivePath),
        commonDrive: common.commonDrive,
        staticChannelNames: staticChannelNames ? String(staticChannelNames).trim() : null,
        normalizeClipboard:
          normalizeClipboard === 'unix' || normalizeClipboard === 'windows'
            ? normalizeClipboard
            : 'preserve',
        disableCopy: Boolean(disableCopy),
        disablePaste: Boolean(disablePaste),
        displayWidth: parseOptionalInt(displayWidth),
        displayHeight: parseOptionalInt(displayHeight),
        dpi: parseOptionalInt(dpi),
        colorDepth: colorDepth ? parseInt(String(colorDepth), 10) : 32,
        forceLossless: Boolean(forceLossless),
        resizeMethod: resizeMethod === 'reconnect' ? 'reconnect' : 'display-update',
        readOnly: Boolean(readOnly),
        enableWallpaper: Boolean(enableWallpaper),
        enableTheming: Boolean(enableTheming),
        enableFontSmoothing: enableFontSmoothing !== undefined ? Boolean(enableFontSmoothing) : true,
        enableFullWindowDrag: Boolean(enableFullWindowDrag),
        enableDesktopComposition: Boolean(enableDesktopComposition),
        enableMenuAnimations: Boolean(enableMenuAnimations),
        disableBitmapCaching: Boolean(disableBitmapCaching),
        disableOffscreenCaching: Boolean(disableOffscreenCaching),
        disableGlyphCaching: Boolean(disableGlyphCaching),
        disableGfx: Boolean(disableGfx),
      },
    });

    if (Array.isArray(assignedUserIds) && assignedUserIds.length > 0) {
      await prisma.vMUserAssignment.createMany({
        data: assignedUserIds.map((userId: string) => ({
          vmId: newVm.id,
          userId,
        })),
      });
    }

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_CREATE,
      details: `Created VM ${newVm.name} (${newVm.protocol}://${newVm.hostname}:${newVm.port})`,
      ipAddress: req.ip,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { encryptedPassword: _ignore, ...sanitized } = newVm;

    res.status(201).json({
      success: true,
      data: {
        ...sanitized,
        createdAt: newVm.createdAt.toISOString(),
        updatedAt: newVm.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('createVm error:', error);
    res.status(500).json({ success: false, error: 'Failed to create VM configuration' });
  }
}

export async function updateVm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { 
      name, description, protocol, hostname, port, username, password, domain, isActive,
      supportAudioInConsole, disableAudio, enableAudioInput, enablePrinting, printerName,
      enableDrive, driveName, disableFileDownload, disableFileUpload, drivePath, createDrivePath, commonDrive, staticChannelNames,
      normalizeClipboard, disableCopy, disablePaste,
      displayWidth, displayHeight, dpi, colorDepth, forceLossless, resizeMethod, readOnly,
      connectionTimeout,
      allowAccessAfter, doNotAllowAccessAfter, enableAccountAfter, disableAccountAfter,
      enableWallpaper, enableTheming, enableFontSmoothing, enableFullWindowDrag,
      enableDesktopComposition, enableMenuAnimations, disableBitmapCaching,
      disableOffscreenCaching, disableGlyphCaching, disableGfx,
    } = req.body;

    const vm = await prisma.vM.findUnique({ where: { id } });
    if (!vm) {
      res.status(404).json({ success: false, error: 'VM not found' });
      return;
    }

    const parseOptionalInt = (value: unknown): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const updateData: Record<string, unknown> = {};

    if (name) updateData.name = String(name).trim();
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (protocol && Object.values(VmProtocol).includes(protocol as VmProtocol)) updateData.protocol = protocol;
    if (hostname) updateData.hostname = String(hostname).trim();
    if (port) updateData.port = parseInt(String(port), 10);
    if (connectionTimeout !== undefined) updateData.connectionTimeout = clampConnectionTimeout(connectionTimeout);
    if (username) updateData.username = String(username).trim();
    if (password) updateData.encryptedPassword = encryptVMPassword(String(password));
    if (domain !== undefined) updateData.domain = domain ? String(domain).trim() : null;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;

    if (allowAccessAfter !== undefined) updateData.allowAccessAfter = normalizeAccessTime(allowAccessAfter);
    if (doNotAllowAccessAfter !== undefined) updateData.doNotAllowAccessAfter = normalizeAccessTime(doNotAllowAccessAfter);
    if (enableAccountAfter !== undefined) updateData.enableAccountAfter = normalizeAccessDate(enableAccountAfter);
    if (disableAccountAfter !== undefined) updateData.disableAccountAfter = normalizeAccessDate(disableAccountAfter);
    
    if (supportAudioInConsole !== undefined) updateData.supportAudioInConsole = Boolean(supportAudioInConsole);
    if (disableAudio !== undefined) updateData.disableAudio = Boolean(disableAudio);
    if (enableAudioInput !== undefined) updateData.enableAudioInput = Boolean(enableAudioInput);
    
    if (enablePrinting !== undefined) updateData.enablePrinting = Boolean(enablePrinting);
    if (printerName !== undefined) updateData.printerName = printerName ? String(printerName).trim() : null;
    
    if (enableDrive !== undefined) updateData.enableDrive = Boolean(enableDrive);
    if (driveName !== undefined) updateData.driveName = driveName ? String(driveName).trim() : null;
    if (disableFileDownload !== undefined) updateData.disableFileDownload = Boolean(disableFileDownload);
    if (disableFileUpload !== undefined) updateData.disableFileUpload = Boolean(disableFileUpload);
    if (commonDrive !== undefined || drivePath !== undefined) {
      const nextCommon = commonDrive !== undefined ? Boolean(commonDrive) : vm.commonDrive;
      const nextPath = drivePath !== undefined ? drivePath : vm.drivePath;
      const common = resolveCommonDriveInput(nextCommon, nextPath);
      if ('error' in common) {
        res.status(400).json({ success: false, error: common.error });
        return;
      }
      updateData.commonDrive = common.commonDrive;
      updateData.drivePath = common.drivePath;
      if (common.commonDrive) updateData.createDrivePath = false;
    }
    if (createDrivePath !== undefined && !updateData.commonDrive && commonDrive !== true) {
      updateData.createDrivePath = Boolean(createDrivePath);
    }
    
    if (staticChannelNames !== undefined) updateData.staticChannelNames = staticChannelNames ? String(staticChannelNames).trim() : null;

    if (normalizeClipboard !== undefined) {
      updateData.normalizeClipboard =
        normalizeClipboard === 'unix' || normalizeClipboard === 'windows'
          ? normalizeClipboard
          : 'preserve';
    }
    if (disableCopy !== undefined) updateData.disableCopy = Boolean(disableCopy);
    if (disablePaste !== undefined) updateData.disablePaste = Boolean(disablePaste);

    if (displayWidth !== undefined) updateData.displayWidth = parseOptionalInt(displayWidth);
    if (displayHeight !== undefined) updateData.displayHeight = parseOptionalInt(displayHeight);
    if (dpi !== undefined) updateData.dpi = parseOptionalInt(dpi);
    if (colorDepth !== undefined) updateData.colorDepth = parseInt(String(colorDepth), 10) || 32;
    if (forceLossless !== undefined) updateData.forceLossless = Boolean(forceLossless);
    if (resizeMethod !== undefined) {
      updateData.resizeMethod = resizeMethod === 'reconnect' ? 'reconnect' : 'display-update';
    }
    if (readOnly !== undefined) updateData.readOnly = Boolean(readOnly);

    if (enableWallpaper !== undefined) updateData.enableWallpaper = Boolean(enableWallpaper);
    if (enableTheming !== undefined) updateData.enableTheming = Boolean(enableTheming);
    if (enableFontSmoothing !== undefined) updateData.enableFontSmoothing = Boolean(enableFontSmoothing);
    if (enableFullWindowDrag !== undefined) updateData.enableFullWindowDrag = Boolean(enableFullWindowDrag);
    if (enableDesktopComposition !== undefined) updateData.enableDesktopComposition = Boolean(enableDesktopComposition);
    if (enableMenuAnimations !== undefined) updateData.enableMenuAnimations = Boolean(enableMenuAnimations);
    if (disableBitmapCaching !== undefined) updateData.disableBitmapCaching = Boolean(disableBitmapCaching);
    if (disableOffscreenCaching !== undefined) updateData.disableOffscreenCaching = Boolean(disableOffscreenCaching);
    if (disableGlyphCaching !== undefined) updateData.disableGlyphCaching = Boolean(disableGlyphCaching);
    if (disableGfx !== undefined) updateData.disableGfx = Boolean(disableGfx);

    const updated = await prisma.vM.update({
      where: { id },
      data: updateData,
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_UPDATE,
      details: `Updated VM configuration ${updated.name}`,
      ipAddress: req.ip,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { encryptedPassword: _ignore, ...sanitized } = updated;

    res.json({
      success: true,
      data: {
        ...sanitized,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update VM configuration' });
  }
}

export async function deleteVm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const vm = await prisma.vM.findUnique({ where: { id } });
    if (!vm) {
      res.status(404).json({ success: false, error: 'VM not found' });
      return;
    }

    await prisma.vM.delete({ where: { id } });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_DELETE,
      details: `Deleted VM configuration ${vm.name}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `VM ${vm.name} deleted successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete VM' });
  }
}

export async function testVmConnection(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const vm = await prisma.vM.findUnique({ where: { id } });

    if (!vm) {
      res.status(404).json({ success: false, error: 'VM configuration not found' });
      return;
    }

    const host = vm.hostname;
    const port = vm.port;

    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(clampConnectionTimeout(vm.connectionTimeout) * 1000);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      res.json({
        success: true,
        message: `Successfully reached host ${host}:${port}`,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          error: `Connection timed out attempting to reach ${host}:${port}`,
        });
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: `Network error connecting to ${host}:${port}: ${err.message}`,
        });
      }
    });

    socket.connect(port, host);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to perform connection test' });
  }
}

