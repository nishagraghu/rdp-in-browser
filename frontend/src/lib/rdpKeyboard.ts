/** Keyboard helpers for RDP fullscreen — block browser shortcuts, forward keys to remote. */

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return EDITABLE_TAGS.has(target.tagName);
}

/** App-level shortcut for file upload — not forwarded to RDP. */
export function isUploadShortcut(e: KeyboardEvent): boolean {
  return e.ctrlKey && e.shiftKey && e.altKey;
}

/**
 * Returns true when the key combo is a browser/OS shortcut that should be
 * suppressed in fullscreen so the remote desktop receives the keystroke instead.
 */
export function isBrowserShortcut(e: KeyboardEvent): boolean {
  if (isUploadShortcut(e)) return false;

  const key = e.key.toLowerCase();

  // Browser navigation & utility keys
  if (key === 'f5' || key === 'f11' || key === 'f12') return true;

  // Backspace navigates back when focus is not in an editable field
  if (key === 'backspace' && !isEditableTarget(e.target)) return true;

  const ctrl = e.ctrlKey || e.metaKey;
  const alt = e.altKey;
  const shift = e.shiftKey;

  if (ctrl) {
    const blocked = new Set([
      'w', 't', 'n', 'r', 'l', 'p', 'f', 'h', 'j', 'u', 's', 'd',
      'g', 'k', 'e', 'i', 'o', 'b', 'tab',
    ]);
    if (blocked.has(key)) return true;
    if (shift && ['i', 'j', 'c', 'delete', 'n', 't', 'r'].includes(key)) return true;
  }

  if (alt && (key === 'arrowleft' || key === 'arrowright' || key === 'home' || key === 'd')) {
    return true;
  }

  return false;
}

/** Prevent Escape from exiting browser fullscreen — let RDP receive it. */
export function shouldBlockEscapeInFullscreen(e: KeyboardEvent, isFullscreen: boolean): boolean {
  return isFullscreen && e.key === 'Escape';
}

interface KeyboardLock {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

function getKeyboardLock(): KeyboardLock | null {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard ?? null;
}

/** Lock keyboard so OS/browser shortcuts are delivered to the page (requires fullscreen). */
export async function lockRdpKeyboard(): Promise<boolean> {
  const keyboard = getKeyboardLock();
  if (!keyboard) return false;
  try {
    await keyboard.lock();
    return true;
  } catch {
    return false;
  }
}

export function unlockRdpKeyboard(): void {
  getKeyboardLock()?.unlock();
}
