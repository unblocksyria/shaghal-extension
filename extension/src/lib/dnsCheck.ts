import type { RedactedRequestLog } from './redact';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

interface DohAnswer {
  name?: string;
  type?: number;
  data?: string;
}

interface DohResponse {
  Status?: number;
  Answer?: DohAnswer[];
}

export interface DnsCheckResult {
  checked: boolean;
  consistent?: boolean;
  resolvedByNetwork?: string[];
  resolvedByDoh?: string[];
}

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function resolveOverDoh(host: string): Promise<string[]> {
  const response = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(host)}&type=A`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!response.ok) throw new Error(`DoH returned ${response.status}`);
  const payload = (await response.json()) as DohResponse;
  return (payload.Answer ?? [])
    .filter((answer): answer is { name: string; type: number; data: string } => answer.type === 1 && typeof answer.data === 'string')
    .map((answer) => answer.data);
}

export async function checkDnsConsistency(serviceHost: string, logs: RedactedRequestLog[]): Promise<DnsCheckResult> {
  if (serviceHost.length === 0) return { checked: false };

  const observedIps = new Set<string>();
  for (const log of logs) {
    if (hostOf(log.url) !== serviceHost) continue;
    if (log.ip !== undefined && log.ip !== null) observedIps.add(log.ip);
  }
  if (observedIps.size === 0) return { checked: false };

  let dohIps: string[];
  try {
    dohIps = await resolveOverDoh(serviceHost);
  } catch {
    return { checked: false };
  }
  if (dohIps.length === 0) return { checked: false };

  const consistent = dohIps.some((ip) => observedIps.has(ip));
  return {
    checked: true,
    consistent,
    resolvedByNetwork: [...observedIps].sort(),
    resolvedByDoh: dohIps.sort(),
  };
}
