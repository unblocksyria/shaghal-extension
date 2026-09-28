import { afterEach, beforeEach, vi } from 'vitest';
// Initializes i18next for `useTranslation`, as each entrypoint does.
import '../lib/i18n';
import { clearRefusedRequests, refuseRequest, refusedRequests } from './fakeApi';
import { closeEditorWindow } from '../lib/editorWindow';
import { closeEditorWindows } from './editorWindows';

// The default fetch refuses everything. A test installs fakeApi to answer requests.
beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    refuseRequest(init?.method ?? 'GET', url, 'no fakeApi installed for this test');
    return Promise.reject(new Error(`This test did not stub fetch: ${url}`));
  });
});

// Fail any test that made an unstubbed request or aimed one at a real host.
afterEach(() => {
  const refused = refusedRequests();
  clearRefusedRequests();
  if (refused.length === 0) return;
  const lines = refused.map((call) => `- ${call.method} ${call.url} (${call.reason})`);
  throw new Error(`Requests no fake answered:\n${lines.join('\n')}`);
});

// A capture opens the screenshot editor. Close it so it does not leak into the next test.
afterEach(async () => {
  closeEditorWindow();
  await closeEditorWindows();
});
