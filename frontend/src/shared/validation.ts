export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validateUsername(username: string): boolean {
  return typeof username === 'string' && username.trim().length >= 3;
}

export function validatePassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

export const DEFAULT_CONNECTION_TIMEOUT_SEC = 15;
export const MIN_CONNECTION_TIMEOUT_SEC = 5;
export const MAX_CONNECTION_TIMEOUT_SEC = 300;

/** Clamp RDP connection timeout (seconds). Invalid values fall back to the default. */
export function clampConnectionTimeout(value: unknown, fallback = DEFAULT_CONNECTION_TIMEOUT_SEC): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_CONNECTION_TIMEOUT_SEC, Math.max(MIN_CONNECTION_TIMEOUT_SEC, n));
}
