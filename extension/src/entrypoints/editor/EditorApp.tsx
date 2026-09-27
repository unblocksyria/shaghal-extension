import { useEffect, useRef, useState } from 'react';
import { ScreenshotEditor } from '../../components/editor/ScreenshotEditor';
import { connectToPanel, type EditRequest } from '../../lib/editorWindow';

/** How long to wait for the panel to hand over the screenshot. */
const HANDOVER_TIMEOUT_MS = 3000;

/** The editor window: gets its screenshot from the panel that opened it, and sends the result back. */
export function EditorApp() {
  const [session] = useState(() => new URLSearchParams(location.search).get('session'));
  const [request, setRequest] = useState<EditRequest | null>(null);
  const [lost, setLost] = useState(session === null);
  const panel = useRef<ReturnType<typeof connectToPanel> | null>(null);

  useEffect(() => {
    if (session === null) return;
    const connection = connectToPanel(session, setRequest);
    panel.current = connection;
    const timer = setTimeout(() => setLost(true), HANDOVER_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      connection.close();
    };
  }, [session]);

  useEffect(() => {
    if (request !== null) document.title = `Edit ${request.label}`;
  }, [request]);

  if (request === null) {
    return (
      <div className="us-editor-page us-editor-message">
        {lost && (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <p style={{ margin: 0 }}>
              This screenshot is no longer open in the panel. Close this window and try again.
            </p>
            <button type="button" className="us-editor-save" onClick={() => window.close()}>
              Close
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
      guardClose
      onCancel={() => panel.current?.cancel()}
      onSave={(edited) => panel.current?.save(edited)}
    />
  );
}
