import React, { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

const LICENSE_STORAGE_KEY = 'rdp_license_activation';

/** Temporary demo PIN — replace with backend validation later. */
const DEMO_LICENSE_PIN = '1234-5678-9012';

interface StoredLicense {
  licenseKey: string;
  year: string;
  activatedAt: string;
}

function readStoredLicense(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredLicense;
  } catch {
    return null;
  }
}

/** License form panel for use under Admin Configuration (and standalone if needed). */
export const LicenseSettingsPanel: React.FC = () => {
  const [licenseKey, setLicenseKey] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [activated, setActivated] = useState<StoredLicense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActivated(readStoredLicense());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pin = licenseKey.trim();
    const licenseYear = year.trim();

    if (!pin) {
      setError('Please enter a license / PIN code');
      return;
    }
    if (!/^\d{4}$/.test(licenseYear)) {
      setError('Please enter a valid 4-digit year');
      return;
    }

    setIsSubmitting(true);
    try {
      // Temporary client-side check only — no backend yet
      await new Promise((r) => setTimeout(r, 400));

      const normalized = pin.replace(/\s+/g, '').toUpperCase();
      const expected = DEMO_LICENSE_PIN.replace(/\s+/g, '').toUpperCase();
      if (normalized !== expected) {
        setError('Invalid license / PIN code');
        return;
      }

      const record: StoredLicense = {
        licenseKey: pin,
        year: licenseYear,
        activatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(record));
      setActivated(record);
      setLicenseKey('');
      toast.success('License activated successfully');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    setActivated(null);
    toast.success('License cleared');
  };

  return (
    <div className="space-y-4">
      {activated && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              License active for <strong>{activated.year}</strong>
              <span className="text-muted-foreground">
                {' '}
                · activated {new Date(activated.activatedAt).toLocaleString()}
              </span>
            </span>
            <Badge variant="secondary">Active</Badge>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-5 w-5 text-primary" />
            Submit license / PIN
          </CardTitle>
          <CardDescription>
            Temporary UI activation — demo PIN is {DEMO_LICENSE_PIN}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="license-key">License / PIN code</Label>
              <Input
                id="license-key"
                type="text"
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="license-year">Attribution year</Label>
              <Input
                id="license-year"
                type="number"
                min={2000}
                max={2100}
                placeholder="2026"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  'Activate license'
                )}
              </Button>
              {activated && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
