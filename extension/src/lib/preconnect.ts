import { API_BASE, IS_LOCAL_API, VERIFY_BASE } from './config';

/**
 * Opens connections to the API and the verification page while the panel
 * starts, so the first lookup and the first vote skip the DNS and TLS
 * handshakes, which take several round trips on a slow link.
 *
 * API requests omit credentials, so that connection is opened anonymously
 * (`crossorigin`); the verification page loads in a frame, which uses a
 * credentialed one.
 */
export function preconnect(): void {
  if (typeof document === 'undefined') return;
  const hint = (href: string, anonymous: boolean) => {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = new URL(href).origin;
    if (anonymous) link.crossOrigin = 'anonymous';
    document.head.append(link);
  };
  hint(API_BASE, true);
  if (!IS_LOCAL_API) hint(VERIFY_BASE, false);
}
