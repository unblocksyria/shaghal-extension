import { describe, expect, it, vi } from 'vitest';
import { browsingCountry, countryName, parseTraceCountry } from './geo';

const trace = (loc: string) => `fl=123\nh=api.unblocksyria.com\nip=192.0.2.1\nloc=${loc}\ntls=TLSv1.3\n`;

describe('parseTraceCountry', () => {
  it('reads the loc line', () => {
    expect(parseTraceCountry(trace('SY'))).toBe('SY');
    expect(parseTraceCountry(trace('DE'))).toBe('DE');
  });

  it('is null when Cloudflare does not know, or the line is missing', () => {
    expect(parseTraceCountry(trace('XX'))).toBeNull();
    expect(parseTraceCountry('fl=123\nh=x\n')).toBeNull();
    expect(parseTraceCountry('')).toBeNull();
  });
});

describe('browsingCountry', () => {
  it('asks the trace and returns its country', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(trace('TR')));
    vi.stubGlobal('fetch', fetchMock);
    expect(await browsingCountry()).toBe('TR');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.unblocksyria.com/cdn-cgi/trace');
  });

  it('is null when the check fails, so no warning is shown', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('offline')));
    expect(await browsingCountry()).toBeNull();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })));
    expect(await browsingCountry()).toBeNull();
  });
});

describe('countryName', () => {
  it('names countries in English, and Tor exits', () => {
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('T1')).toBe('the Tor network');
  });
});

describe('the country name', () => {
  it('is given in the panel language', () => {
    expect(countryName('DE', 'ar')).toBe('ألمانيا');
  });

  it('falls back to the code itself when the code is not a region', () => {
    expect(countryName('??')).toBe('??');
  });
});

it('never caches the trace, and gives the check a deadline', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(trace('SY')));
  vi.stubGlobal('fetch', fetchMock);
  await browsingCountry();
  const [, init] = fetchMock.mock.calls[0] ?? [];
  expect(init?.cache).toBe('no-store');
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});
