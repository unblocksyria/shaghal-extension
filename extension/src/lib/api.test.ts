import { describe, expect, it, vi } from 'vitest';
import { apiErrorMessage, formErrorMessage, apiRequest } from './api';
import { API_BASE, IS_LOCAL_API } from './config';
import { applyLanguage, i18next } from './i18n';

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
  it.each([
    ['HTML', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    ['missing message', () => Response.json({ error: 'UPSTREAM_ERROR' }, { status: 502 })],
    ['blank message', () => Response.json({ message: '  ' }, { status: 502 })],
  ])('explains an HTTP/2 %s error without a status text', async (_name, response) => {
    stubFetch(response());
    const result = await apiRequest('/x');
    expect(result.ok === false && result.error.message).toBe(
      'The server answered with an error (502). Try again in a moment.',
    );
  });

  it('translates a message-less error into Arabic', async () => {
    await i18next.changeLanguage('ar');
    try {
      stubFetch(Response.json({}, { status: 503 }));
      const result = await apiRequest('/x');
      expect(result.ok === false && result.error.message).toBe('أجاب الخادم بخطأ (503). حاول مجدداً بعد قليل.');
    } finally {
      await i18next.changeLanguage('en');
    }
  });

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
      message: 'The server answered with an error (502). Try again in a moment.',
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

  it('warns that a lost write may have arrived, but not a lost read sent as POST', async () => {
    stubFetch(
      new TypeError('Failed to fetch'),
      new TypeError('Failed to fetch'),
      new DOMException('timed out', 'TimeoutError'),
      new DOMException('timed out', 'TimeoutError'),
    );
    const read = await apiRequest('/services/match', { method: 'POST', body: {} });
    const write = await apiRequest('/services/x/vote', { method: 'POST', write: true });
    const slowRead = await apiRequest('/services/match', { method: 'POST', body: {} });
    const slowWrite = await apiRequest('/services/x/vote', { method: 'POST', write: true });
    expect(read.ok === false && read.error.message).toBe('Could not reach Unblock Syria. Check your connection.');
    expect(write.ok === false && write.error.message).toMatch(/may have arrived/);
    expect(slowRead.ok === false && slowRead.error.message).toBe('Unblock Syria took too long to answer. Try again.');
    expect(slowWrite.ok === false && slowWrite.error.message).toMatch(/may have arrived/);
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

it('writes the Arabic dual in a shared-network cooldown', () => {
  applyLanguage('ar');
  try {
    const message = formErrorMessage({ error: 'RATE_LIMITED', message: 'Limit', status: 429, retryAfterSeconds: 120 });
    expect(message).toContain('بعد دقيقتين.');
    expect(message).not.toMatch(/[A-Za-z]/);
  } finally {
    applyLanguage('en');
  }
});

describe('visible request references', () => {
  const error = { error: 'UPSTREAM_ERROR', message: 'Try again.', status: 502, requestId: 'request-123' };

  it('keeps the server reference in ordinary and cooldown form errors', () => {
    expect(apiErrorMessage(error)).toBe('Try again. Reference: request-123');
    expect(formErrorMessage(error)).toBe('Try again. Reference: request-123');
    expect(formErrorMessage({ ...error, status: 429 })).toContain('Reference: request-123');
  });

  it('omits empty references', () => {
    expect(apiErrorMessage({ ...error, requestId: '  ' })).toBe('Try again.');
    expect(apiErrorMessage({ ...error, requestId: undefined })).toBe('Try again.');
  });

  it('translates the reference label into Arabic', async () => {
    await i18next.changeLanguage('ar');
    try {
      expect(apiErrorMessage(error)).toBe('Try again. المرجع: request-123');
    } finally {
      await i18next.changeLanguage('en');
    }
  });
});

describe('answers the panel cannot read', () => {
  it('ignores a Retry-After that is neither seconds nor a date, and cools down for a minute', async () => {
    stubFetch(
      Response.json(
        { error: 'RATE_LIMITED', message: 'Slow down' },
        { status: 429, headers: { 'Retry-After': 'soon' } },
      ),
    );
    const result = await apiRequest('/x');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.retryAfterSeconds).toBeUndefined();
    expect(formErrorMessage(result.error)).toContain('Try again in 1 minute.');
  });

  it('treats an error body that is JSON but not an object as an unknown error', async () => {
    stubFetch(
      Response.json('nope', { status: 500, statusText: 'Internal Server Error' }),
      Response.json([1, 2], { status: 400, statusText: 'Bad Request' }),
    );
    expect(await apiRequest('/x')).toEqual({
      ok: false,
      error: {
        error: 'UNKNOWN_ERROR',
        message: 'The server answered with an error (500). Try again in a moment.',
        status: 500,
        retryAfterSeconds: undefined,
      },
    });
    expect(await apiRequest('/x')).toMatchObject({
      ok: false,
      error: { error: 'UNKNOWN_ERROR', message: 'The server answered with an error (400). Try again in a moment.' },
    });
  });
});
