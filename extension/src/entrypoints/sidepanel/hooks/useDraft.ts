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
 * Compares a form's state without keeping it. Screenshots are named by id, size,
 * upload claim and edits, since their bytes are not worth stringifying on every
 * render: the edits say what the bytes are, so a re-encode that happens to land
 * on the same size still counts as a change.
 */
function signatureOf<F>(fields: F, shots: DraftShotGroup[]): string {
  const images = shots.map(({ partSlug, items }) => [
    partSlug,
    items.map(
      (item) =>
        `${item.id}|${item.blob.size}|${item.uploadedUrl ?? ''}|${item.edits === undefined ? '' : JSON.stringify(item.edits)}`,
    ),
  ]);
  return JSON.stringify([fields, images]);
}

/**
 * Keeps one form's state in `chrome.storage.session` for as long as the panel
 * is closed, and puts it back when the same form opens for the same service.
 *
 * Only what the tester has touched counts as work. A form loads parts and an email
 * of its own after it opens, and none of that counts as work: without `markTouched`
 * the panel would store a draft nobody started and then offer to discard it. The
 * same signal decides the other way around: a stored draft goes back only while
 * the tester has not touched the form.
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
  // Bumped by every scheduled save and by a discard, so a save still in flight
  // never commits work that a newer save replaced or that was thrown away.
  const generation = useRef(0);
  // Storage work in one queue: an older snapshot can then never land after a
  // newer one, and a discard waits for the save in flight to finish before it
  // drops the record.
  const queue = useRef<Promise<void>>(Promise.resolve());
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

  const run = useCallback((task: () => Promise<void>): void => {
    queue.current = queue.current.then(task, task).catch(() => undefined);
  }, []);

  // Queues one save. The generation token is checked before the bytes are read
  // and once more before the write, so a save overtaken by a later one or by a
  // discard leaves nothing behind.
  const save = useCallback(
    (kind: DraftForm, service: string, fields: F, shots: DraftShotGroup[]): void => {
      generation.current += 1;
      const token = generation.current;
      run(async () => {
        if (token !== generation.current) return;
        const stored = await toShots(shots);
        if (token !== generation.current) return;
        await writeDraft(kind, service, fields, stored);
      });
    },
    [run],
  );

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
      // Only the tester's own work beats a stored draft. The form loads parts
      // and a saved email on its own once it opens, and if either landed before
      // this read, comparing fields would throw the draft away.
      if (draft !== null && !touchedNow.current) {
        const shots = groupShots(draft.shots);
        applyRestore.current({ fields: draft.fields, shots });
        // Storage already holds exactly this, so a form put back to its opening
        // state is a change the next write has to catch up with.
        written.current = signatureOf(draft.fields, shots);
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
      const { form: kind, serviceKey: service, fields, shots } = latest.current;
      const current = signatureOf(fields, shots);
      if (!needsWrite(current)) return;
      written.current = current;
      save(kind, service, fields, shots);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `loaded` re-runs this when a read lands, which may leave work to save.
  }, [signature, form, serviceKey, loaded, touched, save]);

  // The panel's document is destroyed on close, so the last write has to be
  // offered here. Best effort: losing it costs at most the debounce window.
  useEffect(() => {
    const flush = () => {
      if (!ready.current || !touchedNow.current) return;
      const { form: kind, serviceKey: service, fields, shots } = latest.current;
      const current = signatureOf(fields, shots);
      if (!needsWrite(current)) return;
      written.current = current;
      save(kind, service, fields, shots);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [save]);

  const markTouched = useCallback(() => {
    touchedNow.current = true; // the read landing may beat React's re-render
    setTouchedFor(key);
  }, [key]);

  const clear = useCallback(() => {
    finished.current = true;
    generation.current += 1; // a save already in flight must not commit
    run(() => clearDraft(form, serviceKey));
  }, [form, serviceKey, run]);

  return { restored: restoredFor === key, markTouched, clear };
}
