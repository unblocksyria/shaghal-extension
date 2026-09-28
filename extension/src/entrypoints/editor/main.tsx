import { createRoot } from 'react-dom/client';
import { applyStoredLanguage } from '../../lib/i18n';
import { EditorApp } from './EditorApp';
import '../../styles/theme.css';

// The editor is a separate document, so it sets its own direction before first paint.
await applyStoredLanguage();

createRoot(document.getElementById('root') as HTMLElement).render(<EditorApp />);
