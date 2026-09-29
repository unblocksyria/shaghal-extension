import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, groupShots, readDraft, toShots, writeDraft, type DraftForm } from '../../../lib/drafts';
import type { PendingEvidence } from '../../../lib/evidence';

/** How long typing has to settle before the draft is written. */
const DEBOUNCE_MS = 500;

export interface DraftShotGroup {
  /** The report part these shots hang on, or null for the forms with a single list. */
  partSlug: string | null;
  items: PendingEvidence[];
}

export interface RestoredDraft<F> {
  fields: F;
  shots: DraftShotGroup[];
}

/**
 * Compares a form's state without keeping it. Screenshots are named by id, size
 * and upload claim, since their bytes are not worth stringifying on every render.
 */
function signatureOf<F>(fields: F, shots: DraftShotGroup[]): string {
  const images = shots.map(({ partSlug, items }) => [
    partSlug,
    items.map((item) => `${item.id}|${item.blob.size}|${item.uploadedUrl ?? ''}`),
  ]);
  return JSON.stringify([fields, images]);
}

/**
 * Keeps one form's state in `chrome.storage.session` for as long as the panel
 * is closed, and puts it back when the same form opens for the same service.
 *
 * Only what the tester has touched is written. A form loads parts and an email
 * of its own after it opens, and none of that counts as work: without `markTouched`
 * the panel would store a draft nobody started and then offer to discard it.
 * Writes wait 500 ms for typing to settle, with one flushed when the panel goes
 * away. Deleting is the caller's call: only a successful send or a confirmed
 * discard does it.
 */
export function useDraft<F>(props: {
  form: DraftForm;
  serviceKey: string;
  /** The fields to keep. Read through a signature, so a fresh object per render is fine. */
  fields: F;
  /** The screenshots to keep, grouped by the part they hang on. */
  shots: DraftShotGroup[];
  /** Puts a stored draft back into the form. Called at most once per key. */
  onRestore: (restored: RestoredDraft<F>) => void;
}): { restored: boolean; markTouched: () => void; clear: () => void } {
  const { form, serviceKey } = props;
  const key = `${form}:${serviceKey}`;
  // The form a restored draft belongs to, so a new key opens unmarked.
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  // The key the tester has worked on. Deriving it from the key resets it on a new key.
  const [touchedFor, setTouchedFor] = useState<string | null>(null);
  // Bumped when a read lands, so a change made while it was in flight is written.
  const [loaded, setLoaded] = useState(0);
  const touched = touchedFor === key;
  const ready = useRef(false);
  const finished = useRef(false);
  // The state as the panel opened it, and the last state actually stored.
  const baseline = useRef<string>('');
  const written = useRef<string | null>(null);
  // The current values, for the unload flush which runs outside React's effects.
  const latest = useRef(props);
  const applyRestore = useRef(props.onRestore);
  const touchedNow = useRef(false);

  useEffect(() => {
    latest.current = props;
    applyRestore.current = props.onRestore;
    touchedNow.current = touched;
  });

  // Read once per key. Writes stay off until this lands.
  useEffect(() => {
    let cancelled = false;
    const untouched = signatureOf(latest.current.fields, latest.current.shots);
    baseline.current = untouched;
    ready.current = false;
    finished.current = false;
    written.current = null;
    void readDraft<F>(form, serviceKey).then((draft) => {
      if (cancelled) return;
      ready.current = true;
      // The tester typed while the read was in flight. Their work wins.
      if (draft !== null && signatureOf(latest.current.fields, latest.current.shots) === untouched) {
        applyRestore.current({ fields: draft.fields, shots: groupShots(draft.shots) });
        setRestoredFor(`${form}:${serviceKey}`);
      }
      setLoaded((count) => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [form, serviceKey]);

  const signature = signatureOf(props.fields, props.shots);

  // True while storage does not hold what the form shows. A form nothing has
  // touched since it opened stays out of storage altogether.
  const needsWrite = (current: string): boolean =>
    !finished.current && current !== written.current && !(written.current === null && current === baseline.current);

  useEffect(() => {
    if (!ready.current || !touched || !needsWrite(signature)) return;
    const timer = setTimeout(() => {
      const { fields, shots } = latest.current;
      const current = signatureOf(fields, shots);
      if (!needsWrite(current)) return;
      written.current = current;
      void toShots(shots).then((stored) => writeDraft(latest.current.form, latest.current.serviceKey, fields, stored));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `loaded` re-runs this when a read lands, which may leave work to save.
  }, [signature, form, serviceKey, loaded, touched]);

  // The panel's document is destroyed on close, so the last write has to be
  // offered here. Best effort: losing it costs at most the debounce window.
  useEffect(() => {
    const flush = () => {
      if (!ready.current || !touchedNow.current) return;
      const { form: kind, serviceKey: service, fields, shots } = latest.current;
      const current = signatureOf(fields, shots);
      if (!needsWrite(current)) return;
      written.current = current;
      void toShots(shots).then((stored) => writeDraft(kind, service, fields, stored));
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  const markTouched = useCallback(() => setTouchedFor(key), [key]);

  const clear = useCallback(() => {
    finished.current = true;
    void clearDraft(form, serviceKey);
  }, [form, serviceKey]);

  return { restored: restoredFor === key, markTouched, clear };
}
