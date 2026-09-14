import { Response } from 'express';
import net from 'net';
import { prisma } from '../../db/prisma';
import { encryptVMPassword } from '../../utils/encryption';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { UserRole, VmProtocol, AuditAction } from '../../shared';

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
      enableDrive, driveName, disableFileDownload, disableFileUpload, drivePath, createDrivePath, staticChannelNames
    } = req.body;

    if (!name || !hostname || !username || !password) {
      res.status(400).json({ success: false, error: 'Name, hostname, username, and password are required' });
      return;
    }

    const vmProtocol = protocol && Object.values(VmProtocol).includes(protocol as VmProtocol) ? protocol : VmProtocol.RDP;
    const vmPort = port ? parseInt(String(port), 10) : 3389;

    const encryptedPassword = encryptVMPassword(String(password));

    const newVm = await prisma.vM.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        protocol: vmProtocol,
        hostname: String(hostname).trim(),
        port: vmPort,
        username: String(username).trim(),
        encryptedPassword,
        domain: domain ? String(domain).trim() : null,
        isActive: true,
        supportAudioInConsole: Boolean(supportAudioInConsole),
        disableAudio: Boolean(disableAudio),
        enableAudioInput: Boolean(enableAudioInput),
        enablePrinting: Boolean(enablePrinting),
        printerName: printerName ? String(printerName).trim() : null,
        enableDrive: Boolean(enableDrive),
        driveName: driveName ? String(driveName).trim() : null,
        disableFileDownload: Boolean(disableFileDownload),
        disableFileUpload: Boolean(disableFileUpload),
        drivePath: drivePath ? String(drivePath).trim() : null,
        createDrivePath: Boolean(createDrivePath),
        staticChannelNames: staticChannelNames ? String(staticChannelNames).trim() : null,
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
      enableDrive, driveName, disableFileDownload, disableFileUpload, drivePath, createDrivePath, staticChannelNames
    } = req.body;

    const vm = await prisma.vM.findUnique({ where: { id } });
    if (!vm) {
      res.status(404).json({ success: false, error: 'VM not found' });
      return;
    }

    const updateData: Record<string, unknown> = {};

    if (name) updateData.name = String(name).trim();
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (protocol && Object.values(VmProtocol).includes(protocol as VmProtocol)) updateData.protocol = protocol;
    if (hostname) updateData.hostname = String(hostname).trim();
    if (port) updateData.port = parseInt(String(port), 10);
    if (username) updateData.username = String(username).trim();
    if (password) updateData.encryptedPassword = encryptVMPassword(String(password));
    if (domain !== undefined) updateData.domain = domain ? String(domain).trim() : null;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    
    if (supportAudioInConsole !== undefined) updateData.supportAudioInConsole = Boolean(supportAudioInConsole);
    if (disableAudio !== undefined) updateData.disableAudio = Boolean(disableAudio);
    if (enableAudioInput !== undefined) updateData.enableAudioInput = Boolean(enableAudioInput);
    
    if (enablePrinting !== undefined) updateData.enablePrinting = Boolean(enablePrinting);
    if (printerName !== undefined) updateData.printerName = printerName ? String(printerName).trim() : null;
    
    if (enableDrive !== undefined) updateData.enableDrive = Boolean(enableDrive);
    if (driveName !== undefined) updateData.driveName = driveName ? String(driveName).trim() : null;
    if (disableFileDownload !== undefined) updateData.disableFileDownload = Boolean(disableFileDownload);
    if (disableFileUpload !== undefined) updateData.disableFileUpload = Boolean(disableFileUpload);
    if (drivePath !== undefined) updateData.drivePath = drivePath ? String(drivePath).trim() : null;
    if (createDrivePath !== undefined) updateData.createDrivePath = Boolean(createDrivePath);
    
    if (staticChannelNames !== undefined) updateData.staticChannelNames = staticChannelNames ? String(staticChannelNames).trim() : null;

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

    socket.setTimeout(4000);

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

