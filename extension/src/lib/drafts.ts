import type { PendingEvidence } from './evidence';

/** The form a draft belongs to. Half of the key, so a draft never crosses forms. */
export type DraftForm = 'report' | 'correction' | 'report-service';

/** Bumped when the stored shape changes, so an old record is dropped instead of misread. */
export const DRAFT_SCHEMA = 1;

export interface DraftShot {
  id: string;
  /** The image bytes as they were, so nothing is re encoded on the way back. */
  bytes: ArrayBuffer;
  /** The type the bytes carry, so the upload sends the same content type. */
  type: string;
  filename: string;
  /** The report part this shot hangs on, or null for the forms with a single list. */
  partSlug: string | null;
  uploadedUrl: string | null;
  uploadedAt: number | null;
}

export interface Draft<F> {
  schema: number;
  form: DraftForm;
  serviceKey: string;
  savedAt: number;
  fields: F;
  shots: DraftShot[];
}

/** One record per form and service, in memory only for this extension. */
export function draftKey(form: DraftForm, serviceKey: string): string {
  return `draft:${form}:${serviceKey}`;
}

/**
 * True for an `ArrayBuffer`, whichever realm it came from. A stored draft can
 * arrive from another context, where `instanceof` would say no to real bytes.
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function isShot(value: unknown): value is DraftShot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const shot = value as Record<string, unknown>;
  return (
    typeof shot.id === 'string' &&
    isArrayBuffer(shot.bytes) &&
    typeof shot.type === 'string' &&
    typeof shot.filename === 'string' &&
    (shot.partSlug === null || typeof shot.partSlug === 'string') &&
    (shot.uploadedUrl === null || typeof shot.uploadedUrl === 'string') &&
    (shot.uploadedAt === null || typeof shot.uploadedAt === 'number')
  );
}

/**
 * A record is read only when every part of it is understood. Anything else
 * (unreadable JSON, an unknown `schema`, a shape this build does not know) is
 * discarded silently and the form opens empty, with no error to show a tester.
 */
function isDraft(value: unknown, form: DraftForm, serviceKey: string): value is Draft<unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema === DRAFT_SCHEMA &&
    record.form === form &&
    record.serviceKey === serviceKey &&
    typeof record.savedAt === 'number' &&
    typeof record.fields === 'object' &&
    record.fields !== null &&
    !Array.isArray(record.fields) &&
    Array.isArray(record.shots) &&
    record.shots.every(isShot)
  );
}

/** The stored draft for this form and service, or null when there is none worth using. */
export async function readDraft<F>(form: DraftForm, serviceKey: string): Promise<Draft<F> | null> {
  const key = draftKey(form, serviceKey);
  try {
    const stored = (await chrome.storage.session.get(key))[key];
    if (stored === undefined) return null;
    if (isDraft(stored, form, serviceKey)) return stored as Draft<F>;
    await chrome.storage.session.remove(key).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes the record, shedding the oldest screenshot when storage is full. The
 * fields are written last of all and are never shed: an image may be lost, a
 * typed answer never is. Nothing here surfaces to the tester.
 */
export async function writeDraft<F>(form: DraftForm, serviceKey: string, fields: F, shots: DraftShot[]): Promise<void> {
  const key = draftKey(form, serviceKey);
  const record = { schema: DRAFT_SCHEMA, form, serviceKey, savedAt: Date.now(), fields };
  const put = async (kept: DraftShot[]): Promise<boolean> => {
    try {
      await chrome.storage.session.set({ [key]: { ...record, shots: kept } });
      return true;
    } catch {
      return false;
    }
  };
  // Shed one at a time from the oldest, and stop the moment something fits.
  for (let shed = 0; shed <= shots.length; shed += 1) if (await put(shots.slice(shed))) return;
}

/** Removes the record. Only a successful send or a confirmed discard calls this. */
export async function clearDraft(form: DraftForm, serviceKey: string): Promise<void> {
  await chrome.storage.session.remove(draftKey(form, serviceKey)).catch(() => undefined);
}

/** The screenshot's bytes for storage, in capture order so the oldest is shed first. */
export async function toShots(groups: { partSlug: string | null; items: PendingEvidence[] }[]): Promise<DraftShot[]> {
  const shots: DraftShot[] = [];
  for (const { partSlug, items } of groups)
    for (const item of items)
      shots.push({
        id: item.id,
        bytes: await item.blob.arrayBuffer(),
        type: item.blob.type,
        filename: item.filename,
        partSlug,
        uploadedUrl: item.uploadedUrl ?? null,
        uploadedAt: item.uploadedAt ?? null,
      });
  // Capture ids start with their time in milliseconds, so the earliest is first.
  return shots.sort((a, b) => captureTime(a.id) - captureTime(b.id));
}

function captureTime(id: string): number {
  const time = Number(id.slice(0, id.indexOf('-')));
  return Number.isFinite(time) ? time : 0;
}

/** The stored bytes as a screenshot again, with a fresh preview url. */
export function fromShot(shot: DraftShot): PendingEvidence {
  const blob = new Blob([shot.bytes], { type: shot.type });
  return {
    id: shot.id,
    blob,
    previewUrl: URL.createObjectURL(blob),
    filename: shot.filename,
    ...(shot.uploadedUrl !== null && { uploadedUrl: shot.uploadedUrl }),
    ...(shot.uploadedAt !== null && { uploadedAt: shot.uploadedAt }),
  };
}

/** The stored shots grouped back by the part they hang on, in the order they were stored. */
export function groupShots(shots: DraftShot[]): { partSlug: string | null; items: PendingEvidence[] }[] {
  const groups: { partSlug: string | null; items: PendingEvidence[] }[] = [];
  for (const shot of shots) {
    const found = groups.find((group) => group.partSlug === shot.partSlug);
    const item = fromShot(shot);
    if (found === undefined) groups.push({ partSlug: shot.partSlug, items: [item] });
    else found.items.push(item);
  }
  return groups;
}

/** A stored list of strings, or an empty one when the record held something else. */
export function storedList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** A stored map, or an empty one when the record held something else. */
export function storedRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A stored map of strings, dropping the entries that are not one. */
export function storedStrings(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(storedRecord(value))) if (typeof entry === 'string') out[key] = entry;
  return out;
}
