import dotenv from 'dotenv';
dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./data/app.db',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'rdp-access-token-secret-key-32chars',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'rdp-refresh-token-secret-key-32chars',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  VM_ENCRYPTION_KEY: process.env.VM_ENCRYPTION_KEY || 'rdp-vm-encryption-key-32bytes-secret!',
  GUACAMOLE_ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || process.env.VM_ENCRYPTION_KEY || 'rdp-in-browser-default-key-32by',
  GUACD_HOST: process.env.GUACD_HOST || 'localhost',
  GUACD_PORT: parseInt(process.env.GUACD_PORT || '4822', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
