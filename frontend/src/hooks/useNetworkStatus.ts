import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkStatusType = 'online' | 'offline' | 'reconnecting';

export interface UseNetworkStatusOptions {
  /**
   * Health-check URL to verify actual backend connectivity.
   * Defaults to '/health'.
   */
  pingUrl?: string;
  /**
   * Interval in milliseconds between ping checks when online.
   * Default: 8000 (8s)
   */
  pingIntervalMs?: number;
  /**
   * Interval in milliseconds between throttled retries when offline or reconnecting.
   * Default: 3000 (3s)
   */
  reconnectIntervalMs?: number;
  /**
   * Callback fired when network status transitions to 'online'.
   */
  onOnline?: () => void;
  /**
   * Callback fired when network status transitions to 'offline'.
   */
  onOffline?: () => void;
  /**
   * Callback fired when network status transitions to 'reconnecting'.
   */
  onReconnecting?: () => void;
}

export interface UseNetworkStatusReturn {
  status: NetworkStatusType;
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  latency: number | null;
  lastChecked: Date | null;
  retryAttempt: number;
  checkConnection: () => Promise<boolean>;
}

/**
 * Probes internet connectivity.
 * Tests both the backend /health endpoint and public internet reachability
 * to accurately detect offline states even in local development environments.
 */
async function probeConnectivity(
  pingUrl: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; latency: number | null }> {
  // 1. Browser OS network stack check
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, latency: null };
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const appPingUrl = `${pingUrl}${pingUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const appPromise = fetch(appPingUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: controller.signal,
    });

    if (isLocalhost) {
      // In local development, loopback 127.0.0.1 always succeeds even without internet.
      // So check actual external internet connectivity concurrently.
      const internetPromise = fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      }).catch(() =>
        fetch('https://1.1.1.1/cdn-cgi/trace', {
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        }),
      );

      const [appRes] = await Promise.all([appPromise, internetPromise]);
      clearTimeout(timer);
      if (!appRes.ok) return { ok: false, latency: null };
      const latency = Math.max(1, Math.round(performance.now() - start));
      return { ok: true, latency };
    } else {
      const appRes = await appPromise;
      clearTimeout(timer);
      if (!appRes.ok) return { ok: false, latency: null };
      const latency = Math.max(1, Math.round(performance.now() - start));
      return { ok: true, latency };
    }
  } catch {
    clearTimeout(timer);
    return { ok: false, latency: null };
  }
}

export function useNetworkStatus(options: UseNetworkStatusOptions = {}): UseNetworkStatusReturn {
  const {
    pingUrl = '/health',
    pingIntervalMs = 8000,
    reconnectIntervalMs = 3000,
    onOnline,
    onOffline,
    onReconnecting,
  } = options;

  const [status, setStatus] = useState<NetworkStatusType>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline';
    }
    return 'online';
  });

  const [latency, setLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const statusRef = useRef<NetworkStatusType>(status);
  statusRef.current = status;

  const isProbingRef = useRef(false);
  const onOnlineRef = useRef(onOnline);
  const onOfflineRef = useRef(onOffline);
  const onReconnectingRef = useRef(onReconnecting);

  onOnlineRef.current = onOnline;
  onOfflineRef.current = onOffline;
  onReconnectingRef.current = onReconnecting;

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (isProbingRef.current) return statusRef.current === 'online';
    isProbingRef.current = true;

    // Fast-path: if browser itself says offline, immediately mark offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      isProbingRef.current = false;
      if (statusRef.current !== 'offline') {
        setStatus('offline');
        setLatency(null);
        onOfflineRef.current?.();
      }
      return false;
    }

    const { ok, latency: rtt } = await probeConnectivity(pingUrl);
    isProbingRef.current = false;

    if (ok) {
      setLatency(rtt);
      setLastChecked(new Date());
      setRetryAttempt(0);

      if (statusRef.current !== 'online') {
        setStatus('online');
        onOnlineRef.current?.();
      }
      return true;
    } else {
      setLatency(null);
      setRetryAttempt((prev) => prev + 1);

      if (statusRef.current !== 'offline') {
        setStatus('offline');
        onOfflineRef.current?.();
      }
      return false;
    }
  }, [pingUrl]);

  // Event listeners for window online / offline events
  useEffect(() => {
    const handleBrowserOnline = () => {
      // Browser reports network interface connected: mark as reconnecting and test reachability
      setStatus('reconnecting');
      onReconnectingRef.current?.();
      void checkConnection();
    };

    const handleBrowserOffline = () => {
      // Browser reports network lost: immediately mark as offline
      setStatus('offline');
      setLatency(null);
      onOfflineRef.current?.();
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void checkConnection();
      }
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // Initial check on mount
    void checkConnection();

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [checkConnection]);

  // Throttled polling:
  // When 'online': check every pingIntervalMs (e.g. 8s).
  // When 'offline' or 'reconnecting': throttled retry every reconnectIntervalMs (e.g. 3s).
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const runThrottledLoop = async () => {
      if (isCancelled) return;

      const currentStatus = statusRef.current;
      const delay = currentStatus === 'online' ? pingIntervalMs : reconnectIntervalMs;

      timerId = setTimeout(async () => {
        if (isCancelled) return;

        // If offline, set to reconnecting while probe runs to visually indicate throttled attempt
        if (statusRef.current === 'offline') {
          setStatus('reconnecting');
          onReconnectingRef.current?.();
        }

        await checkConnection();

        if (!isCancelled) {
          void runThrottledLoop();
        }
      }, delay);
    };

    void runThrottledLoop();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [status, pingIntervalMs, reconnectIntervalMs, checkConnection]);

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    isReconnecting: status === 'reconnecting',
    latency,
    lastChecked,
    retryAttempt,
    checkConnection,
  };
}
