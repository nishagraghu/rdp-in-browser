import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { AuditAction } from '../../shared';
import { createAuditLog } from '../../utils/auditLogger';
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

/** Force-close one session. The remote desktop disconnects immediately. */
export async function terminateSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const entry = sessionRegistry.terminate(req.params.sessionId);
  if (!entry) {
    res.status(404).json({ success: false, error: 'That session is no longer active.' });
    return;
  }

  await createAuditLog({
    userId: req.user?.userId,
    userName: req.user?.username,
    action: AuditAction.SESSION_TERMINATE,
    details: `Force-logged out ${entry.username} from ${entry.vmName} (session ${entry.sessionId})`,
    ipAddress: req.ip,
  });

  res.json({ success: true, data: toDto({ ...entry, status: 'active', connectedAt: entry.connectedAt }) });
}
