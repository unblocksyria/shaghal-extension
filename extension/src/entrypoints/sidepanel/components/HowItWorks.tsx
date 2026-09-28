import { useTranslation } from 'react-i18next';
import { cardStyle, hintStyle, titleStyle } from './FormParts';
import { ArrowUp, ClipboardCheck, Globe, PlusCircle, ShieldCheck } from 'lucide-react';

/** Shown on Unblock Syria's own pages, where there is no service to look up. */
export function HowItWorks() {
  const { t } = useTranslation();
  const steps: { icon: typeof Globe; title: string; body: string }[] = [
    { icon: Globe, title: t('howItWorks.checkTitle'), body: t('howItWorks.checkBody') },
    { icon: ArrowUp, title: t('howItWorks.voteTitle'), body: t('howItWorks.voteBody') },
    { icon: ClipboardCheck, title: t('howItWorks.reportTitle'), body: t('howItWorks.reportBody') },
    { icon: PlusCircle, title: t('howItWorks.addTitle'), body: t('howItWorks.addBody') },
  ];
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={titleStyle}>{t('howItWorks.title')}</h1>
        <p style={{ ...hintStyle, fontSize: 13 }}>{t('howItWorks.intro')}</p>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={index} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: 'var(--us-radius-control)',
                border: '1px solid var(--us-border)',
                backgroundColor: 'var(--us-card-nested)',
                color: 'var(--us-accent-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={16} />
            </span>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
              <p style={{ ...hintStyle, fontSize: 13 }}>{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="us-callout" style={{ margin: 0 }}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span style={{ color: 'var(--us-text-muted)' }}>{t('howItWorks.callout')}</span>
      </p>
    </section>
  );
}
