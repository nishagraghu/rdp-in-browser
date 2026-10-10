import React, { useCallback, useEffect, useState } from 'react';
import { Download, File as FileIcon, Folder, RefreshCw, Trash2 } from 'lucide-react';
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

export interface DriveChoice {
  vmId: string;
  name: string;
  mode: 'common' | 'personal';
  label: string;
}

export interface DriveListing {
  username: string;
  mode: 'common' | 'personal' | 'choose';
  label: string;
  vmId?: string;
  exists: boolean;
  missing: boolean;
  canDelete: boolean;
  message?: string;
  choices: DriveChoice[];
  entries: DriveEntry[];
}

export function formatDriveSize(bytes: number): string {
  if (bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export async function fetchSharedDriveEntries(vmId?: string): Promise<DriveListing> {
  const res = await api.get('/files', { params: vmId ? { vmId } : undefined });
  if (!res.data.success) {
    throw new Error(res.data.error || 'Failed to list shared drive');
  }
  const data = res.data.data as Partial<DriveListing>;
  const list = Array.isArray(data?.entries) ? data.entries : [];
  return {
    username: data?.username || '',
    mode: data?.mode || 'personal',
    label: data?.label || '',
    vmId: data?.vmId,
    exists: data?.exists !== false,
    missing: !!data?.missing,
    canDelete: !!data?.canDelete,
    message: data?.message,
    choices: Array.isArray(data?.choices) ? data.choices : [],
    entries: [...list].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    }),
  };
}

export async function downloadSharedDriveFile(relativePath: string, vmId?: string): Promise<void> {
  const res = await api.get('/files/download', {
    params: { path: relativePath, ...(vmId ? { vmId } : {}) },
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

export async function deleteSharedDriveEntry(relativePath: string, vmId?: string): Promise<void> {
  const res = await api.delete('/files', {
    params: { path: relativePath, ...(vmId ? { vmId } : {}) },
  });
  if (!res.data.success) {
    throw new Error(res.data.error || 'Failed to remove file');
  }
}

interface SharedDriveDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container?: HTMLElement | null;
  vmId?: string;
}

export const SharedDriveDownloadDialog: React.FC<SharedDriveDownloadDialogProps> = ({
  open,
  onOpenChange,
  container,
  vmId,
}) => {
  const [username, setUsername] = useState('');
  const [listing, setListing] = useState<DriveListing | null>(null);
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [selectedVmId, setSelectedVmId] = useState<string | undefined>(vmId);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  useEffect(() => {
    setSelectedVmId(vmId);
  }, [vmId]);

  const activeVmId = selectedVmId || vmId;

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSharedDriveEntries(activeVmId);
      setUsername(data.username);
      setListing(data);
      setEntries(data.entries);
    } catch (err) {
      console.error('Failed to fetch shared drive', err);
      toast.error('Could not load shared drive files');
    } finally {
      setIsLoading(false);
    }
  }, [activeVmId]);

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
      await downloadSharedDriveFile(entry.path, activeVmId || listing?.vmId);
      toast.success(`${entry.name} downloaded`);
    } catch (err) {
      console.error('Download failed', err);
      toast.error(`Failed to download ${entry.name}`);
    } finally {
      setDownloadingPath(null);
    }
  };

  const handleDelete = async (entry: DriveEntry) => {
    const target = activeVmId || listing?.vmId;
    const shared = listing?.mode === 'common';
    const prompt = shared
      ? `Remove "${entry.name}" from the common folder? Everyone who uses this desktop will lose it.`
      : `Remove "${entry.name}" from your shared drive?`;
    if (!window.confirm(prompt)) return;

    setDeletingPath(entry.path);
    try {
      await deleteSharedDriveEntry(entry.path, target);
      toast.success(`${entry.name} removed`);
      await loadFiles();
    } catch (err) {
      console.error('Delete failed', err);
      toast.error(`Failed to remove ${entry.name}`);
    } finally {
      setDeletingPath(null);
    }
  };

  const filesOnly = entries.filter((e) => !e.isDirectory);
  const folderLabel = listing?.mode === 'common'
    ? `Common folder${listing.label ? ` (${listing.label})` : ''}`
    : listing?.mode === 'choose'
      ? 'Choose a shared folder'
      : `Your folder${username ? ` (${username})` : ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="sm:max-w-3xl w-[min(920px,92vw)]">
        <DialogHeader>
          <DialogTitle>Download from Shared Drive</DialogTitle>
          <DialogDescription>
            {folderLabel}. Click download to save a copy to this computer.
            {listing?.canDelete ? ' Remove deletes the file from the shared folder.' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {listing?.mode === 'choose' && listing.choices.length > 0 && (
            <label className="flex flex-col gap-1 text-xs">
              Shared folder
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={selectedVmId || ''}
                onChange={(e) => setSelectedVmId(e.target.value || undefined)}
              >
                <option value="">Select a folder</option>
                {listing.choices.map((choice) => (
                  <option key={choice.vmId} value={choice.vmId}>
                    {choice.name} ({choice.mode === 'common' ? choice.label : 'my folder'})
                  </option>
                ))}
              </select>
            </label>
          )}
          {listing?.message && (
            <p className="text-xs text-muted-foreground">{listing.message}</p>
          )}
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
            ) : entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {listing?.missing
                  ? listing.message
                  : 'No files on the shared drive yet. Upload or copy files into the shared drive first.'}
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
                    <div className="flex items-center gap-1 shrink-0">
                      {!entry.isDirectory && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-8"
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
                      {listing?.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={deletingPath === entry.path}
                          onClick={() => handleDelete(entry)}
                          title={`Remove ${entry.name}`}
                        >
                          {deletingPath === entry.path ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
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
