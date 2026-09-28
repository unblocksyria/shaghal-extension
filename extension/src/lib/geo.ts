import { GEO_TRACE_URL } from './config';
import { i18next } from './i18n';

/** The country code in a Cloudflare trace, or null when it has none or does not know. */
export function parseTraceCountry(trace: string): string | null {
  const loc = /^loc=([A-Z0-9]{2})$/m.exec(trace)?.[1];
  return loc === undefined || loc === 'XX' ? null : loc;
}

/** Where the tester's connection comes out, as a country code, or null when it cannot be told. */
export async function browsingCountry(): Promise<string | null> {
  try {
    const response = await fetch(GEO_TRACE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return response.ok ? parseTraceCountry(await response.text()) : null;
  } catch {
    return null;
  }
}

/**
 * A country code as a name to show, in the panel's own language; Cloudflare
 * reports Tor exits as T1 (spec 0002, AC-8).
 */
export function countryName(code: string, locale = 'en-GB'): string {
  if (code === 'T1') return i18next.t('vpn.torNetwork');
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
