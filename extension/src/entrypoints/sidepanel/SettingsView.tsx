import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { setLanguagePreference } from '../../lib/i18n';
import { getSavedLanguage, saveEmail, type LanguagePreference } from '../../lib/settings';
import { API_BASE, IS_LOCAL_API } from '../../lib/config';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormShell, hintStyle, useSavedEmail, emailError } from './components/FormParts';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

const THEME_ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

export function SettingsView(props: { onBack: () => void }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  // Reflects the stored preference, not the language it resolves to.
  const [language, setLanguage] = useState<LanguagePreference>('system');
  const [email, setEmail] = useSavedEmail();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSavedLanguage().then((value) => {
      if (!cancelled) setLanguage(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseTheme = (value: ThemePreference) => {
    setTheme(value);
    saveThemePreference(value);
  };

  // Takes effect immediately across the panel.
  const chooseLanguage = (value: LanguagePreference) => {
    setLanguage(value);
    void setLanguagePreference(value);
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
      setError(t('settings.saveFailed'));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('settings.themeSystem') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ];
  const languages: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    { value: 'en', label: t('settings.languageEnglish') },
    { value: 'ar', label: t('settings.languageArabic') },
  ];

  return (
    <FormShell
      backLabel={t('common.back')}
      onBack={props.onBack}
      title={t('settings.title')}
      intro={t('settings.intro')}
      trackDraft={false}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">{t('settings.appearance')}</span>
        <RadioGroup className="us-seg-container" aria-label={t('settings.appearance')} style={{ justifySelf: 'start' }}>
          {themes.map(({ value, label }) => {
            const Icon = THEME_ICONS[value];
            return (
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
            );
          })}
        </RadioGroup>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">{t('settings.language')}</span>
        <RadioGroup className="us-seg-container" aria-label={t('settings.language')} style={{ justifySelf: 'start' }}>
          {languages.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              tabIndex={language === value ? 0 : -1}
              className={`us-seg-btn ${language === value ? 'active' : ''}`}
              onClick={() => chooseLanguage(value)}
            >
              {label}
            </button>
          ))}
        </RadioGroup>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <Input
          label={t('common.yourEmail')}
          type="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('common.emailPlaceholder')}
          helperText={t('settings.emailHelp')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="surface" size="sm" onClick={() => void save()} icon={<Check size={14} />}>
            {t('settings.saveEmail')}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--us-accent-text)' }}>{t('settings.saved')}</span>}
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={hintStyle}>
          {error}
        </p>
      )}
      {import.meta.env.DEV && (
        <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--us-border)', paddingTop: 14 }}>
          <span className="us-label">{t('settings.connectedTo')}</span>
          <code style={{ fontSize: 12, color: 'var(--us-accent-text)', wordBreak: 'break-all' }}>{API_BASE}</code>
          <p style={hintStyle}>{IS_LOCAL_API ? t('settings.localApi') : t('settings.liveApi')}</p>
        </div>
      )}
    </FormShell>
  );
}
