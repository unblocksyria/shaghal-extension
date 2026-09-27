import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../lib/config';
import { clearRefusedRequests, fakeApi, refusedRequests } from './fakeApi';

// The guard behind spec 0001 AC-9: nothing a test sends may reach a real host.
describe('fakeApi', () => {
  it('refuses a request outside the local API (covers AC-9)', async () => {
    fakeApi().install();

    await expect(fetch('https://api.unblocksyria.com/services/match')).rejects.toThrow(/outside the local API/);
    expect(refusedRequests().map((call) => call.url)).toContain('https://api.unblocksyria.com/services/match');
    clearRefusedRequests();
  });

  it('fails a request no stub answered (covers AC-9)', async () => {
    fakeApi().install();

    const response = await fetch(`${API_BASE}/nothing-here`);
    expect(response.status).toBe(500);
    expect(refusedRequests()).toHaveLength(1);
    clearRefusedRequests();
  });

  it('serves a read endpoint inside the { data } envelope', async () => {
    fakeApi()
      .on('GET', '/things', { data: { a: 1 } })
      .install();

    const response = await fetch(`${API_BASE}/things`);
    expect(await response.json()).toEqual({ data: { a: 1 } });
  });

  it('keeps email addresses out of every fixture (covers AC-9)', () => {
    const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
    const contents = readdirSync(fixtures)
      .map((file) => readFileSync(path.join(fixtures, file), 'utf8'))
      .join('\n');

    expect(contents).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
