import { afterEach, beforeEach, vi } from 'vitest';
import { clearRefusedRequests, refuseRequest, refusedRequests } from './fakeApi';
import { closeEditorWindow } from '../lib/editorWindow';
import { closeEditorWindows } from './editorWindows';

// Every test starts with a fetch that refuses everything, so a request can only
// leave through fakeApi, which records what answered it (spec 0001, AC-9).
beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    refuseRequest(init?.method ?? 'GET', url, 'no fakeApi installed for this test');
    return Promise.reject(new Error(`This test did not stub fetch: ${url}`));
  });
});

// Spec 0001 AC-9: a request nothing stubbed, or one aimed at a real host, fails the
// test that made it. Nothing may fall through to the network.
afterEach(() => {
  const refused = refusedRequests();
  clearRefusedRequests();
  if (refused.length === 0) return;
  const lines = refused.map((call) => `- ${call.method} ${call.url} (${call.reason})`);
  throw new Error(`Requests no fake answered:\n${lines.join('\n')}`);
});

// A capture opens the screenshot editor; one left open must not carry into the next test.
afterEach(async () => {
  closeEditorWindow();
  await closeEditorWindows();
});
