import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { hydrateReadCaches } from '../../lib/cache';
import { preconnect } from '../../lib/preconnect';
import { applyStoredLanguage, i18next } from '../../lib/i18n';
import { applyThemePreference, readThemePreference } from '../../lib/theme';
import { SidePanelApp } from './SidePanelApp';

applyThemePreference(readThemePreference());
preconnect();

// The language sets the text direction, so apply it before first paint. The
// kept answers let a reopened panel draw the card without waiting on the API.
await Promise.all([applyStoredLanguage(), hydrateReadCaches()]);

createRoot(document.getElementById('root') as HTMLElement).render(
  <I18nextProvider i18n={i18next}>
    <SidePanelApp />
  </I18nextProvider>,
);
