import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScreenshotEditor } from '../../components/editor/ScreenshotEditor';
import { connectToPanel, type EditRequest } from '../../lib/editorWindow';
import { applyStoredLanguage } from '../../lib/i18n';
import { watchSavedLanguage } from '../../lib/settings';

/** How long to wait for the panel to hand over the screenshot. */
const HANDOVER_TIMEOUT_MS = 3000;

/** The editor window: gets its screenshot from the panel that opened it, and sends the result back. */
export function EditorApp() {
  const { t } = useTranslation();
  const [session] = useState(() => new URLSearchParams(location.search).get('session'));
  const [request, setRequest] = useState<EditRequest | null>(null);
  const [lost, setLost] = useState(session === null);
  // The panel let this screenshot go, as when it was removed from the form.
  const [dismissed, setDismissed] = useState(false);
  const panel = useRef<ReturnType<typeof connectToPanel> | null>(null);

  // The panel stays open behind this window, so a language picked there reaches an
  // editor that is already open instead of waiting for the window to be reopened.
  useEffect(() => {
    if (typeof chrome === 'undefined' || chrome.storage === undefined) return;
    void applyStoredLanguage();
    return watchSavedLanguage(() => void applyStoredLanguage());
  }, []);

  useEffect(() => {
    if (session === null) return;
    const connection = connectToPanel(session, setRequest, () => setDismissed(true));
    panel.current = connection;
    const timer = setTimeout(() => setLost(true), HANDOVER_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      connection.close();
    };
  }, [session]);

  useEffect(() => {
    if (request !== null) document.title = t('editor.dialog', { label: request.label });
  }, [request, t]);

  // Runs after the editor has lifted its warning about unsaved edits (its effects
  // run first), so nothing stands in the way of closing.
  useEffect(() => {
    if (dismissed) window.close();
  }, [dismissed]);

  if (request === null) {
    return (
      <div className="us-editor-page us-editor-message">
        {lost && (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <p style={{ margin: 0 }}>{t('editor.gone')}</p>
            <button type="button" className="us-editor-save" onClick={() => window.close()}>
              {t('editor.close')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ScreenshotEditor
      source={request.source}
      edits={request.edits}
      label={request.label}
      guardClose={!dismissed}
      onCancel={() => panel.current?.cancel()}
      onSave={(edited) => panel.current?.save(edited)}
    />
  );
}
