import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload, RefreshCw, Mail, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CustomerLogoSettings,
  SmtpSettings,
  deleteCustomerLogo,
  fetchCustomerLogoSettings,
  fetchSmtpSettings,
  saveSmtpSettings,
  testSmtpSettings,
  uploadCustomerLogo,
} from '../../api/settings';
import { SmtpEncryption } from '@rdp/shared';
import defaultLogo from '../../logo.png';

const ACCEPTED = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml';

type ConfigTab = 'logo' | 'smtp';

export const AdminConfigurationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ConfigTab>('logo');

  // Logo state
  const [logoSettings, setLogoSettings] = useState<CustomerLogoSettings | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SMTP state
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '587',
    username: '',
    password: '',
    encryption: 'starttls' as SmtpEncryption,
    fromEmail: '',
    fromName: '',
  });
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const loadLogo = useCallback(async () => {
    setLogoLoading(true);
    try {
      const data = await fetchCustomerLogoSettings();
      setLogoSettings(data);
      setPreviewUrl(data.logoUrl);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load customer logo settings');
    } finally {
      setLogoLoading(false);
    }
  }, []);

  const applySmtpDto = (data: SmtpSettings) => {
    setSmtpConfigured(data.configured);
    setHasStoredPassword(data.hasPassword);
    setSmtpForm({
      host: data.host || '',
      port: data.port != null ? String(data.port) : '587',
      username: data.username || '',
      password: '',
      encryption: data.encryption || 'starttls',
      fromEmail: data.fromEmail || '',
      fromName: data.fromName || '',
    });
  };

  const loadSmtp = useCallback(async () => {
    setSmtpLoading(true);
    try {
      const data = await fetchSmtpSettings();
      applySmtpDto(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load SMTP settings');
    } finally {
      setSmtpLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogo();
    loadSmtp();
  }, [loadLogo, loadSmtp]);

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
      setLogoSettings(data);
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

  const handleRemoveLogo = async () => {
    if (!logoSettings?.hasLogo) return;
    setIsDeleting(true);
    try {
      const data = await deleteCustomerLogo();
      setLogoSettings(data);
      setPreviewUrl(null);
      toast.success('Customer logo removed. Login page will use the default logo.');
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorResponse.response?.data?.error || errorResponse.message || 'Remove failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpSaving(true);
    try {
      const data = await saveSmtpSettings({
        host: smtpForm.host.trim(),
        port: parseInt(smtpForm.port, 10),
        username: smtpForm.username.trim(),
        password: smtpForm.password || undefined,
        encryption: smtpForm.encryption,
        fromEmail: smtpForm.fromEmail.trim(),
        fromName: smtpForm.fromName.trim() || undefined,
      });
      applySmtpDto(data);
      toast.success('SMTP settings saved securely');
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorResponse.response?.data?.error || errorResponse.message || 'Failed to save SMTP settings');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    try {
      const result = await testSmtpSettings({
        host: smtpForm.host.trim() || undefined,
        port: smtpForm.port ? parseInt(smtpForm.port, 10) : undefined,
        username: smtpForm.username.trim() || undefined,
        password: smtpForm.password || undefined,
        encryption: smtpForm.encryption,
        fromEmail: smtpForm.fromEmail.trim() || undefined,
        fromName: smtpForm.fromName.trim() || undefined,
      });
      toast.success(result.message || `Test email sent to ${result.recipient}`);
    } catch (err: unknown) {
      const errorResponse = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(errorResponse.response?.data?.error || errorResponse.message || 'SMTP test failed');
    } finally {
      setSmtpTesting(false);
    }
  };

  const displaySrc = previewUrl || defaultLogo;

  const tabs: { id: ConfigTab; label: string; icon: React.ElementType }[] = [
    { id: 'logo', label: 'Custom Logo', icon: ImagePlus },
    { id: 'smtp', label: 'SMTP Configuration', icon: Mail },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Admin Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage branding and email delivery settings used across the portal.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'logo' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Login page branding</CardTitle>
            <CardDescription>
              PNG, JPEG, WebP, GIF, or SVG up to 5 MB. Replacing the logo overwrites the previous image.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {logoLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
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
                      {logoSettings?.hasLogo
                        ? `Current file: ${logoSettings.originalName || 'customer logo'} · Updated ${logoSettings.updatedAt ? new Date(logoSettings.updatedAt).toLocaleString() : '—'}`
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
                      ) : logoSettings?.hasLogo ? (
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
                    {logoSettings?.hasLogo && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isUploading || isDeleting}
                        onClick={handleRemoveLogo}
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
                    <Button type="button" variant="ghost" size="icon" onClick={loadLogo} title="Refresh">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'smtp' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SMTP email delivery</CardTitle>
            <CardDescription>
              Used to send two-factor authentication codes. The password is encrypted at rest and never shown again after saving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {smtpLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <form onSubmit={handleSaveSmtp} className="space-y-4">
                {smtpConfigured ? (
                  <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    <AlertDescription className="text-xs">
                      SMTP is configured and ready for 2FA email delivery.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <AlertDescription className="text-xs">
                      SMTP is not fully configured yet. Two-factor authentication cannot send codes until these settings are saved.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="smtpHost">SMTP Host <span className="text-destructive">*</span></Label>
                    <Input
                      id="smtpHost"
                      required
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPort">SMTP Port <span className="text-destructive">*</span></Label>
                    <Input
                      id="smtpPort"
                      type="number"
                      required
                      min={1}
                      max={65535}
                      value={smtpForm.port}
                      onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })}
                      placeholder="587"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpEncryption">Encryption / SSL <span className="text-destructive">*</span></Label>
                    <select
                      id="smtpEncryption"
                      value={smtpForm.encryption}
                      onChange={(e) =>
                        setSmtpForm({ ...smtpForm, encryption: e.target.value as SmtpEncryption })
                      }
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="none">None</option>
                      <option value="starttls">STARTTLS (recommended)</option>
                      <option value="ssl">SSL / TLS</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUsername">SMTP Username <span className="text-destructive">*</span></Label>
                    <Input
                      id="smtpUsername"
                      required
                      value={smtpForm.username}
                      onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                      placeholder="noreply@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">
                      SMTP Password{' '}
                      {!hasStoredPassword && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      required={!hasStoredPassword}
                      value={smtpForm.password}
                      onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                      placeholder={hasStoredPassword ? 'Leave blank to keep current password' : '••••••••'}
                      autoComplete="new-password"
                    />
                    {hasStoredPassword && (
                      <p className="text-xs text-muted-foreground">A password is already stored. Enter a new one only to replace it.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpFromEmail">From Email <span className="text-destructive">*</span></Label>
                    <Input
                      id="smtpFromEmail"
                      type="email"
                      required
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                      placeholder="noreply@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpFromName">From Name</Label>
                    <Input
                      id="smtpFromName"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                      placeholder="Cloudgoo Portal"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="submit" disabled={smtpSaving || smtpTesting}>
                    {smtpSaving ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save SMTP settings
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={smtpSaving || smtpTesting}
                    onClick={handleTestSmtp}
                  >
                    {smtpTesting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send test email
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={loadSmtp} title="Refresh">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
