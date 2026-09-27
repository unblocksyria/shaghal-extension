import { RadioGroup } from '../../components/ui/RadioGroup';
import { useState } from 'react';
import { saveEmail } from '../../lib/settings';
import { API_BASE, IS_LOCAL_API } from '../../lib/config';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormShell, hintStyle, useSavedEmail, emailError } from './components/FormParts';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function SettingsView(props: { onBack: () => void }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [email, setEmail] = useSavedEmail();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseTheme = (value: ThemePreference) => {
    setTheme(value);
    saveThemePreference(value);
  };

  const save = async () => {
    const invalidEmail = emailError(email);
    if (invalidEmail !== null) {
      setError(invalidEmail);
      return;
    }
    setError(null);
    try {
      await saveEmail(email);
    } catch {
      setError('Could not save your email. Try again.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <FormShell backLabel="Back" onBack={props.onBack} title="Settings" intro="Stored only in this browser.">
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">Appearance</span>
        <RadioGroup className="us-seg-container" aria-label="Appearance" style={{ justifySelf: 'start' }}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              tabIndex={theme === value ? 0 : -1}
              className={`us-seg-btn ${theme === value ? 'active' : ''}`}
              onClick={() => chooseTheme(value)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon size={13} aria-hidden="true" /> {label}
            </button>
          ))}
        </RadioGroup>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <Input
          label="Your email"
          type="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your@email.com"
          helperText="Optional. Prefills forms and credits your volunteer profile. Never shown publicly. Clear and save to forget it."
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="surface" size="sm" onClick={() => void save()} icon={<Check size={14} />}>
            Save email
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--us-accent-text)' }}>Saved</span>}
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={hintStyle}>
          {error}
        </p>
      )}
      {import.meta.env.DEV && (
        <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--us-border)', paddingTop: 14 }}>
          <span className="us-label">Connected to</span>
          <code style={{ fontSize: 12, color: 'var(--us-accent-text)', wordBreak: 'break-all' }}>{API_BASE}</code>
          <p style={hintStyle}>
            {IS_LOCAL_API
              ? 'A local development API. Reports and votes stay on this machine and need no human verification.'
              : 'The live Unblock Syria service. Reports go to the review team.'}
          </p>
        </div>
      )}
    </FormShell>
  );
}
