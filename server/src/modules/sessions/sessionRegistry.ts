/**
 * In-memory registry of live remote-desktop sessions.
 *
 * A session is reserved when the API hands out a Guacamole token and becomes
 * active once guacamole-lite reports the WebSocket/guacd connection opened.
 * Pending reservations that never open are swept after PENDING_TTL_MS so a
 * failed browser connect does not hold a slot forever.
 */

export type SessionStatus = 'pending' | 'active';

export interface SessionMeta {
  sessionId: string;
  userId: string;
  username: string;
  vmId: string;
  vmName: string;
}

export interface SessionEntry extends SessionMeta {
  status: SessionStatus;
  createdAt: Date;
  connectedAt: Date | null;
}

const PENDING_TTL_MS = 60_000;

const sessions = new Map<string, SessionEntry>();
/** Closes the live Guacamole tunnel for a session, once the WebSocket has opened. */
const disconnectors = new Map<string, () => void>();
/** Session ids an admin already ended, so a tunnel that opens afterwards is closed immediately. */
const terminated = new Set<string>();

function sweepStalePending(now = Date.now()): void {
  for (const [id, entry] of sessions) {
    if (entry.status === 'pending' && now - entry.createdAt.getTime() > PENDING_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function reserve(meta: SessionMeta): SessionEntry {
  sweepStalePending();
  const entry: SessionEntry = {
    ...meta,
    status: 'pending',
    createdAt: new Date(),
    connectedAt: null,
  };
  sessions.set(meta.sessionId, entry);
  return entry;
}

export function markActive(sessionId: string | undefined): void {
  if (!sessionId) return;
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.status = 'active';
  entry.connectedAt = new Date();
}

/**
 * Remember how to drop this tunnel. If an admin already force-logged the
 * session out before the socket opened, the tunnel is closed immediately.
 */
export function bindDisconnect(sessionId: string | undefined, disconnect: () => void): void {
  if (!sessionId) return;
  if (terminated.has(sessionId)) {
    try {
      disconnect();
    } catch {
      /* tunnel already gone */
    }
    return;
  }
  disconnectors.set(sessionId, disconnect);
  markActive(sessionId);
}

export function release(sessionId: string | undefined): void {
  if (!sessionId) return;
  sessions.delete(sessionId);
  disconnectors.delete(sessionId);
  terminated.delete(sessionId);
}

export function listAll(statuses: SessionStatus[] = ['active']): SessionEntry[] {
  sweepStalePending();
  const out: SessionEntry[] = [];
  for (const entry of sessions.values()) {
    if (statuses.includes(entry.status)) out.push(entry);
  }
  return out.sort((a, b) => {
    const at = (a.connectedAt || a.createdAt).getTime();
    const bt = (b.connectedAt || b.createdAt).getTime();
    return bt - at;
  });
}

/** Drop a live session. Returns the entry that was removed, or null if it was already gone. */
export function terminate(sessionId: string): SessionEntry | null {
  sweepStalePending();
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  terminated.add(sessionId);
  const disconnect = disconnectors.get(sessionId);
  sessions.delete(sessionId);
  disconnectors.delete(sessionId);
  if (disconnect) {
    try {
      disconnect();
    } catch (err) {
      console.error('Failed to close remote session', sessionId, err);
    }
  }
  return entry;
}

export function listForVm(vmId: string, statuses: SessionStatus[] = ['active']): SessionEntry[] {
  sweepStalePending();
  const out: SessionEntry[] = [];
  for (const entry of sessions.values()) {
    if (entry.vmId === vmId && statuses.includes(entry.status)) {
      out.push(entry);
    }
  }
  return out;
}

/** Counts pending + active so two simultaneous connects cannot both slip under a limit. */
export function countForVm(vmId: string): number {
  return listForVm(vmId, ['pending', 'active']).length;
}

export function countForUserOnVm(vmId: string, userId: string): number {
  return listForVm(vmId, ['pending', 'active']).filter((s) => s.userId === userId).length;
}
