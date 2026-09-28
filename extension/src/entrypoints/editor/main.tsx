import { createRoot } from 'react-dom/client';
import { applyStoredLanguage } from '../../lib/i18n';
import { EditorApp } from './EditorApp';
import '../../styles/theme.css';

// Its own document, so it sets its own direction before the first paint.
await applyStoredLanguage();

createRoot(document.getElementById('root') as HTMLElement).render(<EditorApp />);
