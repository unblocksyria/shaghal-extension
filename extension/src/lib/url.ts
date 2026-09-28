import { SITE_BASE } from './config';

export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return '';
  }
}

/** Lowercased hostname without `www.`, for comparing pages. '' when unparseable. */
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

/** Unblock Syria's own domains, subdomains included. ubsyr.com is the short-link domain. */
const OWN_DOMAINS = ['unblocksyria.com', 'ubsyr.com'];

/**
 * True for Unblock Syria's own domains and for SITE_BASE (localhost in
 * development). These pages have no service to show.
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

/**
 * The page URL to send for matching, with path and query kept but credentials
 * and fragment removed. Null for non-web, local or over-long URLs.
 */
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
