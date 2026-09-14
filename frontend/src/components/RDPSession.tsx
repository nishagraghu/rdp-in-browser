import { useEffect, useRef, useCallback, useState } from 'react';
import Guacamole from 'guacamole-common-js';
import { RDPTunnel } from '../lib/tunnel';
import type { RDPSession as Session } from '../types';
import { X, Monitor } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  session: Session;
  focused: boolean;
  draggingOut?: boolean;
  onFocus: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<Session>) => void;
  onDragToOtherDisplay: (session: Session, e: MouseEvent) => void;
}

export default function RDPSession({
  session, focused, draggingOut, onFocus, onClose, onUpdate, onDragToOtherDisplay,
}: Props) {
  const displayRef  = useRef<HTMLDivElement>(null);
  const clientRef   = useRef<Guacamole.Client | null>(null);
  const rdpReadyRef = useRef(false);
  const focusedRef  = useRef(focused);
  const scaleRef    = useRef(1);
  const [status, setStatus]   = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [errMsg, setErrMsg]   = useState('');

  // Keep refs in sync so closures always see current values
  useEffect(() => { focusedRef.current = focused; }, [focused]);

  // ── Guacamole connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!displayRef.current) return;
    setStatus('connecting');
    setErrMsg('');

    const tunnel = new RDPTunnel(window.location.href, session.params);
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    const display = client.getDisplay();
    const el = display.getElement();
    el.style.position = 'absolute';
    el.style.top = '0';
    el.style.left = '0';
    displayRef.current.appendChild(el);

    // Scale the display to fit the container, centered.
    const scaleDisplay = () => {
      const container = displayRef.current;
      if (!container) return;
      const dw = display.getWidth();
      const dh = display.getHeight();
      if (!dw || !dh) return;
      const scale = Math.min(container.clientWidth / dw, container.clientHeight / dh);
      scaleRef.current = scale;
      display.scale(scale);
      el.style.left = Math.max(0, (container.clientWidth  - dw * scale) / 2) + 'px';
      el.style.top  = Math.max(0, (container.clientHeight - dh * scale) / 2) + 'px';
    };
    display.onresize = scaleDisplay;
    const ro = new ResizeObserver(scaleDisplay);
    ro.observe(displayRef.current);

    // Mouse — use raw DOM events so MouseEvent.buttons reflects the physical
    // button state even when the cursor dragged in from another browser window.
    // This enables seamless click-drag across the primary/secondary monitors.
    const sendMouseFromEvent = (e: MouseEvent) => {
      if (!rdpReadyRef.current) return;
      e.preventDefault();
      const s = scaleRef.current || 1;
      const rect = el.getBoundingClientRect();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = new (Guacamole.Mouse.State as any)(
        Math.round((e.clientX - rect.left) / s),
        Math.round((e.clientY - rect.top)  / s),
        (e.buttons & 1) !== 0,  // left
        (e.buttons & 4) !== 0,  // middle
        (e.buttons & 2) !== 0,  // right
        false, false,
      );
      client.sendMouseState(state);
    };
    const sendWheelFromEvent = (e: WheelEvent) => {
      if (!rdpReadyRef.current) return;
      e.preventDefault();
      const s = scaleRef.current || 1;
      const rect = el.getBoundingClientRect();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = new (Guacamole.Mouse.State as any)(
        Math.round((e.clientX - rect.left) / s),
        Math.round((e.clientY - rect.top)  / s),
        false, false, false,
        e.deltaY < 0,  // scroll up
        e.deltaY > 0,  // scroll down
      );
      client.sendMouseState(state);
    };
    el.addEventListener('mousemove',   sendMouseFromEvent);
    el.addEventListener('mousedown',   sendMouseFromEvent);
    el.addEventListener('mouseup',     sendMouseFromEvent);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('wheel',       sendWheelFromEvent, { passive: false });

    // Keyboard (only when this session is focused)
    const keyboardTarget = displayRef.current;
    const keyboard = new Guacamole.Keyboard(keyboardTarget);
    // Ensure the target can receive focus
    keyboardTarget.tabIndex = -1;
    keyboardTarget.style.outline = 'none';
    
    // Focus the target whenever we click the session
    const focusTarget = () => keyboardTarget.focus();
    displayRef.current.addEventListener('mousedown', focusTarget);

    keyboard.onkeydown = (keysym: number) => {
      if (focusedRef.current) client.sendKeyEvent(1, keysym);
    };
    keyboard.onkeyup = (keysym: number) => {
      if (focusedRef.current) client.sendKeyEvent(0, keysym);
    };

    // Intercept tunnel state changes
    const guacTunnelStateChange = tunnel.onstatechange;
    tunnel.onstatechange = (state: Guacamole.Tunnel.State) => {
      guacTunnelStateChange?.call(tunnel, state);
      if (state === Guacamole.Tunnel.State.OPEN) {
        setStatus('connected');
        rdpReadyRef.current = true;
      }
      if (state === Guacamole.Tunnel.State.CLOSED) {
        rdpReadyRef.current = false;
        setStatus('disconnected');
      }
    };

    client.onstatechange = (state: number) => {
      if (state === 3) rdpReadyRef.current = true;
      if (state === 5) { rdpReadyRef.current = false; setStatus('disconnected'); }
    };
    client.onerror = (s: Guacamole.Status) => {
      setStatus('error');
      setErrMsg(s.message ?? 'Connection failed');
    };

    client.connect('');

    return () => {
      rdpReadyRef.current = false;
      keyboard.onkeydown = null;
      keyboard.onkeyup   = null;
      if (keyboardTarget) {
        keyboardTarget.removeEventListener('mousedown', focusTarget);
      }
      ro.disconnect();
      client.disconnect();
      if (displayRef.current && el.parentNode === displayRef.current) {
        displayRef.current.removeChild(el);
      }
    };
  // Reconnect when session ID changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // ── Title-bar drag ─────────────────────────────────────────────────────────
  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || session.isMaximized) return;
    e.preventDefault();
    onFocus();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startLeft: session.left, startTop: session.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const newLeft = dragRef.current.startLeft + dx;
      const newTop  = dragRef.current.startTop  + dy;

      if (newLeft < -session.width * 0.4 || newLeft > window.innerWidth - session.width * 0.6) {
        dragRef.current.active = false;
        onDragToOtherDisplay({ ...session, left: newLeft, top: newTop }, ev);
        return;
      }
      onUpdate({ left: newLeft, top: newTop });
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [session, onFocus, onUpdate, onDragToOtherDisplay]);

  // Drag state
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  // Resize state
  const resizeRef = useRef({ active: false, edge: '', startX: 0, startY: 0, startW: 0, startH: 0, startL: 0, startT: 0 });

  // ── Resize handles ─────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((edge: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true, edge,
      startX: e.clientX, startY: e.clientY,
      startW: session.width, startH: session.height,
      startL: session.left,  startT: session.top,
    };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current.active) return;
      const { startX, startY, startW, startH, startL, startT, edge: eg } = resizeRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const patch: Partial<Session> = {};
      if (eg.includes('e')) patch.width  = Math.max(400, startW + dx);
      if (eg.includes('s')) patch.height = Math.max(300, startH + dy);
      if (eg.includes('w')) { patch.width = Math.max(400, startW - dx); patch.left = startL + dx; }
      if (eg.includes('n')) { patch.height = Math.max(300, startH - dy); patch.top  = startT + dy; }
      onUpdate(patch);
    };
    const onUp = () => {
      resizeRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [session, onUpdate]);

  const style = session.isMaximized
    ? { top: 0, left: 0, width: '100%', height: '100%', zIndex: focused ? 9999 : 100 }
    : { top: session.top, left: session.left, width: session.width, height: session.height, zIndex: focused ? 200 : 100 };

  if (session.isMinimized) return null;

  return (
    <div 
      className={`absolute flex flex-col overflow-hidden bg-background border rounded-lg shadow-xl transition-opacity duration-200 ${focused ? 'border-primary ring-1 ring-primary shadow-2xl' : 'border-border opacity-90'} ${draggingOut ? 'opacity-50 blur-sm pointer-events-none' : ''}`} 
      style={style} 
      onMouseDown={onFocus}
    >
      {/* Title bar */}
      <div 
        className={`flex items-center justify-between h-10 px-3 select-none ${focused ? 'bg-primary/5 border-b border-primary/20' : 'bg-muted/50 border-b border-border'} ${!session.isMaximized ? 'cursor-move' : ''}`} 
        onMouseDown={onTitleMouseDown}
      >
        <div className="flex items-center space-x-2 overflow-hidden">
          <Monitor className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">
            {session.params.label || session.params.host}
            {status === 'connecting' && <span className="text-muted-foreground font-normal"> — Connecting…</span>}
            {status === 'error'      && <span className="text-destructive font-normal"> — {errMsg}</span>}
            {status === 'disconnected' && <span className="text-muted-foreground font-normal"> — Disconnected</span>}
          </span>
        </div>
        <div className="flex items-center ml-2">
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Display area */}
      <div className="relative flex-1 bg-black overflow-hidden" ref={displayRef}>
        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-sm font-medium">Connecting to {session.params.host}…</div>
          </div>
        )}
        {(status === 'error' || status === 'disconnected') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm z-10 space-y-4">
            <div className="text-4xl">⚠️</div>
            <div className="text-sm font-medium">{status === 'error' ? errMsg : 'Session disconnected'}</div>
            <Button variant="outline" size="sm" onClick={() => {
              clientRef.current?.disconnect();
              setStatus('connecting');
            }}>Reconnect</Button>
          </div>
        )}
      </div>

      {/* Resize handles */}
      {!session.isMaximized && (<>
        <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize" onMouseDown={onResizeMouseDown('n')} />
        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize" onMouseDown={onResizeMouseDown('s')} />
        <div className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize" onMouseDown={onResizeMouseDown('e')} />
        <div className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize" onMouseDown={onResizeMouseDown('w')} />
        <div className="absolute top-0 left-0 w-2 h-2 cursor-nwse-resize" onMouseDown={onResizeMouseDown('nw')} />
        <div className="absolute top-0 right-0 w-2 h-2 cursor-nesw-resize" onMouseDown={onResizeMouseDown('ne')} />
        <div className="absolute bottom-0 left-0 w-2 h-2 cursor-nesw-resize" onMouseDown={onResizeMouseDown('sw')} />
        <div className="absolute bottom-0 right-0 w-2 h-2 cursor-nwse-resize" onMouseDown={onResizeMouseDown('se')} />
      </>)}
    </div>
  );
}
