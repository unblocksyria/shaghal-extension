import { SITE_BASE } from './config';

export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return '';
  }
}

/** A page's site for comparing two pages: its hostname, lowercased, without `www.`; '' when it has none. */
export function siteOf(rawUrl: string | null | undefined): string {
  if (rawUrl === null || rawUrl === undefined) return '';
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeServiceUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return `${parsed.protocol}//${host}`;
}

/** Hosts that are Unblock Syria itself: the site, its subdomains and the ubsyr.com short domain. */
const OWN_DOMAINS = ['unblocksyria.com', 'ubsyr.com'];

/**
 * Whether the page is Unblock Syria's own site, or the site this build talks
 * to (localhost in development). There is no service to show for it, so the
 * panel explains itself instead.
 */
export function isOwnSite(rawUrl: string | null): boolean {
  if (rawUrl === null) return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (OWN_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  return parsed.origin === new URL(SITE_BASE).origin;
}

/** Preserve path/query matching, but never disclose embedded credentials or fragments. */
export function matchUrl(rawUrl: string | null): string | null {
  if (rawUrl === null) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    // The catalogue cannot match IP literals, local names, or reserved local domains.
    if (
      !host.includes('.') ||
      host.startsWith('[') ||
      /^[0-9.]+$/.test(host) ||
      ['localhost', 'local', 'internal', 'home.arpa'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
    )
      return null;
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    const url = parsed.toString();
    return url.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}
