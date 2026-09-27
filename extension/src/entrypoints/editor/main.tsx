import { createRoot } from 'react-dom/client';
import { EditorApp } from './EditorApp';
import '../../styles/theme.css';

createRoot(document.getElementById('root') as HTMLElement).render(<EditorApp />);
