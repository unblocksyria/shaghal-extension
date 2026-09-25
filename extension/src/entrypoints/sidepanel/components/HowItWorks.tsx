import { cardStyle, hintStyle, titleStyle } from './FormParts';
import { ArrowUp, ClipboardCheck, Globe, PlusCircle, ShieldCheck } from 'lucide-react';

const STEPS: { icon: typeof Globe; title: string; body: string }[] = [
  { icon: Globe, title: 'Check any site', body: 'Open a website to see if it works from Syria.' },
  { icon: ArrowUp, title: 'Vote', body: 'Tap “I need this” on blocked services.' },
  { icon: ClipboardCheck, title: 'Report what works', body: 'Test it without a VPN and tell us.' },
  { icon: PlusCircle, title: 'Add a missing site', body: 'Not tracked yet? Send it to us.' },
];

/** Shown on Unblock Syria's own pages, where there is no service to look up. */
export function HowItWorks() {
  return (
    <section className="us-animate-fade" style={cardStyle}>
      <div style={{ display: 'grid', gap: 6 }}>
        <h1 style={titleStyle}>How it works</h1>
        <p style={{ ...hintStyle, fontSize: 13 }}>Check and improve what works from Syria, on any site you visit.</p>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
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
        <span style={{ color: 'var(--us-text-muted)' }}>
          No account needed. Only the open tab's address is checked, while this panel is open.
        </span>
      </p>
    </section>
  );
}
