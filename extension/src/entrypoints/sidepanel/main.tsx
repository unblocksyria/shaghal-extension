import { createRoot } from 'react-dom/client';
import { applyThemePreference, readThemePreference } from '../../lib/theme';
import { SidePanelApp } from './SidePanelApp';

applyThemePreference(readThemePreference());

createRoot(document.getElementById('root') as HTMLElement).render(<SidePanelApp />);
