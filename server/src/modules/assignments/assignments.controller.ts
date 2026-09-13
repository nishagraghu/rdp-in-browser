import { Response } from 'express';
import { prisma } from '../../db/prisma';
import { createAuditLog } from '../../utils/auditLogger';
import { AuthenticatedRequest } from '../../middleware/auth';
import { AuditAction } from '../../../../shared/src/index';

export async function getVmUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: vmId } = req.params;
    const assignments = await prisma.vMUserAssignment.findMany({
      where: { vmId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: assignments.map(a => a.user),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch assigned users' });
  }
}

export async function assignUserToVm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: vmId, userId } = req.params;

    const vm = await prisma.vM.findUnique({ where: { id: vmId } });
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!vm || !user) {
      res.status(404).json({ success: false, error: 'VM or User not found' });
      return;
    }

    const assignment = await prisma.vMUserAssignment.upsert({
      where: {
        vmId_userId: { vmId, userId },
      },
      update: {},
      create: { vmId, userId },
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_ASSIGN,
      details: `Assigned user ${user.username} to VM ${vm.name}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `User ${user.username} assigned to VM ${vm.name}`,
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to assign user to VM' });
  }
}

export async function removeUserFromVm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: vmId, userId } = req.params;

    const vm = await prisma.vM.findUnique({ where: { id: vmId } });
    const user = await prisma.user.findUnique({ where: { id: userId } });

    await prisma.vMUserAssignment.deleteMany({
      where: { vmId, userId },
    });

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_UNASSIGN,
      details: `Unassigned user ${user?.username || userId} from VM ${vm?.name || vmId}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'User removed from VM successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to remove user assignment' });
  }
}

export async function bulkUpdateVmAssignments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id: vmId } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      res.status(400).json({ success: false, error: 'userIds must be an array of user IDs' });
      return;
    }

    const vm = await prisma.vM.findUnique({ where: { id: vmId } });
    if (!vm) {
      res.status(404).json({ success: false, error: 'VM not found' });
      return;
    }

    // Delete existing assignments for this VM
    await prisma.vMUserAssignment.deleteMany({ where: { vmId } });

    // Insert new assignments
    if (userIds.length > 0) {
      await prisma.vMUserAssignment.createMany({
        data: userIds.map((userId: string) => ({ vmId, userId })),
      });
    }

    await createAuditLog({
      userId: req.user?.userId,
      userName: req.user?.username,
      action: AuditAction.VM_ASSIGN,
      details: `Updated VM ${vm.name} assignments (${userIds.length} users assigned)`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `VM user assignments updated successfully`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update VM user assignments' });
  }
}

export async function getUserVms(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const assignments = await prisma.vMUserAssignment.findMany({
      where: { userId },
      include: {
        vm: true,
      },
    });

    const sanitizedVms = assignments.map(a => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { encryptedPassword, ...rest } = a.vm;
      return {
        ...rest,
        createdAt: a.vm.createdAt.toISOString(),
        updatedAt: a.vm.updatedAt.toISOString(),
      };
    });

    res.json({
      success: true,
      data: sanitizedVms,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user assigned VMs' });
  }
}
