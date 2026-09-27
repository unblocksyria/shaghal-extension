import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguagePreference } from '../../lib/i18n';
import { getSavedLanguage, saveEmail, type LanguagePreference } from '../../lib/settings';
import { API_BASE, IS_LOCAL_API } from '../../lib/config';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormShell, hintStyle, useSavedEmail } from './components/FormParts';
import { Check, Monitor, Moon, Sun } from 'lucide-react';

const THEME_ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

export function SettingsView(props: { onBack: () => void }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  // Shown as saved, not as guessed: the row reads the stored pick (spec 0002, AC-1).
  const [language, setLanguage] = useState<LanguagePreference>('system');
  const [email, setEmail] = useSavedEmail();
  const [saved, setSaved] = useState(false);

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

  // The pick applies at once, across the panel, without closing it (spec 0002, AC-1).
  const chooseLanguage = (value: LanguagePreference) => {
    setLanguage(value);
    void setLanguagePreference(value);
  };

  const save = async () => {
    await saveEmail(email);
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
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">{t('settings.appearance')}</span>
        <div
          className="us-seg-container"
          role="radiogroup"
          aria-label={t('settings.appearance')}
          style={{ justifySelf: 'start' }}
        >
          {themes.map(({ value, label }) => {
            const Icon = THEME_ICONS[value];
            return (
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
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="us-label">{t('settings.language')}</span>
        <div
          className="us-seg-container"
          role="radiogroup"
          aria-label={t('settings.language')}
          style={{ justifySelf: 'start' }}
        >
          {languages.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              className={`us-seg-btn ${language === value ? 'active' : ''}`}
              onClick={() => chooseLanguage(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <Input
          label={t('common.yourEmail')}
          type="email"
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

      <div style={{ display: 'grid', gap: 4, borderTop: '1px solid var(--us-border)', paddingTop: 14 }}>
        <span className="us-label">{t('settings.connectedTo')}</span>
        <code style={{ fontSize: 12, color: 'var(--us-accent-text)', wordBreak: 'break-all' }}>{API_BASE}</code>
        <p style={hintStyle}>{IS_LOCAL_API ? t('settings.localApi') : t('settings.liveApi')}</p>
      </div>
    </FormShell>
  );
}
