import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Guacamole from 'guacamole-common-js';
import api from '../../api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ChevronDown,
  Upload
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export const RemoteDesktopView: React.FC = () => {
  const { vmId } = useParams<{ vmId: string }>();
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vmInfo, setVmInfo] = useState<{ id: string; name: string; protocol: string; hostname: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scaling & Resolution states
  const [scaleMode, setScaleMode] = useState<'fit' | '100%' | 'custom'>('fit');
  const [customScalePercent, setCustomScalePercent] = useState<number>(100);
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [nativeResolution, setNativeResolution] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });

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
    let globalKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

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

        // Handle native file downloads (from remote to local)
        client.onfile = (stream, mimetype, filename) => {
          toast.info(`Downloading file: ${filename}...`);
          const reader = new Guacamole.BlobReader(stream, mimetype);
          reader.onend = () => {
             const blob = reader.getBlob();
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = filename;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             setTimeout(() => URL.revokeObjectURL(url), 1000);
          };
          stream.sendAck('OK', Guacamole.Status.Code.SUCCESS);
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

        // Handle keyboard input by attaching to a focusable container rather than document
        // This prevents the keyboard listener from intercepting keys globally after navigating away.
        const keyboardTarget = displayRef.current;
        let keyboard: Guacamole.Keyboard | null = null;
        
        if (keyboardTarget) {
          keyboardTarget.tabIndex = -1;
          keyboardTarget.style.outline = 'none';
          keyboardTarget.focus();
          
          keyboardTarget.addEventListener('mousedown', () => keyboardTarget.focus());
          
          // We use a global window event listener to ensure we catch the shortcut
          // before Guacamole or anything else can intercept it.
          globalKeyDownHandler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.altKey) {
              e.preventDefault();
              e.stopPropagation();
              
              // Release modifiers on the remote machine to prevent stuck keys
              if (clientRef.current) {
                clientRef.current.sendKeyEvent(0, 0xffe3); // Release Ctrl
                clientRef.current.sendKeyEvent(0, 0xffe1); // Release Shift
                clientRef.current.sendKeyEvent(0, 0xffe9); // Release Alt
              }
              // Trigger native upload file picker
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }
          };
          
          window.addEventListener('keydown', globalKeyDownHandler, { capture: true });
          
          keyboard = new Guacamole.Keyboard(keyboardTarget);
          
          keyboard.onkeydown = (keysym: number) => {
            if (clientRef.current) clientRef.current.sendKeyEvent(1, keysym);
          };
          keyboard.onkeyup = (keysym: number) => {
            if (clientRef.current) clientRef.current.sendKeyEvent(0, keysym);
          };
        }

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
      if (globalKeyDownHandler) {
        window.removeEventListener('keydown', globalKeyDownHandler, { capture: true });
      }
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

  // Handle native file uploads (from local to remote)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !clientRef.current) return;
    
    Array.from(files).forEach(file => {
      const stream = clientRef.current!.createFileStream(file.type || 'application/octet-stream', file.name);
      const writer = new Guacamole.BlobWriter(stream);
      
      toast.info(`Uploading file: ${file.name}...`);

      writer.oncomplete = () => {
        stream.sendEnd();
        toast.success(`File ${file.name} uploaded successfully!`);
      };
      
      writer.onerror = () => {
        console.error(`Failed to upload ${file.name}`);
        stream.sendEnd();
        toast.error(`Failed to upload ${file.name}`);
      };
      
      writer.sendBlob(file);
    });
    
    // Clear input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
  };

  // Scaled dimensions for the wrapper
  const scaledWidth = Math.round(nativeResolution.width * scaleFactor);
  const scaledHeight = Math.round(nativeResolution.height * scaleFactor);

  return (
    <div className="w-screen h-screen flex flex-col bg-background text-foreground overflow-hidden select-none">
      {/* Session Toolbar Header */}
      <header className="h-11 bg-background/95 backdrop-blur-md border-b px-4 flex items-center justify-between z-30 shrink-0 gap-3">
        {/* Left Side: Back button, VM name & status */}
        <div className="flex items-center space-x-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="p-1.5 h-8 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center space-x-1.5 text-xs font-medium cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>

          <div className="h-4 w-px bg-border"></div>

          <div className="flex items-center space-x-2 truncate">
            <div className="p-1 bg-primary/10 text-primary rounded-md shrink-0">
              <Monitor className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <h2 className="text-xs sm:text-sm font-bold leading-none truncate">
                {vmInfo?.name || 'Remote Desktop'}
              </h2>
            </div>
          </div>

          <Badge variant={
            connectionStatus === 'connected' ? 'default' :
            connectionStatus === 'connecting' ? 'secondary' : 'destructive'
          } className={connectionStatus === 'connected' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
            {connectionStatus.toUpperCase()}
          </Badge>
        </div>

        {/* Center / Right Controls: Scale, Resolution, Keys, Fullscreen, Disconnect */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* Resolution & Scale Indicator */}
          {connectionStatus === 'connected' && (
            <div className="hidden md:flex items-center px-2 py-0.5 bg-muted/90 border border-border/60 rounded-md text-[11px] font-mono text-muted-foreground">
              <span>{nativeResolution.width}×{nativeResolution.height}</span>
              <span className="mx-1 text-muted-foreground/50">•</span>
              <span className="text-primary font-semibold">{Math.round(scaleFactor * 100)}%</span>
            </div>
          )}

          {/* Scaling Mode Toggles */}
          <div className="flex items-center bg-muted/90 p-0.5 border border-border/60 rounded-lg">
            <button
              onClick={handleFitScreen}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors ${
                scaleMode === 'fit' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Fit entire desktop to screen"
            >
              <Scan className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fit Screen</span>
            </button>
            <button
              onClick={handleNative100}
              className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                scaleMode === '100%' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="1:1 Native Resolution"
            >
              1:1
            </button>
          </div>

          {/* Zoom In/Out */}
          <div className="hidden lg:flex items-center bg-muted/90 border border-border/60 rounded-lg">
            <button
              onClick={handleZoomOut}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-l cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono text-muted-foreground min-w-9 text-center">
              {Math.round(scaleFactor * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-r cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Upload to VM Button (triggers file picker) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2 text-xs font-medium space-x-1"
            title="Upload to VM (or use Ctrl+Shift+Alt)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload to VM</span>
          </Button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />

          {/* Special Keys Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs font-medium space-x-1"
                title="Send Special Keys"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keys</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 text-xs">
              <DropdownMenuItem onClick={() => sendSpecialKey('CAD')} className="justify-between cursor-pointer">
                <span>Ctrl + Alt + Del</span>
                <span className="text-[10px] text-muted-foreground font-mono">Unlock</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => sendSpecialKey('WIN')} className="justify-between cursor-pointer">
                <span>Windows Key</span>
                <span className="text-[10px] text-muted-foreground font-mono">Start</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => sendSpecialKey('TAB')} className="justify-between cursor-pointer">
                <span>Alt + Tab</span>
                <span className="text-[10px] text-muted-foreground font-mono">Switch</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => sendSpecialKey('ESC')} className="justify-between cursor-pointer">
                <span>Escape</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-8 w-8 p-0"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            className="h-8 w-8 p-0"
            title="Reconnect Session"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
            className="h-8 px-2.5 text-xs font-semibold space-x-1"
          >
            <Power className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        </div>
      </header>

      {/* Main Remote Display Viewport Container */}
      <main 
        ref={containerRef}
        className={`flex-1 w-full bg-background relative flex items-center justify-center ${
          scaleMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        {connectionStatus === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 z-20 space-y-4">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div className="text-center">
              <h3 className="text-lg font-bold">Establishing Remote Desktop Session...</h3>
              <p className="text-xs text-muted-foreground mt-1">Negotiating display resolution and starting RDP stream</p>
            </div>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-20 p-6 space-y-4 text-center">
            <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Remote Session Connection Failed</h3>
              <p className="text-sm text-destructive max-w-md mx-auto mt-2 font-mono text-xs">
                {errorMessage || 'Unable to connect to target RDP host via Guacamole.'}
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <Button onClick={handleReconnect} className="font-semibold rounded-xl text-sm">
                Retry Connection
              </Button>
              <Button variant="secondary" onClick={() => navigate('/dashboard')} className="font-semibold rounded-xl text-sm">
                Return to Dashboard
              </Button>
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
