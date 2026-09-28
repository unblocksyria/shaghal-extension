/**
 * Development builds use a local API so testing never writes to the live review
 * queues. WXT_API_BASE, WXT_SITE_BASE and WXT_VERIFY_BASE override the defaults
 * at build time.
 *
 * Each `import.meta.env.*` is referenced directly so the bundler inlines it and
 * a production bundle contains no local address.
 */
function trimmed(value: string): string {
  return value.replace(/\/+$/, '');
}

export const API_BASE = trimmed(
  import.meta.env.WXT_API_BASE || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.unblocksyria.com'),
);

/** The public site, for "view on unblocksyria.com" links. */
export const SITE_BASE = trimmed(
  import.meta.env.WXT_SITE_BASE || (import.meta.env.DEV ? 'http://localhost:3000' : 'https://unblocksyria.com'),
);

/** The human-verification page. See lib/turnstile.ts. */
export const VERIFY_BASE = trimmed(
  import.meta.env.WXT_VERIFY_BASE ||
    (import.meta.env.DEV ? 'http://localhost:8790' : 'https://verify.unblocksyria.com'),
);

/**
 * Cloudflare's trace endpoint, which reports the visitor's country as `loc=`.
 * Always the live host, since a local API has no trace and the answer depends
 * only on the tester's connection.
 */
export const GEO_TRACE_URL = 'https://api.unblocksyria.com/cdn-cgi/trace';

/** A local API skips human verification, so no Turnstile token is fetched. */
export const IS_LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API_BASE);
