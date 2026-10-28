import { Response } from 'express';
import { AuthenticatedRequest, revokeUserSessions } from '../../middleware/auth';
import { AuditAction } from '../../shared';
import { createAuditLog } from '../../utils/auditLogger';
import { prisma } from '../../db/prisma';
import * as sessionRegistry from './sessionRegistry';

function toDto(entry: sessionRegistry.SessionEntry) {
  return {
    sessionId: entry.sessionId,
    username: entry.username,
    vmId: entry.vmId,
    vmName: entry.vmName,
    status: entry.status,
    connectedAt: (entry.connectedAt || entry.createdAt).toISOString(),
  };
}

/** Every live remote-desktop session on this server. */
export async function listActiveSessions(_req: AuthenticatedRequest, res: Response): Promise<void> {
  const sessions = sessionRegistry.listAll(['active']).map(toDto);
  res.json({ success: true, data: { sessions } });
}

/** Force-close session and log user out of the entire application. */
export async function terminateSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const entry = sessionRegistry.terminate(req.params.sessionId);
  if (!entry) {
    res.status(404).json({ success: false, error: 'That session is no longer active.' });
    return;
  }

  // 1. Delete all refresh tokens so the user cannot acquire new access tokens
  await prisma.refreshToken.deleteMany({ where: { userId: entry.userId } });

  // 2. Invalidate currently active JWT tokens so subsequent API requests immediately fail with FORCE_LOGGED_OUT
  revokeUserSessions(entry.userId);

  // 3. Terminate any remaining active remote desktop sessions for this user
  sessionRegistry.terminateAllForUser(entry.userId);

  await createAuditLog({
    userId: req.user?.userId,
    userName: req.user?.username,
    action: AuditAction.SESSION_TERMINATE,
    details: `Force-logged out ${entry.username} from ${entry.vmName} and ended application session (session ${entry.sessionId})`,
    ipAddress: req.ip,
  });

  res.json({ success: true, data: toDto({ ...entry, status: 'active', connectedAt: entry.connectedAt }) });
}
