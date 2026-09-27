import { describe, expect, it, vi } from 'vitest';
import { formErrorMessage, apiRequest } from './api';
import { API_BASE, IS_LOCAL_API } from './config';

function stubFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('apiRequest', () => {
  it('tests run against the local API, which needs no human verification', () => {
    expect(IS_LOCAL_API).toBe(true);
  });

  it('unwraps { data } by default and returns the raw body on request', async () => {
    stubFetch(Response.json({ data: { a: 1 } }), Response.json({ success: true }));
    expect(await apiRequest('/x')).toEqual({ ok: true, data: { a: 1 } });
    expect(await apiRequest('/y', { unwrap: 'raw' })).toEqual({ ok: true, data: { success: true } });
  });

  it('sends a JSON body with its content type, and no token to the local API', async () => {
    const fetchMock = stubFetch(Response.json({ data: null }));
    await apiRequest('/services/x/vote', { method: 'POST', body: { a: 1 }, verify: 'vote' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE}/services/x/vote`);
    expect(init?.body).toBe('{"a":1}');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it("returns the API's error code, message and request id", async () => {
    stubFetch(Response.json({ error: 'ALREADY_VOTED', message: 'Already voted', requestId: 'r1' }, { status: 400 }));
    expect(await apiRequest('/x')).toEqual({
      ok: false,
      error: {
        error: 'ALREADY_VOTED',
        message: 'Already voted',
        requestId: 'r1',
        status: 400,
        retryAfterSeconds: undefined,
      },
    });
  });

  it('answers a 429 once, with its Retry-After, instead of waiting it out', async () => {
    const fetchMock = stubFetch(
      Response.json({ error: 'RATE_LIMITED', message: 'Slow down' }, { status: 429, headers: { 'Retry-After': '42' } }),
    );
    const result = await apiRequest('/x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok === false && result.error.retryAfterSeconds).toBe(42);
  });

  it('survives an error page that is not JSON', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const result = await apiRequest('/x');
    expect(result.ok === false && result.error).toMatchObject({
      error: 'UNKNOWN_ERROR',
      message: 'Bad Gateway',
      status: 502,
    });
  });

  it('survives a success that is not JSON', async () => {
    stubFetch(new Response('<html>ok</html>', { status: 200 }));
    const result = await apiRequest('/x');
    expect(result.ok === false && result.error.error).toBe('BAD_RESPONSE');
  });

  it('refuses a success that is not the expected shape, with the status it came with', async () => {
    const expect_ = { check: (data: unknown) => Array.isArray(data), message: 'Not a list.' };
    stubFetch(Response.json({ data: [1] }), Response.json({ data: null }, { status: 201 }));
    expect(await apiRequest('/x', { expect: expect_ })).toEqual({ ok: true, data: [1] });
    expect(await apiRequest('/x', { expect: expect_ })).toEqual({
      ok: false,
      error: { error: 'BAD_RESPONSE', message: 'Not a list.', status: 201 },
    });
  });

  it('tells a network failure from a timeout', async () => {
    stubFetch(new TypeError('Failed to fetch'), new DOMException('timed out', 'TimeoutError'));
    const offline = await apiRequest('/x');
    const slow = await apiRequest('/x');
    expect(offline.ok === false && offline.error).toMatchObject({ error: 'NETWORK_ERROR', status: 0 });
    expect(slow.ok === false && slow.error).toMatchObject({ error: 'TIMEOUT', status: 0 });
  });
});

describe('request safety', () => {
  it('does not follow redirects or send browser credentials', async () => {
    const fetchMock = stubFetch(Response.json({ data: null }));
    await apiRequest('/x');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });
  it('rejects missing data and throwing response validators', async () => {
    stubFetch(Response.json({}), Response.json({ data: {} }));
    expect(await apiRequest('/x')).toMatchObject({ ok: false, error: { error: 'BAD_RESPONSE' } });
    expect(
      await apiRequest('/x', {
        expect: {
          check: () => {
            throw new Error('bad');
          },
          message: 'bad',
        },
      }),
    ).toMatchObject({ ok: false, error: { error: 'BAD_RESPONSE' } });
  });
  it('supports HTTP-date Retry-After and clamps negative delays', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-27T12:00:00Z'));
    stubFetch(
      Response.json({}, { status: 429, headers: { 'Retry-After': 'Sun, 27 Sep 2026 12:01:00 GMT' } }),
      Response.json({}, { status: 429, headers: { 'Retry-After': '-5' } }),
    );
    expect(await apiRequest('/x')).toMatchObject({ ok: false, error: { retryAfterSeconds: 60 } });
    expect(await apiRequest('/x')).toMatchObject({ ok: false, error: { retryAfterSeconds: 0 } });
  });
});

it('explains shared-network cooldowns without losing the draft', () => {
  expect(formErrorMessage({ error: 'RATE_LIMITED', message: 'Limit', status: 429, retryAfterSeconds: 42 })).toContain(
    '42 seconds',
  );
  expect(formErrorMessage({ error: 'RATE_LIMITED', message: 'Limit', status: 429, retryAfterSeconds: 120 })).toContain(
    '2 minutes',
  );
  expect(formErrorMessage({ error: 'RATE_LIMITED', message: 'Limit', status: 429 })).toContain('Keep this panel open');
  expect(formErrorMessage({ error: 'SERVICE_UNAVAILABLE', message: 'Temporarily unavailable', status: 503 })).toBe(
    'Temporarily unavailable',
  );
});
