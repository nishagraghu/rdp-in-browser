import Guacamole from 'guacamole-common-js';

export interface RdpClipboardBridge {
  detach: () => void;
  syncFromLocal: () => Promise<void>;
}

/**
 * Syncs browser clipboard text with the Guacamole RDP session.
 * Local → remote so Ctrl+V in Windows pastes local text;
 * remote → local so copies inside the session can be pasted on this machine.
 */
export function attachRdpClipboard(
  client: Guacamole.Client,
  pasteTarget: HTMLElement | null,
): RdpClipboardBridge {
  let lastSent = '';
  let disposed = false;

  const sendText = (text: string) => {
    const value = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (disposed || !value || value === lastSent) return;
    lastSent = value;
    try {
      const stream = client.createClipboardStream('text/plain');
      const writer = new Guacamole.StringWriter(stream);
      writer.sendText(value);
      writer.sendEnd();
    } catch {
      /* session may already be closed */
    }
  };

  const syncFromLocal = async () => {
    if (disposed || typeof navigator.clipboard?.readText !== 'function') return;
    try {
      const text = await navigator.clipboard.readText();
      if (!disposed && text) sendText(text);
    } catch {
      /* permission denied — paste-event fallback still applies */
    }
  };

  client.onclipboard = (stream, mimetype) => {
    if (mimetype && !String(mimetype).startsWith('text/')) {
      stream.sendAck('Unsupported clipboard type', Guacamole.Status.Code.UNSUPPORTED);
      return;
    }
    const reader = new Guacamole.StringReader(stream);
    let data = '';
    reader.ontext = (chunk: string) => {
      data += chunk;
    };
    reader.onend = () => {
      if (!data) return;
      lastSent = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (typeof navigator.clipboard?.writeText === 'function') {
        void navigator.clipboard.writeText(data).catch(() => {});
      }
    };
  };

  const onFocus = () => {
    void syncFromLocal();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void syncFromLocal();
  };
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain');
    if (text) sendText(text);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) void syncFromLocal();
  };

  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('paste', onPaste, true);
  window.addEventListener('keydown', onKeyDown, true);
  pasteTarget?.addEventListener('paste', onPaste);

  return {
    detach: () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('paste', onPaste, true);
      window.removeEventListener('keydown', onKeyDown, true);
      pasteTarget?.removeEventListener('paste', onPaste);
      client.onclipboard = null;
    },
    syncFromLocal,
  };
}
