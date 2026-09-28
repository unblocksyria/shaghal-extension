import { useTranslation } from 'react-i18next';
import { ShieldOff } from 'lucide-react';
import { useHostAccess } from '../hooks/useHostAccess';

/** Shown while the extension may not reach websites, with a button that asks for the access again. */
export function HostAccessNotice() {
  const { t } = useTranslation();
  const access = useHostAccess();
  if (access.granted) return null;

  return (
    <div className="us-callout us-callout-warning" role="status">
      <ShieldOff size={16} aria-hidden="true" />
      <span>
        <strong style={{ fontWeight: 600 }}>{t('hostAccess.title')} </strong>
        {t('hostAccess.body')}{' '}
        <button
          type="button"
          className="us-text-link"
          onClick={access.request}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
        >
          {t('hostAccess.allow')}
        </button>
      </span>
    </div>
  );
}
