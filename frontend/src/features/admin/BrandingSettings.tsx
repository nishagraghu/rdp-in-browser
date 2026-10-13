import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CustomerLogoSettings,
  deleteCustomerLogo,
  fetchCustomerLogoSettings,
  uploadCustomerLogo,
} from '../../api/settings';
import defaultLogo from '../../logo.png';

const ACCEPTED = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml';

export const BrandingSettings: React.FC = () => {
  const [settings, setSettings] = useState<CustomerLogoSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCustomerLogoSettings();
      setSettings(data);
      setPreviewUrl(data.logoUrl);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load customer logo settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller');
      return;
    }

    setIsUploading(true);
    try {
      const data = await uploadCustomerLogo(file);
      setSettings(data);
      setPreviewUrl(data.logoUrl);
      toast.success('Customer logo updated. Login page will show the new image.');
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorResponse.response?.data?.error || errorResponse.message || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!settings?.hasLogo) return;
    setIsDeleting(true);
    try {
      const data = await deleteCustomerLogo();
      setSettings(data);
      setPreviewUrl(null);
      toast.success('Customer logo removed. Login page will use the default logo.');
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorResponse.response?.data?.error || errorResponse.message || 'Remove failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const displaySrc = previewUrl || defaultLogo;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Customer Logo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload or update the logo shown on the login page. Changes apply immediately for new visitors.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Login page branding</CardTitle>
          <CardDescription>
            PNG, JPEG, WebP, GIF, or SVG up to 5 MB. Replacing the logo overwrites the previous image.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="rounded-lg border bg-muted/30 p-6 flex items-center justify-center min-h-[140px] w-full sm:w-64">
                  <img
                    src={displaySrc}
                    alt="Customer logo preview"
                    className="max-h-28 w-auto object-contain"
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <Alert>
                    <AlertDescription className="text-xs">
                      {settings?.hasLogo
                        ? `Current file: ${settings.originalName || 'customer logo'} · Updated ${settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '—'}`
                        : 'No custom logo uploaded yet. The default logo is shown on the login page.'}
                    </AlertDescription>
                  </Alert>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      disabled={isUploading || isDeleting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Uploading…
                        </>
                      ) : settings?.hasLogo ? (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Update logo
                        </>
                      ) : (
                        <>
                          <ImagePlus className="mr-2 h-4 w-4" />
                          Add logo
                        </>
                      )}
                    </Button>
                    {settings?.hasLogo && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading || isDeleting}
                        onClick={handleRemove}
                      >
                        {isDeleting ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Removing…
                          </>
                        ) : (
                          <>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </>
                        )}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={loadSettings} title="Refresh">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
