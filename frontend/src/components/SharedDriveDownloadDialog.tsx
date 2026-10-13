import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, File as FileIcon, Folder, RefreshCw } from 'lucide-react';
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
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  useEffect(() => {
    setSelectedVmId(vmId);
  }, [vmId]);

  // Reset folder navigation when opening or switching shared folder
  useEffect(() => {
    setCurrentPath('');
  }, [open, selectedVmId, vmId]);

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

  const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  const getParentPath = (pathStr: string) => {
    const clean = normalizePath(pathStr);
    const parts = clean.split('/');
    parts.pop();
    return parts.join('/');
  };

  // Only show files and folders that directly reside in currentPath
  const currentFolderEntries = entries.filter((entry) => {
    const cleanEntry = normalizePath(entry.path);
    const cleanCurrent = normalizePath(currentPath);
    if (!cleanCurrent) {
      return !cleanEntry.includes('/');
    }
    if (!cleanEntry.startsWith(cleanCurrent + '/')) return false;
    const remainder = cleanEntry.slice(cleanCurrent.length + 1);
    return !remainder.includes('/');
  });

  const filesOnly = entries.filter((e) => !e.isDirectory);
  const currentFiles = currentFolderEntries.filter((e) => !e.isDirectory);
  const currentFolders = currentFolderEntries.filter((e) => e.isDirectory);
  const breadcrumbs = currentPath ? normalizePath(currentPath).split('/') : [];

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
            {folderLabel}. Double-click folders to open them and view files inside.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {listing?.mode === 'choose' && listing.choices.length > 0 && (
            <label className="flex flex-col gap-1 text-xs">
              Shared folder
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={selectedVmId || ''}
                onChange={(e) => {
                  setSelectedVmId(e.target.value || undefined);
                  setCurrentPath('');
                }}
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

          {/* Breadcrumb Navigation Bar */}
          <div className="flex items-center justify-between gap-2 text-xs bg-muted/40 p-2 rounded-md border">
            <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
              <Button
                variant={currentPath ? 'ghost' : 'secondary'}
                size="sm"
                className="h-7 px-2 text-xs gap-1.5 font-medium shrink-0"
                onClick={() => setCurrentPath('')}
              >
                <Folder className="h-3.5 w-3.5 text-primary" />
                <span>Shared Drive</span>
              </Button>
              {breadcrumbs.map((segment, index) => {
                const subPath = breadcrumbs.slice(0, index + 1).join('/');
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={subPath}>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Button
                      variant={isLast ? 'secondary' : 'ghost'}
                      size="sm"
                      className={`h-7 px-2 text-xs truncate max-w-[140px] shrink-0 ${
                        isLast ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                      onClick={() => !isLast && setCurrentPath(subPath)}
                      title={segment}
                    >
                      {segment}
                    </Button>
                  </React.Fragment>
                );
              })}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {currentPath && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => setCurrentPath(getParentPath(currentPath))}
                  title="Go to parent folder"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={loadFiles}
                disabled={isLoading}
                title="Refresh files"
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden max-h-[360px] overflow-y-auto">
            {isLoading && entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading files...
              </div>
            ) : currentFolderEntries.length === 0 && !currentPath ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {listing?.missing
                  ? listing.message
                  : 'No files on the shared drive yet. Upload or copy files into the shared drive first.'}
              </div>
            ) : currentFolderEntries.length === 0 && currentPath ? (
              <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <Folder className="h-8 w-8 text-muted-foreground/40" />
                <p>This folder is empty.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 mt-1"
                  onClick={() => setCurrentPath(getParentPath(currentPath))}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Go back
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {currentPath && (
                  <li
                    className="flex items-center justify-between gap-2 p-2.5 hover:bg-muted/50 transition-colors cursor-pointer select-none bg-muted/20"
                    onDoubleClick={() => setCurrentPath(getParentPath(currentPath))}
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-md shrink-0">
                        <Folder className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">..</span>
                        <span className="text-xs text-muted-foreground">Up to parent folder (Double-click)</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setCurrentPath(getParentPath(currentPath))}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Up
                    </Button>
                  </li>
                )}

                {currentFolderEntries.map((entry) => (
                  <li
                    key={entry.path}
                    className={`flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors select-none ${
                      entry.isDirectory ? 'cursor-pointer hover:bg-primary/5' : ''
                    }`}
                    onDoubleClick={() => {
                      if (entry.isDirectory) {
                        setCurrentPath(entry.path);
                      } else {
                        handleDownload(entry);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                      <div className="bg-primary/10 p-2 rounded-md shrink-0">
                        {entry.isDirectory ? (
                          <Folder className="h-4 w-4 text-primary" />
                        ) : (
                          <FileIcon className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-sm font-medium truncate" title={entry.name}>
                          {entry.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.isDirectory
                            ? 'Folder • Double-click to open'
                            : `${formatDriveSize(entry.size)} • ${new Date(entry.modifiedAt).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.isDirectory ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setCurrentPath(entry.path)}
                          title="Open folder"
                        >
                          <span>Open</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {currentFolders.length > 0 && `${currentFolders.length} folder${currentFolders.length === 1 ? '' : 's'}, `}
              {currentFiles.length} file{currentFiles.length === 1 ? '' : 's'} in this view
            </span>
            <span>
              {filesOnly.length} total file{filesOnly.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

