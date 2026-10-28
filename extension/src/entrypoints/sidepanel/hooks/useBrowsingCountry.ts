import { useEffect, useState } from 'react';
import { browsingCountry, knownBrowsingCountry } from '../../../lib/geo';

/**
 * The tester's country. A country checked in the last few minutes shows at
 * once. Syria is trusted for those minutes; any other country is checked
 * again on mount, since turning a VPN off changes it. `recheck` always asks.
 */
export function useBrowsingCountry(): { country: string | null; checking: boolean; recheck: () => void } {
  const [country, setCountry] = useState<string | null>(knownBrowsingCountry);
  const [checking, setChecking] = useState(() => knownBrowsingCountry() === null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const known = knownBrowsingCountry();
    void browsingCountry({ force: attempt > 0 || (known !== null && known !== 'SY') }).then((code) => {
      if (cancelled) return;
      setCountry(code);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const recheck = () => {
    setChecking(true);
    setAttempt((value) => value + 1);
  };

  return { country, checking, recheck };
}
