import React from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NetworkStatusType } from '@/hooks/useNetworkStatus';

export interface NetworkStatusBadgeProps {
  status: NetworkStatusType;
  latency?: number | null;
  onRetry?: () => void;
  className?: string;
  showLatency?: boolean;
}

export const NetworkStatusBadge: React.FC<NetworkStatusBadgeProps> = ({
  status,
  latency,
  onRetry,
  className,
  showLatency = true,
}) => {
  if (status === 'reconnecting') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold select-none transition-all duration-200',
          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse',
          className,
        )}
        title="Network connection interrupted. Reconnecting to internet..."
      >
        <RefreshCw className="w-3 h-3 text-amber-500 animate-spin shrink-0" />
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
        </span>
        <span className="leading-none tracking-tight">Reconnecting...</span>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold select-none transition-all duration-200 cursor-pointer',
          'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 active:scale-95',
          className,
        )}
        title="No internet connection detected. Click to recheck network."
      >
        <WifiOff className="w-3 h-3 text-rose-500 shrink-0" />
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
        </span>
        <span className="leading-none tracking-tight">No Internet</span>
      </button>
    );
  }

  // status === 'online'
  const latencyText = latency !== null && latency !== undefined ? `${latency}ms` : null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold select-none transition-all duration-200',
        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
        className,
      )}
      title={
        latencyText
          ? `Internet Connected • Server latency: ${latencyText}`
          : 'Internet Connected'
      }
    >
      <Wifi className="w-3 h-3 text-emerald-500 shrink-0" />
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      <span className="leading-none tracking-tight">Online</span>
      {showLatency && latencyText && (
        <span className="hidden sm:inline text-[10px] font-mono opacity-80 pl-0.5">
          {latencyText}
        </span>
      )}
    </div>
  );
};
