import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env';

// guacamole-lite has no TypeScript types — import via require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GuacamoleLite = require('guacamole-lite') as new (
  wsOptions: unknown, guacdOptions: unknown, clientOptions: unknown
) => void;

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import vmsRoutes from './modules/vms/vms.routes';
import assignmentsRoutes from './modules/assignments/assignments.routes';
import guacamoleRoutes from './modules/guacamole/guacamole.routes';
import auditRoutes from './modules/audit/audit.routes';
import filesRoutes from './modules/files/files.routes';
import settingsRoutes from './modules/settings/settings.routes';
import { ensureDrivesRoot } from './utils/userDrive';
import { ensureBrandingStorageReady } from './modules/settings/settings.controller';

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/vms', vmsRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api', assignmentsRoutes); // For /api/vms/:id/users & /api/users/:userId/vms
app.use('/api', guacamoleRoutes); // For /api/vms/:id/connect
app.use('/api/audit-logs', auditRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    guacd: `${config.GUACD_HOST}:${config.GUACD_PORT}`,
    timestamp: new Date().toISOString(),
  });
});

const httpServer = http.createServer(app);

// GuacamoleLite WebSocket bridge
new GuacamoleLite(
  { server: httpServer, path: '/ws' },
  { host: config.GUACD_HOST, port: config.GUACD_PORT },
  {
    crypt: { cypher: 'AES-256-CBC', key: config.GUACAMOLE_ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0') },
    log: { level: 'INFO' },
  },
);

import { autoSeedDatabase } from './db/seed';

httpServer.listen(config.PORT, async () => {
  await autoSeedDatabase();
  console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  console.log(`🔌 guacd connected to ${config.GUACD_HOST}:${config.GUACD_PORT}`);
});
