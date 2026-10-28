import { GEO_TRACE_URL } from './config';
import { createReadCache } from './cache';
import { i18next } from './i18n';

/** The `loc=` country code from a Cloudflare trace. Null when missing or `XX` (unknown). */
export function parseTraceCountry(trace: string): string | null {
  const loc = /^loc=([A-Z0-9]{2})$/m.exec(trace)?.[1];
  return loc === undefined || loc === 'XX' ? null : loc;
}

async function traceCountry(): Promise<string | null> {
  try {
    const response = await fetch(GEO_TRACE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return response.ok ? parseTraceCountry(await response.text()) : null;
  } catch {
    return null;
  }
}

/**
 * The known country, kept for ten minutes, in session storage too, so the
 * card, the forms and a reopened panel share one check.
 */
const countries = createReadCache<string>({
  storageKey: 'cache.country',
  freshMs: 10 * 60_000,
  keepMs: 10 * 60_000,
  limit: 1,
});

/**
 * The country the tester's connection exits from, or null if the check fails.
 * `force` asks again, as "Check again" does after a VPN is turned off. A failed
 * check is not kept.
 */
export async function browsingCountry(options: { force?: boolean } = {}): Promise<string | null> {
  const result = await countries.load(
    'country',
    async () => {
      const code = await traceCountry();
      return code === null
        ? { ok: false, error: { error: 'UNKNOWN_COUNTRY', message: '', status: 0 } }
        : { ok: true, data: code };
    },
    options,
  );
  return result.ok ? result.data : null;
}

/** The last known country, if any, without checking. */
export function knownBrowsingCountry(): string | null {
  return countries.peek('country')?.value ?? null;
}

/** The display name of a region code in `locale`. Cloudflare reports Tor exits as `T1`. */
export function countryName(code: string, locale = 'en-GB'): string {
  if (code === 'T1') return i18next.t('vpn.torNetwork');
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
