import React, { useCallback, useEffect, useState } from 'react';
import { Download, File as FileIcon, Folder, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import api from '../api/client';

export interface DriveEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  createdAt: string;
  modifiedAt: string;
}

interface DriveListing {
  username: string;
  entries: DriveEntry[];
}

export function formatDriveSize(bytes: number): string {
  if (bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export async function fetchSharedDriveEntries(): Promise<DriveListing> {
  const res = await api.get('/files');
  if (!res.data.success) {
    throw new Error(res.data.error || 'Failed to list shared drive');
  }
  const data = res.data.data as DriveListing;
  const list = Array.isArray(data?.entries) ? data.entries : [];
  return {
    username: data?.username || '',
    entries: [...list].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    }),
  };
}

export async function downloadSharedDriveFile(relativePath: string): Promise<void> {
  const res = await api.get('/files/download', {
    params: { path: relativePath },
    responseType: 'blob',
  });

  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = relativePath.split('/').pop() || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

interface SharedDriveDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement | null;
}

export const SharedDriveDownloadDialog: React.FC<SharedDriveDownloadDialogProps> = ({
  open,
  onOpenChange,
  container,
}) => {
  const [username, setUsername] = useState('');
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSharedDriveEntries();
      setUsername(data.username);
      setEntries(data.entries);
    } catch (err) {
      console.error('Failed to fetch shared drive', err);
      toast.error('Could not load shared drive files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadFiles();
    const timer = window.setInterval(loadFiles, 4000);
    return () => window.clearInterval(timer);
  }, [open, loadFiles]);

  const handleDownload = async (entry: DriveEntry) => {
    if (entry.isDirectory) return;
    setDownloadingPath(entry.path);
    try {
      toast.info(`Downloading ${entry.name}...`);
      await downloadSharedDriveFile(entry.path);
      toast.success(`${entry.name} downloaded`);
    } catch (err) {
      console.error('Download failed', err);
      toast.error(`Failed to download ${entry.name}`);
    } finally {
      setDownloadingPath(null);
    }
  };

  const filesOnly = entries.filter((e) => !e.isDirectory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="sm:max-w-3xl w-[min(920px,92vw)]">
        <DialogHeader>
          <DialogTitle>Download from Shared Drive</DialogTitle>
          <DialogDescription>
            Files available in your shared drive
            {username ? ` (${username})` : ''}. Click download to save a copy to this computer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={loadFiles}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="border rounded-md overflow-hidden max-h-[360px] overflow-y-auto">
            {isLoading && entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading files...
              </div>
            ) : filesOnly.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No files on the shared drive yet. Upload or copy files into the shared drive first.
              </div>
            ) : (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li
                    key={entry.path}
                    className="flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                      <div className="bg-primary/10 p-2 rounded-md shrink-0">
                        {entry.isDirectory ? (
                          <Folder className="h-4 w-4 text-primary" />
                        ) : (
                          <FileIcon className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-sm font-medium truncate" title={entry.path}>
                          {entry.path}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.isDirectory
                            ? 'Folder'
                            : `${formatDriveSize(entry.size)} • ${new Date(entry.modifiedAt).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                    {!entry.isDirectory && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 h-8"
                        disabled={downloadingPath === entry.path}
                        onClick={() => handleDownload(entry)}
                        title={`Download ${entry.name}`}
                      >
                        {downloadingPath === entry.path ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">Download</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {filesOnly.length} downloadable file{filesOnly.length === 1 ? '' : 's'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
