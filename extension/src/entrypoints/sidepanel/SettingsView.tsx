import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RadioGroup } from '../../components/ui/RadioGroup';
import { activeLanguage, setLanguagePreference, shortDate, sitePathSegment } from '../../lib/i18n';
import { getSavedLanguage, saveEmail, type LanguagePreference } from '../../lib/settings';
import { API_BASE, IS_FIREFOX, IS_LOCAL_API, SITE_BASE } from '../../lib/config';
import { clearSentHistory, sentHistory, watchSentHistory, type SentEntry } from '../../lib/history';
import { readThemePreference, saveThemePreference, type ThemePreference } from '../../lib/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FormShell, errorStyle, hintStyle, useSavedEmail, emailError } from './components/FormParts';
import { ArrowUpRight, Check, Monitor, Moon, Sun } from 'lucide-react';

const THEME_ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };

/** Where a bug report starts, with the version filled in. */
const BUG_REPORT_URL = 'https://github.com/unblocksyria/shaghal-extension/issues/new?template=bug_report.yml';

/** How many sent items Settings lists. The record keeps more. */
const HISTORY_SHOWN = 10;

const sectionStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  borderTop: '1px solid var(--us-border)',
  paddingTop: 20,
};

/** What this browser has sent, newest first, with a way to forget it. */
function SentList() {
  const { t } = useTranslation();
  const [list, setList] = useState<SentEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void sentHistory().then((value) => {
      if (!cancelled) setList(value);
    });
    const stop = watchSentHistory(setList);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  const siteLanguage = sitePathSegment(activeLanguage());
  const kind = (entry: SentEntry) =>
    entry.kind === 'report'
      ? (entry.parts ?? [])
          .map(
            (part) => `${part.name}: ${part.level === 'working' ? t('report.levelWorking') : t('report.levelFailing')}`,
          )
          .join(' · ')
      : entry.kind === 'correction'
        ? t('settings.sentCorrection')
        : t('settings.sentService');
  return (
    <div style={sectionStyle}>
      <span className="us-label">{t('settings.sentTitle')}</span>
      {list === null ? null : list.length === 0 ? (
        <p style={hintStyle}>{t('settings.sentEmpty')}</p>
      ) : (
        <>
          <p style={hintStyle}>{t('settings.sentHint')}</p>
          <ul style={{ listStyle: 'none', margin: '4px 0', padding: 0, display: 'grid', gap: 12 }}>
            {list.slice(0, HISTORY_SHOWN).map((entry) => (
              <li key={`${entry.at}-${entry.serviceName}`} style={{ display: 'grid' }}>
                <span style={{ fontSize: 'var(--us-text-md)', lineHeight: '20px', fontWeight: 500 }}>
                  {entry.serviceSlug !== undefined ? (
                    <a
                      className="us-text-link"
                      href={`${SITE_BASE}${siteLanguage}/services/${encodeURIComponent(entry.serviceSlug)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {entry.serviceName}
                    </a>
                  ) : (
                    entry.serviceName
                  )}
                </span>
                <span style={hintStyle}>
                  {shortDate(new Date(entry.at).toISOString())}
                  {' · '}
                  {kind(entry)}
                </span>
              </li>
            ))}
          </ul>
          <Button variant="surface" size="sm" onClick={() => void clearSentHistory()} style={{ justifySelf: 'start' }}>
            {t('settings.sentClear')}
          </Button>
        </>
      )}
    </div>
  );
}

function manifestVersion(): string | undefined {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return undefined;
  }
}

/** The version, the shortcut and where to report a bug (issue 40). */
function AboutSection() {
  const { t } = useTranslation();
  const version = manifestVersion();
  const [shortcut, setShortcut] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(() => chrome.commands.getAll())
      .then((commands) => {
        if (cancelled) return;
        const action = commands.find((command) => command.name === '_execute_action');
        setShortcut(action?.shortcut ? action.shortcut : null);
      })
      .catch(() => {
        if (!cancelled) setShortcut(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // Firefox can open its shortcut settings only from release 137; older ones get the add-ons page hint instead.
  const firefoxCommands = chrome.commands as typeof chrome.commands & { openShortcutSettings?: () => Promise<void> };
  const canChange = !IS_FIREFOX || typeof firefoxCommands?.openShortcutSettings === 'function';
  const changeShortcut = () => {
    if (IS_FIREFOX) void firefoxCommands.openShortcutSettings?.();
    else void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };
  const bugUrl = version === undefined ? BUG_REPORT_URL : `${BUG_REPORT_URL}&version=${encodeURIComponent(version)}`;
  return (
    <div style={sectionStyle}>
      <span className="us-label">{t('settings.about')}</span>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'max-content minmax(0, 1fr)',
          alignItems: 'baseline',
          gap: '8px 16px',
          fontSize: 'var(--us-text-sm)',
          lineHeight: '20px',
        }}
      >
        <dt style={{ color: 'var(--us-text-muted)' }}>{t('settings.version')}</dt>
        <dd style={{ margin: 0 }}>
          <bdi dir="ltr">{version ?? '—'}</bdi>
        </dd>
        <dt style={{ color: 'var(--us-text-muted)' }}>{t('settings.shortcut')}</dt>
        <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
          {shortcut === undefined ? null : shortcut === null ? (
            t('settings.shortcutNone')
          ) : (
            <kbd dir="ltr" className="us-kbd">
              {shortcut}
            </kbd>
          )}
          {canChange ? (
            <button type="button" className="us-text-link" onClick={changeShortcut}>
              {t('settings.shortcutChange')}
            </button>
          ) : (
            <span style={hintStyle}>{t('settings.shortcutFirefoxHint')}</span>
          )}
        </dd>
      </dl>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 4 }}>
        <a
          className="us-link"
          href={`${SITE_BASE}${sitePathSegment(activeLanguage())}/privacy`}
          target="_blank"
          rel="noreferrer"
        >
          {t('settings.privacy')} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <a className="us-link" href={bugUrl} target="_blank" rel="noreferrer">
          {t('settings.reportBug')} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

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
    { value: 'ku', label: t('settings.languageKurdish') },
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
                <Icon size={14} aria-hidden="true" /> {label}
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
          dir="ltr"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('common.emailPlaceholder')}
          helperText={t('settings.emailHelp')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="surface" size="sm" onClick={() => void save()} icon={<Check size={14} aria-hidden="true" />}>
            {t('settings.saveEmail')}
          </Button>
          <div aria-live="polite" style={{ display: 'contents' }}>
            {saved && <span style={{ ...hintStyle, color: 'var(--us-accent-text)' }}>{t('settings.saved')}</span>}
          </div>
        </div>
      </div>

      {error !== null && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      <SentList />
      <AboutSection />
      {import.meta.env.DEV && (
        <div style={sectionStyle}>
          <span className="us-label">{t('settings.connectedTo')}</span>
          <code style={{ fontSize: 'var(--us-text-xs)', color: 'var(--us-accent-text)', wordBreak: 'break-all' }}>
            {API_BASE}
          </code>
          <p style={hintStyle}>{IS_LOCAL_API ? t('settings.localApi') : t('settings.liveApi')}</p>
        </div>
      )}
    </FormShell>
  );
}
