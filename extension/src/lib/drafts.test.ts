import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { stubSession } from '../testing/session';
import { DRAFT_SCHEMA, clearDraft, draftKey, groupShots, readDraft, toShots, writeDraft } from './drafts';
import type { PendingEvidence } from './evidence';

beforeEach(() => {
  fakeBrowser.reset();
  vi.stubGlobal('chrome', fakeBrowser);
  stubSession();
  // Node has no object urls, and reading a draft builds previews from them.
  URL.createObjectURL = vi.fn(() => 'blob:draft');
  URL.revokeObjectURL = vi.fn();
});

/** A screenshot with bytes that survive the trip. The id carries its capture time. */
const evidence = (id: string, bytes: number[] = [1, 2, 3]): PendingEvidence => ({
  id,
  blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }),
  previewUrl: `blob:${id}`,
  filename: `${id}.jpg`,
  uploadedUrl: `https://cdn.example/${id}.jpg`,
  uploadedAt: 1_700_000_000_000,
});

const bytesOf = (buffer: ArrayBuffer | undefined): number[] =>
  buffer === undefined ? [] : Array.from(new Uint8Array(buffer));

describe('a draft that fits', () => {
  it('comes back with its fields, its shot bytes and the upload it already paid for', async () => {
    const shots = await toShots([
      { partSlug: 'core_use', items: [evidence('1700000000000-a', [9, 8])] },
      { partSlug: 'landing_page', items: [evidence('1700000001000-b', [7])] },
    ]);
    await writeDraft('report', 'svc-1', { notes: { core_use: 'Opens.' } }, shots);

    const draft = await readDraft<{ notes: Record<string, string> }>('report', 'svc-1');
    expect(draft?.schema).toBe(DRAFT_SCHEMA);
    expect(draft?.form).toBe('report');
    expect(draft?.serviceKey).toBe('svc-1');
    expect(draft?.fields).toEqual({ notes: { core_use: 'Opens.' } });
    expect(draft?.shots).toHaveLength(2);
    expect(draft?.shots[0]).toMatchObject({
      id: '1700000000000-a',
      type: 'image/jpeg',
      filename: '1700000000000-a.jpg',
      partSlug: 'core_use',
      uploadedUrl: 'https://cdn.example/1700000000000-a.jpg',
      uploadedAt: 1_700_000_000_000,
    });
    expect(bytesOf(draft?.shots[0]?.bytes)).toEqual([9, 8]);
    expect(bytesOf(draft?.shots[1]?.bytes)).toEqual([7]);
    expect(draft?.shots[0]?.bytes).toBeInstanceOf(ArrayBuffer);
  });

  it('regroups the stored shots by the part they hang on, preview urls rebuilt', async () => {
    await writeDraft(
      'report',
      'svc-1',
      {},
      await toShots([
        { partSlug: 'core_use', items: [evidence('1700000000000-a')] },
        { partSlug: null, items: [evidence('1700000001000-b'), evidence('1700000002000-c')] },
      ]),
    );

    const draft = await readDraft('report', 'svc-1');
    const groups = groupShots(draft?.shots ?? []);
    expect(groups.map((group) => group.partSlug)).toEqual(['core_use', null]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(3);
    expect(groups.flatMap((group) => group.items).map((item) => item.previewUrl)).toEqual([
      'blob:draft',
      'blob:draft',
      'blob:draft',
    ]);
    expect(groups.flatMap((group) => group.items).map((item) => item.uploadedUrl)).toEqual([
      'https://cdn.example/1700000000000-a.jpg',
      'https://cdn.example/1700000001000-b.jpg',
      'https://cdn.example/1700000002000-c.jpg',
    ]);
  });

  it('is keyed by form and service, so another service opens with nothing stored', async () => {
    await writeDraft('report', 'svc-1', { notes: 'A' }, []);
    expect((await readDraft('report', 'svc-2'))?.fields).toBeUndefined();
    expect(await readDraft('correction', 'svc-1')).toBeNull();
    expect(await readDraft('report', 'svc-1')).not.toBeNull();
  });

  it('is removed on request', async () => {
    await writeDraft('report-service', 'https://example.com', { name: 'Example' }, []);
    expect(await chrome.storage.session.get(null)).toHaveProperty(draftKey('report-service', 'https://example.com'));
    await clearDraft('report-service', 'https://example.com');
    expect(await chrome.storage.session.get(null)).toEqual({});
  });
});

describe('a record this build cannot use', () => {
  it.each([
    ['unreadable json', 'not json at all'],
    ['an unknown schema', { schema: 99, form: 'report', serviceKey: 'svc-1', savedAt: 1, fields: {}, shots: [] }],
    [
      'a record for another form',
      { schema: 1, form: 'correction', serviceKey: 'svc-1', savedAt: 1, fields: {}, shots: [] },
    ],
    [
      'fields that are not an object',
      { schema: 1, form: 'report', serviceKey: 'svc-1', savedAt: 1, fields: 7, shots: [] },
    ],
    [
      'a shot without bytes',
      {
        schema: 1,
        form: 'report',
        serviceKey: 'svc-1',
        savedAt: 1,
        fields: {},
        shots: [{ id: 'a', bytes: 'oops', type: 'image/jpeg', filename: 'a.jpg', partSlug: null }],
      },
    ],
    ['shots that are not a list', { schema: 1, form: 'report', serviceKey: 'svc-1', savedAt: 1, fields: {}, shots: 3 }],
  ])('opens the form empty when it holds %s, and forgets it', async (_label, stored) => {
    await chrome.storage.session.set({ [draftKey('report', 'svc-1')]: stored });
    expect(await readDraft('report', 'svc-1')).toBeNull();
    // Silently: the bad record is gone rather than offered again next time.
    expect(await chrome.storage.session.get(null)).toEqual({});
  });
});

describe('storage that runs out of room', () => {
  it('sheds the oldest screenshot, keeps every field, and does not tell the tester', async () => {
    const shots = await toShots([
      {
        partSlug: null,
        items: [evidence('1700000000000-oldest'), evidence('1700000009000-newest'), evidence('1700000005000-middle')],
      },
    ]);
    const set = vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'));

    await expect(writeDraft('report', 'svc-1', { notes: 'Kept.' }, shots)).resolves.toBeUndefined();

    const draft = await readDraft<{ notes: string }>('report', 'svc-1');
    expect(draft?.fields).toEqual({ notes: 'Kept.' });
    expect(draft?.shots.map((shot) => shot.id)).toEqual(['1700000005000-middle', '1700000009000-newest']);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('keeps the fields alone when shedding one shot is still not enough', async () => {
    const shots = await toShots([
      { partSlug: null, items: [evidence('1700000000000-a'), evidence('1700000001000-b')] },
    ]);
    vi.spyOn(chrome.storage.session, 'set')
      .mockRejectedValueOnce(new Error('quota'))
      .mockRejectedValueOnce(new Error('quota'));

    await writeDraft('correction', 'svc-1', { selected: ['url'] }, shots);

    const draft = await readDraft<{ selected: string[] }>('correction', 'svc-1');
    expect(draft?.fields).toEqual({ selected: ['url'] });
    expect(draft?.shots).toEqual([]);
  });

  it('gives up quietly when even the fields alone do not fit', async () => {
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValue(new Error('quota'));
    await expect(writeDraft('report', 'svc-1', { notes: 'Typed.' }, [])).resolves.toBeUndefined();
    expect(await readDraft('report', 'svc-1')).toBeNull();
  });

  it('gives up quietly when reading storage itself fails', async () => {
    vi.spyOn(chrome.storage.session, 'get').mockRejectedValueOnce(new Error('gone'));
    await expect(readDraft('report', 'svc-1')).resolves.toBeNull();
  });
});
