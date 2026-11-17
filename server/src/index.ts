import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env';

// Optimize network latency for real-time RDP keystrokes & mouse packets:
// Disable Nagle's algorithm (TCP_NODELAY) on all outbound TCP connections (including guacd:4822)
const originalNetConnect = net.connect;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(net as any).connect = function (...args: any[]) {
  const socket = originalNetConnect.apply(this, args as any);
  socket.setNoDelay(true);
  socket.once('connect', () => {
    socket.setNoDelay(true);
  });
  return socket;
};

interface GuacClientConnection {
  connectionId: number;
  connectionSettings?: { meta?: { sessionId?: string } };
  send(message: string): void;
  close(error?: Error): void;
  guacdClient?: { guacdConnection?: { setNoDelay(noDelay?: boolean): void } };
  webSocket?: { _socket?: { setNoDelay(noDelay?: boolean): void } };
}

interface GuacServer {
  on(event: 'open', handler: (connection: GuacClientConnection) => void): void;
  on(event: 'close', handler: (connection: GuacClientConnection, error?: Error) => void): void;
}

// guacamole-lite has no TypeScript types — import via require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GuacamoleLite = require('guacamole-lite') as new (
  wsOptions: unknown, guacdOptions: unknown, clientOptions: unknown
) => GuacServer;

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import vmsRoutes from './modules/vms/vms.routes';
import assignmentsRoutes from './modules/assignments/assignments.routes';
import guacamoleRoutes from './modules/guacamole/guacamole.routes';
import auditRoutes from './modules/audit/audit.routes';
import sessionsRoutes from './modules/sessions/sessions.routes';
import filesRoutes from './modules/files/files.routes';
import settingsRoutes from './modules/settings/settings.routes';
import { ensureDrivesRoot } from './utils/userDrive';
import { ensureBrandingStorageReady } from './modules/settings/settings.controller';
import * as sessionRegistry from './modules/sessions/sessionRegistry';

// Ensure data directory exists for SQLite
const dataDir = path.dirname(path.resolve(config.DATABASE_URL.replace('file:', '')));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

ensureDrivesRoot();
ensureBrandingStorageReady();

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// Serve customer branding uploads (public for login page)
app.use('/uploads', express.static(path.join(process.cwd(), 'data', 'uploads'), {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  },
}));

// API Routes — public settings (login logo) must be registered before any
// `/api` catch-all that applies JWT auth (assignments), or unauthenticated
// GET /api/settings/logo is rejected and the login page never sees uploads.
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/vms', vmsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api', assignmentsRoutes); // For /api/vms/:id/users & /api/users/:userId/vms
app.use('/api', guacamoleRoutes); // For /api/vms/:id/connect
app.use('/api/sessions', sessionsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/files', filesRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    guacd: `${config.GUACD_HOST}:${config.GUACD_PORT}`,
    timestamp: new Date().toISOString(),
  });
});

const httpServer = http.createServer(app);
httpServer.on('connection', (socket) => {
  socket.setNoDelay(true);
});

// GuacamoleLite WebSocket bridge
const guacServer = new GuacamoleLite(
  {
    server: httpServer,
    path: '/ws',
    // Disable per-message deflate compression to eliminate buffering delay on tiny keystroke frames
    perMessageDeflate: false,
  },
  { host: config.GUACD_HOST, port: config.GUACD_PORT },
  {
    crypt: { cypher: 'AES-256-CBC', key: config.GUACAMOLE_ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0') },
    // Use ERRORS (level 10). 'INFO' is invalid in guacamole-lite and causes NaN comparison
    // that triggers verbose console.log on every instruction/frame, blocking the Node event loop!
    log: { level: 'ERRORS' },
  },
);

function guacInstruction(opcode: string, args: string[]): string {
  return [opcode, ...args].map((part) => `${part.length}.${part}`).join(',') + ';';
}

// The token issued by /vms/:id/connect carries a top-level `meta` block that
// guacamole-lite preserves on the decrypted connectionSettings.
guacServer.on('open', (connection) => {
  // Ensure TCP_NODELAY is enabled on both sockets for zero keystroke buffering
  try {
    connection.guacdClient?.guacdConnection?.setNoDelay(true);
    connection.webSocket?._socket?.setNoDelay(true);
  } catch (err) {
    console.warn('[TCP_NODELAY] Failed to apply setNoDelay:', err);
  }

  const sessionId = connection.connectionSettings?.meta?.sessionId;
  sessionRegistry.bindDisconnect(sessionId, () => {
    try {
      connection.send(guacInstruction('error', [
        'You have been logged out by an administrator.',
        '523',
      ]));
    } catch {
      /* socket may already be gone */
    }
    setTimeout(() => {
      try {
        connection.close();
      } catch {}
    }, 50);
  });
});
guacServer.on('close', (connection) => {
  sessionRegistry.release(connection.connectionSettings?.meta?.sessionId);
});

import { autoSeedDatabase } from './db/seed';

httpServer.listen(config.PORT, async () => {
  await autoSeedDatabase();
  console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  console.log(`🔌 guacd connected to ${config.GUACD_HOST}:${config.GUACD_PORT}`);
});
