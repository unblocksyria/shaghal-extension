import { useTranslation } from 'react-i18next';
import { countryName } from '../../../lib/geo';
import { activeLanguage, intlLocale } from '../../../lib/i18n';
import { useBrowsingCountry } from '../hooks/useBrowsingCountry';
import { WifiOff } from 'lucide-react';

/**
 * Shown when the connection comes out outside Syria. It warns and never blocks:
 * the check can be wrong, and every report is reviewed anyway.
 */
export function VpnWarning() {
  const { t } = useTranslation();
  const location = useBrowsingCountry();
  if (location.country === null || location.country === 'SY') return null;
  const locale = intlLocale(activeLanguage());

  return (
    <div className="us-callout us-callout-warning" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        <strong style={{ fontWeight: 600 }}>{t('vpn.turnOff')} </strong>
        {t('vpn.body', { country: countryName(location.country, locale) })}{' '}
        <button
          type="button"
          className="us-text-link"
          onClick={location.recheck}
          disabled={location.checking}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
        >
          {location.checking ? t('vpn.checking') : t('vpn.checkAgain')}
        </button>
      </span>
    </div>
  );
}
