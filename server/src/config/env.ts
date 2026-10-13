import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

function requireSecret(name: string, value: string | undefined, devFallback: string): string {
  if (value && value.trim().length > 0) {
    if (isProduction && value.trim().length < 32) {
      throw new Error(`${name} must be at least 32 characters in production`);
    }
    return value.trim();
  }

  if (isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return devFallback;
}

const vmEncryptionKey = requireSecret(
  'VM_ENCRYPTION_KEY',
  process.env.VM_ENCRYPTION_KEY,
  'rdp-vm-encryption-key-32bytes-secret!',
);

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || 'file:./data/app.db',
  JWT_ACCESS_SECRET: requireSecret(
    'JWT_ACCESS_SECRET',
    process.env.JWT_ACCESS_SECRET,
    'rdp-access-token-secret-key-32chars',
  ),
  JWT_REFRESH_SECRET: requireSecret(
    'JWT_REFRESH_SECRET',
    process.env.JWT_REFRESH_SECRET,
    'rdp-refresh-token-secret-key-32chars',
  ),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  VM_ENCRYPTION_KEY: vmEncryptionKey,
  GUACAMOLE_ENCRYPTION_KEY: process.env.ENCRYPTION_KEY?.trim() || vmEncryptionKey,
  GUACD_HOST: process.env.GUACD_HOST || 'localhost',
  GUACD_PORT: parseInt(process.env.GUACD_PORT || '4822', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  AUTO_SEED: process.env.AUTO_SEED === 'true',
};
