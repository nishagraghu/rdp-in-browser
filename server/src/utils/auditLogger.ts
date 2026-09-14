import { prisma } from '../db/prisma';
import { AuditAction } from '../shared';

export async function createAuditLog(params: {
  userId?: string | null;
  userName?: string | null;
  action: AuditAction | string;
  details?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        userName: params.userName || null,
        action: String(params.action),
        details: params.details || null,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

