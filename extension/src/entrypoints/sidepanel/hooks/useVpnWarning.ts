import { useEffect, useState } from 'react';
import { checkGeoLocation, geoWarning } from '../../../lib/geo';

export function useVpnWarning(): string | null {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkGeoLocation().then((result) => {
      if (!cancelled) setWarning(geoWarning(result));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return warning;
}
