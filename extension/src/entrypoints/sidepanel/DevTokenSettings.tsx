import { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { isTurnstileSkipped, setTurnstileSkipped, writeDevToken } from '../../lib/turnstile';
import { getSavedEmail, saveEmail } from '../../lib/settings';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Card } from '../../components/ui/Card';
import { ArrowLeft, Check, KeyRound, ShieldAlert, AtSign } from 'lucide-react';

export function DevTokenSettings(props: { onBack: () => void }) {
  const [token, setToken] = useState('');
  const [skipped, setSkipped] = useState(false);
  const [saved, setSaved] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    void isTurnstileSkipped().then(setSkipped);
    void getSavedEmail().then(setEmail);
  }, []);

  const saveToken = async () => {
    await writeDevToken(token.trim());
    await saveEmail(email);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const toggleSkip = async (next: boolean) => {
    setSkipped(next);
    await setTurnstileSkipped(next);
  };

  return (
    <section className="us-animate-fade" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={props.onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--us-text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--us-text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--us-text-muted)')}
        >
          <ArrowLeft size={16} /> Back to testing
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={18} color="var(--us-gold)" />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--us-text-primary)' }}>
          Turnstile & Tester Settings
        </h2>
      </div>

      {/* Dev Mode Skip Toggle Card with Radix Switch */}
      <Card variant="nested" padding="md">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--us-text-primary)' }}>
              Skip Turnstile (Dev Mode)
            </span>
            <span style={{ fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.5 }}>
              Sends requests without token. Allows browsing and checking data. The API will require a
              valid tester token to accept submissions.
            </span>
          </div>
          <Switch.Root
            checked={skipped}
            onCheckedChange={(checked) => void toggleSkip(checked)}
            style={{
              all: 'unset',
              width: 42,
              height: 24,
              backgroundColor: skipped ? 'var(--us-gold)' : 'rgba(255, 255, 255, 0.15)',
              borderRadius: '9999px',
              position: 'relative',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
              transition: 'background-color 0.15s ease',
              flexShrink: 0,
            }}
          >
            <Switch.Thumb
              style={{
                display: 'block',
                width: 18,
                height: 18,
                backgroundColor: skipped ? 'var(--us-dark-green)' : '#FFFFFF',
                borderRadius: '9999px',
                transition: 'transform 0.15s ease',
                transform: skipped ? 'translateX(20px)' : 'translateX(3px)',
                willChange: 'transform',
              }}
            />
          </Switch.Root>
        </div>
      </Card>

      {/* Tester email (used across all reports) */}
      <Card variant="default" padding="md" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AtSign size={15} color="var(--us-text-muted)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--us-text-primary)' }}>Your Email</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.5 }}>
          Saved once and pre-filled in every report so you can skip typing it each time:
        </p>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tester@example.com"
        />
      </Card>

      {/* Manual Token Fallback */}
      <Card variant="default" padding="md" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={15} color="var(--us-text-muted)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--us-text-primary)' }}>
            Manual Token / Tester Key
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--us-text-muted)', lineHeight: 1.5 }}>
          Paste a pre-generated Turnstile token or tester bypass header provided by the team:
        </p>
        <Textarea
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="0.xxxx.yyyy... or tester secret key"
          rows={3}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Button variant="gold" size="sm" onClick={() => void saveToken()} icon={<Check size={14} />}>
            Save Token
          </Button>
          {saved && (
            <span style={{ fontSize: 12, color: 'var(--us-working)', fontWeight: 500 }}>
              Token saved to local storage
            </span>
          )}
        </div>
      </Card>

      <Button variant="surface" size="md" onClick={props.onBack} fullWidth>
        Done
      </Button>
    </section>
  );
}
