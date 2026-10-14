import validator from 'validator';

export function validateEmail(email: string): boolean {
  return typeof email === 'string' && validator.isEmail(email.trim());
}

export function validateUsername(username: string): boolean {
  return typeof username === 'string' && validator.isLength(username.trim(), { min: 3 });
}

export function validatePassword(password: string): boolean {
  return typeof password === 'string' && validator.isLength(password, { min: 6 });
}

export const DEFAULT_CONNECTION_TIMEOUT_SEC = 15;
export const MIN_CONNECTION_TIMEOUT_SEC = 5;
export const MAX_CONNECTION_TIMEOUT_SEC = 300;

/** Clamp RDP connection timeout (seconds). Invalid values fall back to the default. */
export function clampConnectionTimeout(value: unknown, fallback = DEFAULT_CONNECTION_TIMEOUT_SEC): number {
  const raw = String(value ?? '').trim();
  if (!validator.isInt(raw, { min: MIN_CONNECTION_TIMEOUT_SEC, max: MAX_CONNECTION_TIMEOUT_SEC })) {
    return fallback;
  }
  return parseInt(raw, 10);
}

export const MAX_CONNECTION_LIMIT = 500;

/** Clamp a concurrent-connection limit. 0 means unlimited; invalid values fall back to 0. */
export function clampConnectionLimit(value: unknown, fallback = 0): number {
  const raw = String(value ?? '').trim();
  if (!validator.isInt(raw, { min: 0, max: MAX_CONNECTION_LIMIT })) {
    return fallback;
  }
  return parseInt(raw, 10);
}

/** Normalize optional "HH:mm" time; empty/invalid → null. */
export function normalizeAccessTime(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (validator.isEmpty(trimmed)) return null;

  if (validator.isTime(trimmed, { hourFormat: 'hour24', mode: 'default' })) {
    return trimmed;
  }
  // HTML time inputs may include seconds (HH:mm:ss)
  if (validator.isTime(trimmed, { hourFormat: 'hour24', mode: 'withSeconds' })) {
    return trimmed.slice(0, 5);
  }
  return null;
}

/** Normalize optional "YYYY-MM-DD" date; empty/invalid → null. */
export function normalizeAccessDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (validator.isEmpty(trimmed)) return null;
  if (!validator.isDate(trimmed, { format: 'YYYY-MM-DD', strictMode: true })) return null;
  return trimmed;
}

/** Normalize optional IANA timezone string; empty/invalid → null. */
export function normalizeTimezone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface VmAccessSchedule {
  allowAccessAfter?: string | null;
  doNotAllowAccessAfter?: string | null;
  enableAccountAfter?: string | null;
  disableAccountAfter?: string | null;
  timezone?: string | null;
}

/**
 * Returns an error message if the VM access schedule blocks the current moment; otherwise null.
 * Matches Guacamole semantics for access_window_start/end and valid_from/until.
 */
export function getVmAccessBlockReason(
  schedule: VmAccessSchedule,
  now: Date = new Date(),
): string | null {
  const enableAfter = normalizeAccessDate(schedule.enableAccountAfter);
  const disableAfter = normalizeAccessDate(schedule.disableAccountAfter);
  const allowAfter = normalizeAccessTime(schedule.allowAccessAfter);
  const denyAfter = normalizeAccessTime(schedule.doNotAllowAccessAfter);

  if (!enableAfter && !disableAfter && !allowAfter && !denyAfter) {
    return null;
  }

  const timezone = normalizeTimezone(schedule.timezone) || DEFAULT_TIMEZONE;

  let yyyy: number;
  let mm: string;
  let dd: string;
  let currentMins: number;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    yyyy = parseInt(getPart('year'), 10);
    mm = getPart('month').padStart(2, '0');
    dd = getPart('day').padStart(2, '0');
    let hour = parseInt(getPart('hour'), 10);
    if (hour === 24) hour = 0;
    const min = parseInt(getPart('minute'), 10);
    currentMins = hour * 60 + min;
  } catch {
    yyyy = now.getFullYear();
    mm = String(now.getMonth() + 1).padStart(2, '0');
    dd = String(now.getDate()).padStart(2, '0');
    currentMins = now.getHours() * 60 + now.getMinutes();
  }

  const today = `${yyyy}-${mm}-${dd}`;

  if (enableAfter && today < enableAfter) {
    return `Access to this VM is not enabled until ${enableAfter}`;
  }
  if (disableAfter && today > disableAfter) {
    return `Access to this VM was disabled after ${disableAfter}`;
  }

  if (allowAfter || denyAfter) {
    if (allowAfter && denyAfter) {
      const start = timeToMinutes(allowAfter);
      const end = timeToMinutes(denyAfter);
      if (start === end) {
        return `Access is only allowed between ${allowAfter} and ${denyAfter}`;
      }
      if (start < end) {
        if (currentMins < start || currentMins >= end) {
          return `Access is only allowed between ${allowAfter} and ${denyAfter}`;
        }
      } else if (currentMins < start && currentMins >= end) {
        return `Access is only allowed between ${allowAfter} and ${denyAfter}`;
      }
    } else if (allowAfter && currentMins < timeToMinutes(allowAfter)) {
      return `Access is not allowed before ${allowAfter}`;
    } else if (denyAfter && currentMins >= timeToMinutes(denyAfter)) {
      return `Access is not allowed after ${denyAfter}`;
    }
  }

  return null;
}
