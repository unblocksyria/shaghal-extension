// Integration tests over real HTTP: these prove the server.mjs wrapper keeps
// the dispatch's answers intact on the wire, exactly what the panel's fetch
// will receive. Port 8787 is fixed by the feature, so this file must run
// without a dev mock already listening on that port.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The project's test setup replaces global fetch with a refusing stub in a
// beforeEach hook. This file tests the real HTTP surface, so before each test
// it drops the stub (native fetch returns, since unstubAllGlobals unwinds it).
beforeEach(() => {
  vi.unstubAllGlobals();
});

// server.mjs binds its port when imported; wait for it to accept requests.
async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://localhost:8787/functionalities');
      if (r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the mock server never became ready on port 8787. A dev mock may already be running.');
}

await import('./server.mjs');
await ready();

describe('the HTTP wrapper keeps answers intact (AC-2)', () => {
  it('answers the reads with the query string the client sends', async () => {
    for (const path of ['/functionalities?locale=ar', '/categories?locale=en']) {
      const res = await fetch('http://localhost:8787' + path);
      expect(res.status).toBe(200);
      expect(Array.isArray((await res.json()).data)).toBe(true);
    }
  });

  it('answers the service record with a query string too', async () => {
    const res = await fetch('http://localhost:8787/services/netflix?locale=ar');
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe('svc-netflix');
  });

  it('passes a JSON string body through without re-encoding', async () => {
    const res = await fetch('http://localhost:8787/services/netflix/vote', { method: 'POST' });
    const raw = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(raw)).toEqual({ voteCount: expect.any(Number) });
    // A string that arrives pre-encoded would be double encoded into '"..."'.
    expect(raw.trim()).not.toMatch(/^"/);
  });

  it('encodes an object body so the client can parse it', async () => {
    const res = await fetch('http://localhost:8787/corrections', {
      method: 'POST',
      headers: { 'idempotency-key': 'test' },
      body: JSON.stringify({}),
    });
    const answer = await res.json();
    expect(res.status).toBe(200);
    expect(answer.id).toMatch(/^mock-/);
  });

  it('answers the dispatch error shape over the wire', async () => {
    const res = await fetch('http://localhost:8787/services/match', { method: 'POST', body: 'bad' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'malformed body' });
  });
});

describe('CORS, so local pages and the dev build can call the mock (AC-6)', () => {
  it('answers a preflight with 204 and permits the client headers', async () => {
    const res = await fetch('http://localhost:8787/services/match', {
      method: 'OPTIONS',
      headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'idempotency-key' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-headers')).toContain('Idempotency-Key');
  });

  it('sends CORS headers on real answers too', async () => {
    const res = await fetch('http://localhost:8787/categories');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('a busy port fails with a clear message (AC-8)', () => {
  it('the second instance exits 1 and names the escape', async () => {
    let stderr = '';
    let code = null;
    await new Promise((resolve) => {
      const second = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
      });
      second.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      second.on('close', (c) => {
        code = c;
        resolve();
      });
    });
    expect(code).toBe(1);
    expect(stderr).toContain('port 8787 is busy');
    expect(stderr).toContain('npm run dev:mock');
    // the first instance must still answer after the second's failed bind
    const res = await fetch('http://localhost:8787/functionalities');
    expect(res.status).toBe(200);
  });
});
