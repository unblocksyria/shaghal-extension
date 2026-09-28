import { GEO_TRACE_URL } from './config';
import { i18next } from './i18n';

/** The `loc=` country code from a Cloudflare trace. Null when missing or `XX` (unknown). */
export function parseTraceCountry(trace: string): string | null {
  const loc = /^loc=([A-Z0-9]{2})$/m.exec(trace)?.[1];
  return loc === undefined || loc === 'XX' ? null : loc;
}

/** The country the tester's connection exits from, or null if the check fails. */
export async function browsingCountry(): Promise<string | null> {
  try {
    const response = await fetch(GEO_TRACE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return response.ok ? parseTraceCountry(await response.text()) : null;
  } catch {
    return null;
  }
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
