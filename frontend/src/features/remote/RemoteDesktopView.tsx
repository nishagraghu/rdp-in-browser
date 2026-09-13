import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Guacamole from 'guacamole-common-js';
import api from '../../api/client';
import { Badge } from '../../components/Badge';
import { 
  Monitor, 
  ArrowLeft, 
  Maximize2, 
  Minimize2, 
  RefreshCw, 
  Power, 
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Scan,
  Keyboard,
  ChevronDown
} from 'lucide-react';

export const RemoteDesktopView: React.FC = () => {
  const { vmId } = useParams<{ vmId: string }>();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vmInfo, setVmInfo] = useState<{ id: string; name: string; protocol: string; hostname: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scaling & Resolution states
  const [scaleMode, setScaleMode] = useState<'fit' | '100%' | 'custom'>('fit');
  const [customScalePercent, setCustomScalePercent] = useState<number>(100);
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [nativeResolution, setNativeResolution] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [isKeyMenuOpen, setIsKeyMenuOpen] = useState(false);

  // Apply scaling to the Guacamole display canvas and size wrapper
  const applyScale = useCallback((mode: 'fit' | '100%' | 'custom', customVal: number) => {
    if (!clientRef.current || !containerRef.current) return;
    const display = clientRef.current.getDisplay();
    const dw = display.getWidth();
    const dh = display.getHeight();
    if (dw <= 0 || dh <= 0) return;

    setNativeResolution({ width: dw, height: dh });

    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    let targetScale = 1.0;
    if (mode === 'fit') {
      // Scale to fit within container dimensions
      targetScale = Math.min(cw / dw, ch / dh);
    } else if (mode === '100%') {
      targetScale = 1.0;
    } else if (mode === 'custom') {
      targetScale = customVal / 100;
    }

    if (targetScale > 0) {
      display.scale(targetScale);
      setScaleFactor(targetScale);
    }
  }, []);

  useEffect(() => {
    applyScale(scaleMode, customScalePercent);
  }, [scaleMode, customScalePercent, applyScale]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        applyScale(scaleMode, customScalePercent);
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [scaleMode, customScalePercent, applyScale]);

  // Initialize Guacamole session
  useEffect(() => {
    if (!vmId) return;

    let tunnel: Guacamole.WebSocketTunnel | null = null;
    let client: Guacamole.Client | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initSession = async () => {
      setConnectionStatus('connecting');
      setErrorMessage(null);

      try {
        // Measure window size for initial resolution request
        const initialWidth = window.innerWidth || 1920;
        const initialHeight = (window.innerHeight ? window.innerHeight - 44 : 1080);

        const res = await api.post(`/vms/${vmId}/connect`, { 
          width: initialWidth, 
          height: initialHeight 
        });

        if (!res.data.success) {
          throw new Error(res.data.error || 'Failed to initiate remote session');
        }

        const { token, vm } = res.data.data;
        setVmInfo(vm);

        // Derive clean WebSocket URL through Nginx reverse proxy
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const targetWsUrl = `${wsProtocol}//${window.location.host}/ws`;

        tunnel = new Guacamole.WebSocketTunnel(targetWsUrl);
        client = new Guacamole.Client(tunnel);
        clientRef.current = client;

        // Guacamole state change handlers
        client.onerror = (errorState) => {
          console.error('Guacamole client error:', errorState);
          setConnectionStatus('error');
          setErrorMessage(`Guacamole error code: 0x${errorState.code.toString(16)}`);
        };

        client.onstatechange = (state) => {
          switch (state) {
            case 0: // IDLE
            case 1: // CONNECTING
            case 2: // WAITING
              setConnectionStatus('connecting');
              break;
            case 3: // CONNECTED
              setConnectionStatus('connected');
              setTimeout(() => {
                applyScale('fit', 100);
              }, 100);
              break;
            case 4: // DISCONNECTING
            case 5: // DISCONNECTED
              setConnectionStatus('disconnected');
              break;
          }
        };

        const display = client.getDisplay();
        const displayElement = display.getElement();

        // Listen for display dimension changes from remote server
        display.onresize = (w: number, h: number) => {
          setNativeResolution({ width: w, height: h });
          applyScale('fit', 100);
        };

        // Attach display element to container
        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(displayElement);
        }

        // Handle mouse input
        const mouse = new Guacamole.Mouse(displayElement);
        const handleMouse = (mouseState: unknown) => {
          if (clientRef.current) clientRef.current.sendMouseState(mouseState as never);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mouse as any).onmousedown = (mouse as any).onmouseup = (mouse as any).onmousemove = handleMouse;

        // Handle keyboard input
        const keyboard = new Guacamole.Keyboard(document);
        keyboard.onkeydown = (keysym) => {
          if (clientRef.current) clientRef.current.sendKeyEvent(1, keysym);
        };
        keyboard.onkeyup = (keysym) => {
          if (clientRef.current) clientRef.current.sendKeyEvent(0, keysym);
        };

        // Connect client passing encrypted session token
        client.connect(`token=${encodeURIComponent(token)}`);

        // Observe container resize and auto-scale dynamically
        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            applyScale(scaleMode, customScalePercent);
          });
          resizeObserver.observe(containerRef.current);
        }

      } catch (err: unknown) {
        const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
        setConnectionStatus('error');
        setErrorMessage(errorResponse.response?.data?.error || errorResponse.message || 'Failed to establish connection');
      }
    };

    initSession();

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch {}
      }
    };
  }, [vmId, applyScale]);

  const handleDisconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    navigate('/dashboard');
  };

  const handleReconnect = () => {
    window.location.reload();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const handleZoomIn = () => {
    const next = Math.min(200, Math.round(scaleFactor * 100) + 10);
    setScaleMode('custom');
    setCustomScalePercent(next);
  };

  const handleZoomOut = () => {
    const next = Math.max(25, Math.round(scaleFactor * 100) - 10);
    setScaleMode('custom');
    setCustomScalePercent(next);
  };

  const handleFitScreen = () => {
    setScaleMode('fit');
    applyScale('fit', 100);
  };

  const handleNative100 = () => {
    setScaleMode('100%');
    applyScale('100%', 100);
  };

  // Special key combinations
  const sendSpecialKey = (combination: string) => {
    const client = clientRef.current;
    if (!client) return;

    if (combination === 'CAD') {
      // Ctrl + Alt + Del
      client.sendKeyEvent(1, 0xffe3); // Ctrl
      client.sendKeyEvent(1, 0xffe9); // Alt
      client.sendKeyEvent(1, 0xffff); // Delete
      client.sendKeyEvent(0, 0xffff);
      client.sendKeyEvent(0, 0xffe9);
      client.sendKeyEvent(0, 0xffe3);
    } else if (combination === 'WIN') {
      // Windows Super Key
      client.sendKeyEvent(1, 0xffeb); // Super_L
      client.sendKeyEvent(0, 0xffeb);
    } else if (combination === 'ESC') {
      client.sendKeyEvent(1, 0xff1b); // Escape
      client.sendKeyEvent(0, 0xff1b);
    } else if (combination === 'TAB') {
      client.sendKeyEvent(1, 0xffe9); // Alt
      client.sendKeyEvent(1, 0xff09); // Tab
      client.sendKeyEvent(0, 0xff09);
      client.sendKeyEvent(0, 0xffe9);
    }
    setIsKeyMenuOpen(false);
  };

  // Scaled dimensions for the wrapper
  const scaledWidth = Math.round(nativeResolution.width * scaleFactor);
  const scaledHeight = Math.round(nativeResolution.height * scaleFactor);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-white overflow-hidden select-none">
      {/* Session Toolbar Header */}
      <header className="h-11 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 flex items-center justify-between z-30 shrink-0 gap-3">
        {/* Left Side: Back button, VM name & status */}
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center space-x-1.5 text-xs font-medium cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          <div className="h-4 w-px bg-slate-800"></div>

          <div className="flex items-center space-x-2 truncate">
            <div className="p-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-md shrink-0">
              <Monitor className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <h2 className="text-xs sm:text-sm font-bold text-white leading-none truncate">
                {vmInfo?.name || 'Remote Desktop'}
              </h2>
            </div>
          </div>

          <Badge variant={
            connectionStatus === 'connected' ? 'success' :
            connectionStatus === 'connecting' ? 'warning' : 'danger'
          }>
            {connectionStatus.toUpperCase()}
          </Badge>
        </div>

        {/* Center / Right Controls: Scale, Resolution, Keys, Fullscreen, Disconnect */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Resolution & Scale Indicator */}
          {connectionStatus === 'connected' && (
            <div className="hidden md:flex items-center px-2 py-0.5 bg-slate-800/90 border border-slate-700/60 rounded-md text-[11px] font-mono text-slate-300">
              <span>{nativeResolution.width}×{nativeResolution.height}</span>
              <span className="mx-1 text-slate-500">•</span>
              <span className="text-sky-400 font-semibold">{Math.round(scaleFactor * 100)}%</span>
            </div>
          )}

          {/* Scaling Mode Toggles */}
          <div className="flex items-center bg-slate-800/90 p-0.5 border border-slate-700/60 rounded-lg">
            <button
              onClick={handleFitScreen}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors ${
                scaleMode === 'fit' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="Fit entire desktop to screen"
            >
              <Scan className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fit Screen</span>
            </button>
            <button
              onClick={handleNative100}
              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                scaleMode === '100%' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              title="1:1 Native Resolution"
            >
              1:1
            </button>
          </div>

          {/* Zoom In/Out */}
          <div className="hidden lg:flex items-center bg-slate-800/90 border border-slate-700/60 rounded-lg">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-l cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-slate-300 min-w-9 text-center">
              {Math.round(scaleFactor * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-r cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Special Keys Menu */}
          <div className="relative">
            <button
              onClick={() => setIsKeyMenuOpen(!isKeyMenuOpen)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 text-xs font-medium flex items-center space-x-1 cursor-pointer"
              title="Send Special Keys"
            >
              <Keyboard className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Keys</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            {isKeyMenuOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
                <button
                  onClick={() => sendSpecialKey('CAD')}
                  className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Ctrl + Alt + Del</span>
                  <span className="text-[10px] text-slate-500 font-mono">Unlock</span>
                </button>
                <button
                  onClick={() => sendSpecialKey('WIN')}
                  className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Windows Key</span>
                  <span className="text-[10px] text-slate-500 font-mono">Start</span>
                </button>
                <button
                  onClick={() => sendSpecialKey('TAB')}
                  className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Alt + Tab</span>
                  <span className="text-[10px] text-slate-500 font-mono">Switch</span>
                </button>
                <button
                  onClick={() => sendSpecialKey('ESC')}
                  className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between cursor-pointer"
                >
                  <span>Escape</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleReconnect}
            className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Reconnect Session"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleDisconnect}
            className="px-2.5 py-1 bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </header>

      {/* Main Remote Display Viewport Container */}
      <main 
        ref={containerRef}
        className={`flex-1 w-full bg-slate-950 relative flex items-center justify-center ${
          scaleMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'
        }`}
        onClick={() => setIsKeyMenuOpen(false)}
      >
        {connectionStatus === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 z-20 space-y-4">
            <div className="h-12 w-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white">Establishing Remote Desktop Session...</h3>
              <p className="text-xs text-slate-400 mt-1">Negotiating display resolution and starting RDP stream</p>
            </div>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-20 p-6 space-y-4 text-center">
            <div className="p-4 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Remote Session Connection Failed</h3>
              <p className="text-sm text-rose-400 max-w-md mx-auto mt-2 font-mono text-xs">
                {errorMessage || 'Unable to connect to target RDP host via Guacamole.'}
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleReconnect}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Retry Connection
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Scaled Display Container: Exact visual width and height to avoid scrollbar overflow */}
        <div 
          style={{
            width: scaledWidth > 0 ? `${scaledWidth}px` : '100%',
            height: scaledHeight > 0 ? `${scaledHeight}px` : '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
          className="shadow-2xl rounded-sm"
        >
          {/* Guacamole internal canvas mount target */}
          <div 
            ref={displayRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '0 0',
            }}
          />
        </div>
      </main>
    </div>
  );
};
