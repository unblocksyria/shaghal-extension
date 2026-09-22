function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

export function isSameSite(requestHost: string, serviceHost: string): boolean {
  const request = normalizeHost(requestHost);
  const service = normalizeHost(serviceHost);
  if (request.length === 0 || service.length === 0) return false;
  return request === service || request.endsWith(`.${service}`) || service.endsWith(`.${request}`);
}
