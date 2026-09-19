import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Guacamole from 'guacamole-common-js';
import api from '../../api/client';
import { AppDispatch, RootState } from '../../store';
import { endVmConnection, startVmConnection, VM_CONNECTION_REVEAL_DELAY_MS } from '../../store/vmSlice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  ChevronUp,
  Upload,
  Download
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  isBrowserShortcut,
  isUploadShortcut,
  lockRdpKeyboard,
  unlockRdpKeyboard,
} from '@/lib/rdpKeyboard';
import { DASHBOARD_SHOW_LIST_STATE } from '@/lib/dashboardNavigation';
import { SharedDriveDownloadDialog } from '@/components/SharedDriveDownloadDialog';

export const RemoteDesktopView: React.FC = () => {
  const { vmId } = useParams<{ vmId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { connectingVm } = useSelector((state: RootState) => state.vms);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vmInfo, setVmInfo] = useState<{ id: string; name: string; protocol: string; hostname: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [toolbarRevealed, setToolbarRevealed] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);

  // ESC long press tracking state
  const [escProgress, setEscProgress] = useState(0);
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const escLongPressTriggeredRef = useRef(false);
  const escStartTimeRef = useRef(0);

  // Scaling & Resolution states
  const [scaleMode, setScaleMode] = useState<'fit' | '100%' | 'custom'>('fit');
  const [customScalePercent, setCustomScalePercent] = useState<number>(100);
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [nativeResolution, setNativeResolution] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const isConnectedRef = useRef(false);
  const scaleModeRef = useRef(scaleMode);
  const sendSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TOOLBAR_HEIGHT = 44;

  useEffect(() => {
    scaleModeRef.current = scaleMode;
  }, [scaleMode]);

  const getContainerSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }, []);

  const getViewportSize = useCallback((fullscreen: boolean) => {
    const screenWidth = window.screen?.width || window.innerWidth || 1920;
    const screenHeight = window.screen?.height || window.innerHeight || 1080;
    const width = fullscreen ? screenWidth : (window.innerWidth || screenWidth);
    const height = Math.max(
      1,
      (fullscreen ? screenHeight : (window.innerHeight || screenHeight)) - TOOLBAR_HEIGHT,
    );
    return { width, height };
  }, []);

  const updateRemoteDisplaySize = useCallback(() => {
    if (!clientRef.current || !isConnectedRef.current) return;
    const size = getContainerSize();
    if (!size) return;

    if (sendSizeTimerRef.current) clearTimeout(sendSizeTimerRef.current);
    sendSizeTimerRef.current = setTimeout(() => {
      clientRef.current?.sendSize(size.width, size.height);
    }, 100);
  }, [getContainerSize]);

  // Apply scaling to the Guacamole display canvas and size wrapper
  const applyScale = useCallback((mode: 'fit' | '100%' | 'custom', customVal: number) => {
    if (!clientRef.current || !containerRef.current) return;
    const display = clientRef.current.getDisplay();
    const dw = display.getWidth();
    const dh = display.getHeight();
    if (dw <= 0 || dh <= 0) return;

    setNativeResolution({ width: dw, height: dh });

    const size = getContainerSize();
    if (!size) return;
    const { width: cw, height: ch } = size;

    let targetScale = 1.0;
    if (mode === 'fit') {
      const widthMatch = Math.abs(dw - cw) <= 2;
      const heightMatch = Math.abs(dh - ch) <= 2;
      targetScale = widthMatch && heightMatch ? 1.0 : Math.min(cw / dw, ch / dh);
    } else if (mode === '100%') {
      targetScale = 1.0;
    } else if (mode === 'custom') {
      targetScale = customVal / 100;
    }

    if (targetScale > 0) {
      display.scale(targetScale);
      setScaleFactor(targetScale);
    }
  }, [getContainerSize]);

  useEffect(() => {
    applyScale(scaleMode, customScalePercent);
  }, [scaleMode, customScalePercent, applyScale]);

  const focusDisplay = useCallback(() => {
    displayRef.current?.focus();
  }, []);

  const enterFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root || document.fullscreenElement) return;
    try {
      await root.requestFullscreen();
      await lockRdpKeyboard();
      focusDisplay();
    } catch {
      // User gesture might be needed; fallback to button
    }
  }, [focusDisplay]);

  // Auto-enter browser fullscreen once the session is connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      enterFullscreen();
    }
  }, [connectionStatus, enterFullscreen]);

  // Broader scheme stays up until RDP is connected, then reveal the full app after a short settle delay
  useEffect(() => {
    if (connectionStatus !== 'connected' || !connectingVm) return;

    const timer = setTimeout(() => {
      dispatch(endVmConnection());
    }, VM_CONNECTION_REVEAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, [connectionStatus, connectingVm, dispatch]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = async () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);

      if (active) {
        await lockRdpKeyboard();
        focusDisplay();
        setScaleMode('fit');
      } else {
        unlockRdpKeyboard();
      }

      setTimeout(() => {
        updateRemoteDisplaySize();
        applyScale(active ? 'fit' : scaleMode, customScalePercent);
      }, 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      unlockRdpKeyboard();
    };
  }, [scaleMode, customScalePercent, applyScale, focusDisplay, updateRemoteDisplaySize]);

  // Fullscreen: reveal toolbar when cursor moves to top edge
  useEffect(() => {
    if (!isFullscreen) {
      setToolbarRevealed(true);
      return;
    }

    setToolbarRevealed(false);

    const onMove = (e: MouseEvent) => {
      if (downloadDialogOpen || disconnectDialogOpen) {
        setToolbarRevealed(true);
        return;
      }
      if (e.clientY <= 24) {
        setToolbarRevealed(true);
      } else if (e.clientY > 64) {
        setToolbarRevealed(false);
      }
    };

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [isFullscreen, downloadDialogOpen, disconnectDialogOpen]);

  // Keyboard shortcut & Escape long press listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Upload shortcut: Ctrl + Shift + Alt
      if (isUploadShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();

        if (clientRef.current) {
          clientRef.current.sendKeyEvent(0, 0xffe3); // Release Ctrl
          clientRef.current.sendKeyEvent(0, 0xffe1); // Release Shift
          clientRef.current.sendKeyEvent(0, 0xffe9); // Release Alt
        }
        fileInputRef.current?.click();
        return;
      }

      // 2. Escape Key Long-Press Handler:
      // Single tap: passes ESC key to remote RDP VM
      // Long press (held >= 650ms): toggles toolbar panel collapse
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();

        if (!escStartTimeRef.current && !e.repeat) {
          escStartTimeRef.current = Date.now();
          escLongPressTriggeredRef.current = false;
          const LONG_PRESS_MS = 650;

          if (escIntervalRef.current) clearInterval(escIntervalRef.current);
          if (escTimerRef.current) clearTimeout(escTimerRef.current);

          escIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - escStartTimeRef.current;
            const pct = Math.min(100, Math.round((elapsed / LONG_PRESS_MS) * 100));
            setEscProgress(pct);
          }, 35);

          escTimerRef.current = setTimeout(() => {
            escLongPressTriggeredRef.current = true;
            if (escIntervalRef.current) clearInterval(escIntervalRef.current);
            setEscProgress(0);
            escStartTimeRef.current = 0;

            setIsPanelCollapsed((prev) => {
              const next = !prev;
              if (!isFullscreen) {
                toast.info(next ? 'Minimized to compact bar (Hold ESC to expand)' : 'Full toolbar expanded');
              }
              return next;
            });
          }, LONG_PRESS_MS);
        }
        return;
      }

      if (!isFullscreen) return;

      if (isBrowserShortcut(e)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();

        if (escTimerRef.current) clearTimeout(escTimerRef.current);
        if (escIntervalRef.current) clearInterval(escIntervalRef.current);
        setEscProgress(0);
        escStartTimeRef.current = 0;

        if (!escLongPressTriggeredRef.current) {
          // Short press tap: send ESC key to Guacamole RDP session
          if (clientRef.current) {
            clientRef.current.sendKeyEvent(1, 0xff1b); // ESC down
            clientRef.current.sendKeyEvent(0, 0xff1b); // ESC up
          }
        }
        escLongPressTriggeredRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      if (escTimerRef.current) clearTimeout(escTimerRef.current);
      if (escIntervalRef.current) clearInterval(escIntervalRef.current);
    };
  }, [isFullscreen]);

  // Initialize Guacamole session
  useEffect(() => {
    if (!vmId) return;

    let tunnel: Guacamole.WebSocketTunnel | null = null;
    let client: Guacamole.Client | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const initSession = async () => {
      setConnectionStatus('connecting');
      setErrorMessage(null);

      if (vmId) {
        dispatch(startVmConnection({ id: vmId, name: 'Remote Desktop' }));
      }

      try {
        const { width: initialWidth, height: initialHeight } = getViewportSize(true);

        const res = await api.post(`/vms/${vmId}/connect`, { 
          width: initialWidth, 
          height: initialHeight 
        });

        if (!res.data.success) {
          throw new Error(res.data.error || 'Failed to initiate remote session');
        }

        const { token, vm } = res.data.data;
        setVmInfo(vm);
        dispatch(startVmConnection({ id: vm.id, name: vm.name }));

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const targetWsUrl = `${wsProtocol}//${window.location.host}/ws`;

        tunnel = new Guacamole.WebSocketTunnel(targetWsUrl);
        client = new Guacamole.Client(tunnel);
        clientRef.current = client;

        client.onerror = (errorState: Guacamole.Status) => {
          console.error('Guacamole client error:', errorState);
          const message =
            errorState.message ||
            `Remote desktop connection failed (error code: 0x${errorState.code.toString(16)})`;
          setErrorMessage(message);
          setConnectionStatus('error');
          dispatch(endVmConnection());
        };

        client.onfile = (stream, _mimetype, filename) => {
          stream.sendAck(
            'Use the shared drive — files appear on the host folder',
            Guacamole.Status.Code.UNSUPPORTED,
          );
          toast.info(
            `"${filename}" stays on the shared drive — open Shared Drive or the host folder to view it.`,
          );
        };

        client.onstatechange = (state) => {
          switch (state) {
            case 0:
            case 1:
            case 2:
              setConnectionStatus('connecting');
              break;
            case 3:
              isConnectedRef.current = true;
              setConnectionStatus('connected');
              setTimeout(() => {
                updateRemoteDisplaySize();
                applyScale('fit', 100);
              }, 100);
              break;
            case 4:
            case 5:
              isConnectedRef.current = false;
              setConnectionStatus((prev) => (prev === 'error' ? prev : 'disconnected'));
              break;
          }
        };

        const display = client.getDisplay();
        const displayElement = display.getElement();

        display.onresize = (w: number, h: number) => {
          setNativeResolution({ width: w, height: h });
          applyScale(scaleModeRef.current, customScalePercent);
        };

        if (displayRef.current) {
          displayRef.current.innerHTML = '';
          displayRef.current.appendChild(displayElement);
        }

        const mouse = new Guacamole.Mouse(displayElement);
        const handleMouse = (mouseState: unknown) => {
          if (clientRef.current) clientRef.current.sendMouseState(mouseState as never);
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mouse as any).onmousedown = (mouse as any).onmouseup = (mouse as any).onmousemove = handleMouse;

        const keyboardTarget = displayRef.current;
        let keyboard: Guacamole.Keyboard | null = null;
        
        if (keyboardTarget) {
          keyboardTarget.tabIndex = -1;
          keyboardTarget.style.outline = 'none';
          keyboardTarget.focus();
          
          keyboardTarget.addEventListener('mousedown', () => keyboardTarget.focus());
          
          keyboard = new Guacamole.Keyboard(keyboardTarget);
          
          keyboard.onkeydown = (keysym: number) => {
            if (clientRef.current) clientRef.current.sendKeyEvent(1, keysym);
          };
          keyboard.onkeyup = (keysym: number) => {
            if (clientRef.current) clientRef.current.sendKeyEvent(0, keysym);
          };
        }

        client.connect(`token=${encodeURIComponent(token)}`);

        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            updateRemoteDisplaySize();
            applyScale(scaleMode, customScalePercent);
          });
          resizeObserver.observe(containerRef.current);
        }

      } catch (err: unknown) {
        const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
        setConnectionStatus('error');
        setErrorMessage(errorResponse.response?.data?.error || errorResponse.message || 'Failed to establish connection');
        dispatch(endVmConnection());
      }
    };

    initSession();

    return () => {
      dispatch(endVmConnection());
      if (sendSizeTimerRef.current) clearTimeout(sendSizeTimerRef.current);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch {}
      }
    };
  }, [vmId, applyScale, updateRemoteDisplaySize, getViewportSize, customScalePercent, dispatch]);

  const goToDashboard = () => {
    navigate('/dashboard', { state: DASHBOARD_SHOW_LIST_STATE });
  };

  const handleDisconnect = () => {
    setDisconnectDialogOpen(false);
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    goToDashboard();
  };

  const handleReconnect = () => {
    window.location.reload();
  };

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;

    if (!document.fullscreenElement) {
      try {
        await root.requestFullscreen();
        await lockRdpKeyboard();
        focusDisplay();
      } catch {
        toast.error('Failed to enter fullscreen mode');
      }
    } else {
      unlockRdpKeyboard();
      try {
        await document.exitFullscreen();
      } catch {
        toast.error('Failed to exit fullscreen mode');
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
    updateRemoteDisplaySize();
    applyScale('fit', 100);
  };

  const handleNative100 = () => {
    setScaleMode('100%');
    applyScale('100%', 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !clientRef.current) return;
    
    Array.from(files).forEach(file => {
      const stream = clientRef.current!.createFileStream(file.type || 'application/octet-stream', file.name);
      const writer = new Guacamole.BlobWriter(stream);
      
      toast.info(`Saving ${file.name} to shared drive...`);

      writer.oncomplete = () => {
        stream.sendEnd();
        toast.success(`${file.name} is on the shared drive (visible on host folder too).`);
      };
      
      writer.onerror = () => {
        console.error(`Failed to upload ${file.name}`);
        stream.sendEnd();
        toast.error(`Failed to save ${file.name} to shared drive`);
      };
      
      writer.sendBlob(file);
    });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const sendSpecialKey = (combination: string) => {
    const client = clientRef.current;
    if (!client) return;

    if (combination === 'CAD') {
      client.sendKeyEvent(1, 0xffe3); // Ctrl
      client.sendKeyEvent(1, 0xffe9); // Alt
      client.sendKeyEvent(1, 0xffff); // Delete
      client.sendKeyEvent(0, 0xffff);
      client.sendKeyEvent(0, 0xffe9);
      client.sendKeyEvent(0, 0xffe3);
    } else if (combination === 'WIN') {
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

  const scaledWidth = Math.round(nativeResolution.width * scaleFactor);
  const scaledHeight = Math.round(nativeResolution.height * scaleFactor);

  const fillViewport = scaleMode === 'fit';
  const isConnecting = !!connectingVm;
  // Fullscreen + minimized: only the compact floating pill (Windows RDP style)
  const useCompactPill = isFullscreen || isPanelCollapsed;
  const pillVisible = !isFullscreen || toolbarRevealed || downloadDialogOpen || disconnectDialogOpen;

  return (
    <div ref={rootRef} className="fixed inset-0 w-full h-full min-h-0 flex flex-col bg-background text-foreground overflow-hidden select-none">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />

      <SharedDriveDownloadDialog
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
        container={rootRef.current}
      />

      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent container={rootRef.current} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect session?</DialogTitle>
            <DialogDescription>
              This will end your remote desktop connection and return you to the dashboard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDisconnectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {escProgress > 0 && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background/95 border border-primary/40 px-4 py-2 rounded-full shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2">
          <span className="text-xs font-semibold text-primary">Hold ESC to toggle panel...</span>
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-75"
              style={{ width: `${escProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Top hit zone — reveal pill when cursor reaches top in fullscreen */}
      {!isConnecting && isFullscreen && !pillVisible && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-4 z-50"
          onMouseEnter={() => setToolbarRevealed(true)}
          aria-hidden
        />
      )}

      {/* Compact floating pill — fullscreen (auto-hide) and minimized */}
      {!isConnecting && useCompactPill && (
        <div
          className={`fixed top-3 left-1/2 z-50 flex items-center bg-background/90 backdrop-blur-md border border-border/80 rounded-full px-3 py-1.5 shadow-2xl gap-2 transition-all duration-200 ${
            pillVisible
              ? '-translate-x-1/2 translate-y-0 opacity-100'
              : '-translate-x-1/2 -translate-y-8 opacity-0 pointer-events-none'
          }`}
          onMouseEnter={() => {
            if (isFullscreen) setToolbarRevealed(true);
          }}
          onMouseLeave={() => {
            if (isFullscreen && !downloadDialogOpen && !disconnectDialogOpen) setToolbarRevealed(false);
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2.5 text-xs font-medium gap-1.5 rounded-full hover:bg-primary/10 hover:text-primary"
            title="Upload file to shared drive"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDownloadDialogOpen(true)}
            className="h-7 px-2.5 text-xs font-medium gap-1.5 rounded-full hover:bg-primary/10 hover:text-primary"
            title="Browse and download files from shared drive"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </Button>

          <div className="h-3.5 w-px bg-border/80" />

          {!isFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPanelCollapsed(false)}
              className="h-7 px-2 text-xs font-medium gap-1 rounded-full text-muted-foreground hover:text-foreground"
              title="Expand full toolbar (or Hold ESC)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Toolbar</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            onMouseDown={(e) => e.preventDefault()}
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDisconnectDialogOpen(true)}
            className="h-7 w-7 p-0 rounded-full text-destructive hover:bg-destructive/10"
            title="Disconnect"
          >
            <Power className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Full session toolbar — windowed expanded only (never in fullscreen) */}
      {!isConnecting && !isFullscreen && !isPanelCollapsed && (
        <header className="relative shrink-0 w-full h-11 px-4 bg-background/95 backdrop-blur-md border-b flex items-center justify-between gap-2 z-40">
          <div className="flex items-center space-x-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToDashboard}
              className="p-1.5 h-8 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center space-x-1.5 text-xs font-medium cursor-pointer"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="h-4 w-px bg-border" />

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

            <Badge
              variant={connectionStatus === 'connected' ? 'default' : 'destructive'}
              className={connectionStatus === 'connected' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
            >
              {connectionStatus.toUpperCase()}
            </Badge>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {connectionStatus === 'connected' && (
              <div className="hidden md:flex items-center px-2 py-0.5 bg-muted/90 border border-border/60 rounded-md text-[11px] font-mono text-muted-foreground">
                <span>{nativeResolution.width}×{nativeResolution.height}</span>
                <span className="mx-1 text-muted-foreground/50">•</span>
                <span className="text-primary font-semibold">{Math.round(scaleFactor * 100)}%</span>
              </div>
            )}

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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs font-medium space-x-1"
                  title="Send special keys to remote desktop"
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
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-2 text-xs font-medium space-x-1"
              title="Save file to shared drive"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setDownloadDialogOpen(true)}
              className="h-8 px-2 text-xs font-medium space-x-1"
              title="Browse and download files from shared drive"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPanelCollapsed(true)}
              className="h-8 w-8 p-0"
              title="Minimize to compact bar (or Hold ESC)"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => { toggleFullscreen(); }}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 w-8 p-0"
              title="Enter Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
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
              onClick={() => setDisconnectDialogOpen(true)}
              className="h-8 px-2.5 text-xs font-semibold space-x-1"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          </div>
        </header>
      )}

      {/* Main Remote Display Viewport Container */}
      <main 
        ref={containerRef}
        onMouseDown={focusDisplay}
        className={`flex-1 min-h-0 w-full bg-black relative flex items-center justify-center ${
          scaleMode === 'fit' ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
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
              <p className="text-xs text-muted-foreground max-w-md mx-auto mt-3">
                Verify the VM username and password in Admin settings. If target account is locked,
                unlock it on the remote Windows server and try again.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <Button onClick={handleReconnect} className="font-semibold rounded-xl text-sm">
                Retry Connection
              </Button>
              <Button variant="secondary" onClick={goToDashboard} className="font-semibold rounded-xl text-sm">
                Return to Dashboard
              </Button>
            </div>
          </div>
        )}

        {connectionStatus === 'disconnected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 z-20 p-6 space-y-4 text-center">
            <div className="p-4 bg-muted text-muted-foreground border border-border rounded-2xl">
              <Power className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Remote Session Disconnected</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                The connection to the remote desktop was closed.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <Button onClick={handleReconnect} className="font-semibold rounded-xl text-sm">
                Reconnect
              </Button>
              <Button variant="secondary" onClick={goToDashboard} className="font-semibold rounded-xl text-sm">
                Return to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Scaled Display Container */}
        <div 
          style={{
            width: fillViewport ? '100%' : scaledWidth > 0 ? `${scaledWidth}px` : '100%',
            height: fillViewport ? '100%' : scaledHeight > 0 ? `${scaledHeight}px` : '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
          className={fillViewport ? '' : 'shadow-2xl rounded-sm'}
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
