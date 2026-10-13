import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, ChevronRight, UploadCloud, File as FileIcon, Folder, RefreshCw, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import api from '../api/client';
import { toast } from 'sonner';
import logo from '../logo.png';
import {
  DriveEntry,
  DriveListing,
  deleteSharedDriveEntry,
  downloadSharedDriveFile,
  fetchSharedDriveEntries,
  formatDriveSize,
} from './SharedDriveDownloadDialog';

export const FileManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [listing, setListing] = useState<DriveListing | null>(null);
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [selectedVmId, setSelectedVmId] = useState<string | undefined>();
  const [folderChoices, setFolderChoices] = useState<DriveListing['choices']>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSharedDriveEntries(selectedVmId);
      setUsername(data.username);
      setListing(data);
      setEntries(data.entries);
      if (data.choices.length > 0) setFolderChoices(data.choices);
      else if (!selectedVmId) setFolderChoices([]);
    } catch (err) {
      console.error('Failed to fetch shared drive', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedVmId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchFiles();
    const timer = window.setInterval(fetchFiles, 4000);
    return () => window.clearInterval(timer);
  }, [isOpen, fetchFiles]);

  useEffect(() => {
    setCurrentPath('');
  }, [isOpen, selectedVmId]);

  useEffect(() => {
    const handleOpen = () => setIsOpen((prev) => !prev);
    window.addEventListener('open-file-manager', handleOpen);
    return () => window.removeEventListener('open-file-manager', handleOpen);
  }, []);

  const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  const getParentPath = (pathStr: string) => {
    const clean = normalizePath(pathStr);
    const parts = clean.split('/');
    parts.pop();
    return parts.join('/');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);

    const targetVmId = selectedVmId || listing?.vmId;
    setIsUploading(true);

    try {
      for (const file of fileList) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds 50MB limit.`);
          continue;
        }

        const toastId = toast.loading(`Uploading "${file.name}" (${formatDriveSize(file.size)})...`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('expectedSize', String(file.size));

        const res = await api.post('/files/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Expected-File-Size': String(file.size),
            ...(targetVmId ? { 'X-VM-ID': targetVmId } : {}),
            ...(currentPath ? { 'X-Folder': currentPath } : {}),
          },
          params: {
            ...(targetVmId ? { vmId: targetVmId } : {}),
            ...(currentPath ? { folder: currentPath } : {}),
          },
        });

        const uploadedSize = res.data?.data?.size ?? file.size;
        if (uploadedSize !== file.size) {
          throw new Error(`Size verification mismatch: sent ${file.size} bytes, disk has ${uploadedSize} bytes.`);
        }

        toast.success(`"${file.name}" (${formatDriveSize(uploadedSize)}) uploaded to shared drive!`, { id: toastId });
      }

      await fetchFiles();
    } catch (err: any) {
      console.error('Upload failed', err);
      const msg = err.response?.data?.error || err.message || 'Failed to upload file to shared drive.';
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (entry: DriveEntry) => {
    if (entry.isDirectory) return;
    setDownloadingPath(entry.path);
    try {
      await downloadSharedDriveFile(entry.path, selectedVmId || listing?.vmId);
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to download file.');
    } finally {
      setDownloadingPath(null);
    }
  };

  const handleDelete = async (entry: DriveEntry) => {
    const shared = listing?.mode === 'common';
    const prompt = shared
      ? `Remove "${entry.name}" from the common folder? Everyone who uses this desktop will lose it.`
      : `Remove "${entry.name}" from your shared drive?`;
    if (!window.confirm(prompt)) return;

    setDeletingPath(entry.path);
    try {
      await deleteSharedDriveEntry(entry.path, selectedVmId || listing?.vmId);
      await fetchFiles();
    } catch (err) {
      console.error('Delete failed', err);
      alert('Failed to remove file.');
    } finally {
      setDeletingPath(null);
    }
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

  const description = listing?.mode === 'common'
    ? `Common folder${listing.label ? ` (${listing.label})` : ''}. Everyone can see, add, and remove files here.`
    : listing?.mode === 'choose'
      ? 'More than one shared folder is available. Choose one.'
      : `Same folder as on the host${username ? ` under your user folder (${username})` : ''}. Files you add here appear in the remote session drive, and files saved there appear here.`;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button id="file-manager-trigger" variant="outline" size="sm" className="gap-2">
          <img src={logo} alt="Shared Drive" className="h-8 w-auto object-contain" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Shared Drive</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {folderChoices.length > 1 && (
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
                {folderChoices.map((choice) => (
                  <option key={`${choice.mode}-${choice.vmId}`} value={choice.vmId}>
                    {choice.name} ({choice.mode === 'common' ? choice.label : 'my folder'})
                  </option>
                ))}
              </select>
            </label>
          )}

          {listing?.message && (
            <p className="text-xs text-muted-foreground">{listing.message}</p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleUpload}
              multiple
            />
            <Button
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || listing?.mode === 'choose' || !!listing?.missing}
            >
              {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {isUploading ? 'Uploading...' : currentPath ? `Upload to ${currentPath.split('/').pop()}` : 'Upload to Shared Drive'}
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Refresh"
              onClick={fetchFiles}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

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
                      className={`h-7 px-2 text-xs truncate max-w-[130px] shrink-0 ${
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
            {currentPath && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1 shrink-0"
                onClick={() => setCurrentPath(getParentPath(currentPath))}
                title="Go to parent folder"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Back</span>
              </Button>
            )}
          </div>

          <div className="border rounded-md overflow-hidden max-h-[360px] overflow-y-auto">
            {isLoading && entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading shared drive...
              </div>
            ) : currentFolderEntries.length === 0 && !currentPath ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {listing?.missing
                  ? listing.message
                  : 'Shared drive is empty. Upload here or drop files into the host folder.'}
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
                    <div className="flex items-center shrink-0">
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
                          variant="ghost"
                          size="icon"
                          title="Download"
                          disabled={downloadingPath === entry.path}
                          onClick={() => handleDownload(entry)}
                        >
                          {downloadingPath === entry.path ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {listing?.canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove"
                          className="text-destructive hover:text-destructive"
                          disabled={deletingPath === entry.path}
                          onClick={() => handleDelete(entry)}
                        >
                          {deletingPath === entry.path ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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

