import type { RedactedRequestLog } from './redact';
import { classifyLogs, type LogVerdict } from './classifier';
import { checkDnsConsistency } from './dnsCheck';
import { getSession, type TesterSession } from './session';

function describeVerdict(verdict: LogVerdict): string[] {
  const lines = [`Suggested core level: ${verdict.coreSuggestion ?? 'unknown'} — ${verdict.coreEvidence}`];
  for (const host of verdict.failedApiHosts.slice(0, 3)) {
    lines.push(`API failures: ${host.host} ×${host.failures} (${host.error})`);
  }
  return lines;
}

async function describeDns(session: TesterSession): Promise<string[]> {
  const serviceUrl = session.metadata?.serviceUrl;
  if (serviceUrl === undefined) return [];
  let host: string;
  try {
    host = new URL(serviceUrl).hostname;
  } catch {
    return [];
  }
  const result = await checkDnsConsistency(host, session.logs);
  if (!result.checked) return [];
  return [
    result.consistent === true
      ? `DNS check: consistent with public DoH (${result.resolvedByNetwork?.length ?? 0} IPs)`
      : `DNS check: possible DNS tampering — browser resolved ${result.resolvedByNetwork?.join(', ') ?? '?'} but public DoH returned ${result.resolvedByDoh?.join(', ') ?? '?'}`,
  ];
}

export interface SessionLogDigest {
  totalRequests: number;
  failedRequests: number;
  statusBreakdown: Record<string, number>;
  networkErrors: string[];
}

export function buildDigest(logs: RedactedRequestLog[]): SessionLogDigest {
  const statusBreakdown: Record<string, number> = {};
  let failedRequests = 0;
  const networkErrors: string[] = [];

  for (const log of logs) {
    if (log.statusCode === null) {
      failedRequests += 1;
      networkErrors.push(`${log.method} ${log.url} — ${log.error ?? 'connection failed'}`);
      continue;
    }
    if (log.statusCode >= 400) {
      failedRequests += 1;
    }
    const bucket = String(log.statusCode);
    statusBreakdown[bucket] = (statusBreakdown[bucket] ?? 0) + 1;
  }

  return { totalRequests: logs.length, failedRequests, statusBreakdown, networkErrors: networkErrors.slice(0, 20) };
}

export function formatDigest(digest: SessionLogDigest): string {
  const statusLines = Object.entries(digest.statusBreakdown)
    .map(([code, count]) => `${code}: ${count}`)
    .join(', ');
  return [
    `Requests observed: ${digest.totalRequests}`,
    `Failed requests: ${digest.failedRequests}`,
    `Status codes: ${statusLines || 'none'}`,
  ].join('\n');
}

export function toSessionJson(session: TesterSession): string {
  return JSON.stringify(
    {
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      digest: buildDigest(session.logs),
      logs: session.logs,
    },
    null,
    2,
  );
}

export async function composeNoteWithDigest(note: string | undefined): Promise<string | undefined> {
  const session = await getSession();
  if (session === undefined) return note;
  const digest = formatDigest(buildDigest(session.logs));
  const verdictLines = describeVerdict(classifyLogs(session.logs));
  const dnsLines = await describeDns(session);
  return [note, digest, ...verdictLines, ...dnsLines].filter(Boolean).join('\n\n');
}
