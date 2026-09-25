import { useState } from 'react';
import { saveEmail } from '../../lib/settings';
import { API_BASE, IS_LOCAL_API } from '../../lib/config';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormShell, hintStyle, useSavedEmail } from './components/FormParts';
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

  const chooseTheme = (value: ThemePreference) => {
    setTheme(value);
    saveThemePreference(value);
  };

  const save = async () => {
    await saveEmail(email);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <FormShell backLabel="Back" onBack={props.onBack} title="Settings" intro="Stored only in this browser.">
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">Appearance</span>
        <div className="us-seg-container" role="radiogroup" aria-label="Appearance" style={{ justifySelf: 'start' }}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              className={`us-seg-btn ${theme === value ? 'active' : ''}`}
              onClick={() => chooseTheme(value)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon size={13} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <Input
          label="Your email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="your@email.com"
          helperText="Optional. Filled into every form you send, so volunteers get credit. Never shown."
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="surface" size="sm" onClick={() => void save()} icon={<Check size={14} />}>
            Save email
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--us-accent-text)' }}>Saved</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--us-border)', paddingTop: 14 }}>
        <span className="us-label">Connected to</span>
        <code style={{ fontSize: 12, color: 'var(--us-accent-text)', wordBreak: 'break-all' }}>{API_BASE}</code>
        <p style={hintStyle}>
          {IS_LOCAL_API
            ? 'A local development API. Reports and votes stay on this machine and need no human verification.'
            : 'The live Unblock Syria service. Reports go to the review team.'}
        </p>
      </div>
    </FormShell>
  );
}
