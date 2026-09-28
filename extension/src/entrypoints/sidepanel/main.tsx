import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { applyStoredLanguage, i18next } from '../../lib/i18n';
import { applyThemePreference, readThemePreference } from '../../lib/theme';
import { SidePanelApp } from './SidePanelApp';

applyThemePreference(readThemePreference());

// The language decides the direction, so it lands before the first paint.
await applyStoredLanguage();

createRoot(document.getElementById('root') as HTMLElement).render(
  <I18nextProvider i18n={i18next}>
    <SidePanelApp />
  </I18nextProvider>,
);
