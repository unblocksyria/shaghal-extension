import { countryName } from '../../../lib/geo';
import { useBrowsingCountry } from '../hooks/useBrowsingCountry';
import { WifiOff } from 'lucide-react';

/**
 * Shown when the connection comes out outside Syria. It warns and never blocks:
 * the check can be wrong, and every report is reviewed anyway.
 */
export function VpnWarning() {
  const location = useBrowsingCountry();
  if (location.country === null || location.country === 'SY') return null;

  return (
    <div className="us-callout us-callout-warning" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        <strong style={{ fontWeight: 600 }}>Turn off your VPN. </strong>
        You seem to be browsing from {countryName(location.country)}, not Syria. A report should show what happens from
        Syria without a VPN.{' '}
        <button
          type="button"
          className="us-text-link"
          onClick={location.recheck}
          disabled={location.checking}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
        >
          {location.checking ? 'Checking…' : 'Check again'}
        </button>
      </span>
    </div>
  );
}
