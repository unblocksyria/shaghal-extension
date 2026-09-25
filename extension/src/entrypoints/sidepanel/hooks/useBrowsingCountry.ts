import { useEffect, useState } from 'react';
import { browsingCountry } from '../../../lib/geo';

/** The tester's country, checked when the form opens and again on `recheck`. */
export function useBrowsingCountry(): { country: string | null; checking: boolean; recheck: () => void } {
  const [country, setCountry] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void browsingCountry().then((code) => {
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
