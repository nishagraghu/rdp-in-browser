import { useEffect, useState } from 'react';
import defaultLogo from '../logo.png';
import { fetchCustomerLogoSettings } from '../api/settings';

/**
 * Resolves the customer logo URL from the API, falling back to the bundled default.
 * Cache-busted via `?v=` from the server when the logo is updated.
 */
export function useCustomerLogo() {
  const [logoSrc, setLogoSrc] = useState<string>(defaultLogo);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchCustomerLogoSettings()
      .then((data) => {
        if (cancelled) return;
        if (data.hasLogo && data.logoUrl) {
          setLogoSrc(data.logoUrl);
        } else {
          setLogoSrc(defaultLogo);
        }
      })
      .catch(() => {
        if (!cancelled) setLogoSrc(defaultLogo);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { logoSrc, isLoading };
}
