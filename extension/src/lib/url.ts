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

/** IP literals, local names and reserved local domains, which no catalogue entry can name. */
function isLocalHost(host: string): boolean {
  return (
    !host.includes('.') ||
    host.startsWith('[') ||
    /^[0-9.]+$/.test(host) ||
    ['localhost', 'local', 'internal', 'home.arpa'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
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
    if (isLocalHost(host)) return null;
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    const url = parsed.toString();
    return url.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}

/**
 * The host a report says it was tested on: lowercased, without `www.` or a
 * trailing dot, for example `web.telegram.org`. Never the path or query. Null
 * when the page is not a public web address (a browser page, an IP address or
 * a local name), so the report leaves the field out rather than send a host
 * the API would refuse.
 */
export function testedHostOf(rawUrl: string | null): string | null {
  if (rawUrl === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (isLocalHost(host)) return null;
  // Letters, digits and hyphens in dot-separated labels, the last one starting
  // with a letter. Browsers give international names in this punycode form.
  return /^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(host) ? host : null;
}
