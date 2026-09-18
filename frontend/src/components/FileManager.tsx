import React, { useEffect, useState, useRef, useCallback } from 'react';
import { UploadCloud, File as FileIcon, Folder, RefreshCw, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import api from '../api/client';

interface DriveEntry {
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

export const FileManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/files');
      if (res.data.success) {
        const data = res.data.data as DriveListing;
        const list = Array.isArray(data?.entries) ? data.entries : [];
        setUsername(data?.username || '');
        // Files first by newest modified; directories stay visible for structure
        setEntries(
          [...list].sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
          }),
        );
      }
    } catch (err) {
      console.error('Failed to fetch shared drive', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchFiles();
    // Reflect host-folder changes while the dialog is open
    const timer = window.setInterval(fetchFiles, 4000);
    return () => window.clearInterval(timer);
  }, [isOpen, fetchFiles]);

  useEffect(() => {
    const handleOpen = () => setIsOpen((prev) => !prev);
    window.addEventListener('open-file-manager', handleOpen);
    return () => window.removeEventListener('open-file-manager', handleOpen);
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    if (file.size > 50 * 1024 * 1024) {
      alert('File size exceeds 50MB limit.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchFiles();
    } catch (err) {
      console.error('Upload failed', err);
      alert('Failed to upload file to shared drive.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const filesOnly = entries.filter((e) => !e.isDirectory);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button id="file-manager-trigger" variant="outline" size="sm" className="gap-2">
          <HardDrive className="h-4 w-4" />
          <span className="hidden sm:inline">Shared Drive</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shared Drive</DialogTitle>
          <DialogDescription>
            Same folder as on the host{username ? ` under your user folder (${username})` : ''}.
            Files you add here appear in the remote session drive, and files saved there appear here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {isUploading ? 'Uploading...' : 'Upload to Shared Drive'}
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

          <div className="border rounded-md overflow-hidden max-h-[360px] overflow-y-auto">
            {isLoading && entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading shared drive...
              </div>
            ) : entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Shared drive is empty. Upload here or drop files into the host folder.
              </div>
            ) : (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li
                    key={entry.path}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="bg-primary/10 p-2 rounded-md shrink-0">
                        {entry.isDirectory ? (
                          <Folder className="h-4 w-4 text-primary" />
                        ) : (
                          <FileIcon className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate" title={entry.path}>
                          {entry.path}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.isDirectory
                            ? 'Folder'
                            : `${formatSize(entry.size)} • ${new Date(entry.modifiedAt).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {filesOnly.length} file{filesOnly.length === 1 ? '' : 's'} on shared drive
            {username ? ` · ${username}` : ''}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
