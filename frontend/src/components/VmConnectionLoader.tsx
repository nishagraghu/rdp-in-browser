import React from 'react';
import { Monitor } from 'lucide-react';

interface VmConnectionLoaderProps {
  vmName?: string;
}

export const VmConnectionLoader: React.FC<VmConnectionLoaderProps> = ({ vmName }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Monitor className="h-8 w-8" />
          </div>
          <div className="absolute -inset-2 rounded-3xl border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight">
            Connecting to {vmName || 'Remote Desktop'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Establishing secure RDP session and negotiating display resolution. This may take a few seconds.
          </p>
        </div>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
};
