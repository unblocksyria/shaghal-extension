import type { RedactedRequestLog } from './redact';

export interface SuspiciousHost {
  host: string;
  failures: number;
  error: string;
}

export interface LogVerdict {
  coreSuggestion?: 'working' | 'failing';
  coreEvidence: string;
  deniedCount: number;
  failedApiHosts: SuspiciousHost[];
  abortedCount: number;
}

const DENIED_STATUS = new Set([403, 451]);

function errorClass(error: string): 'dns' | 'network' | 'blocked' | 'aborted' | 'other' {
  if (error.includes('ERR_ABORTED')) return 'aborted';
  if (error.includes('ERR_NAME_NOT_RESOLVED')) return 'dns';
  if (
    error.includes('ERR_CONNECTION') ||
    error.includes('ERR_TIMED_OUT') ||
    error.includes('ERR_EMPTY_RESPONSE') ||
    error.includes('ERR_SSL') ||
    error.includes('ERR_HTTP2')
  ) {
    return 'network';
  }
  if (error.includes('ERR_BLOCKED')) return 'blocked';
  return 'other';
}

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}

export function classifyLogs(logs: RedactedRequestLog[]): LogVerdict {
  let mainSuccess = 0;
  let mainDenied = 0;
  let mainNetworkError = false;
  let deniedCount = 0;
  let abortedCount = 0;
  const failedHosts = new Map<string, SuspiciousHost>();

  for (const log of logs) {
    if (log.error !== null && errorClass(log.error) === 'aborted') {
      abortedCount += 1;
      continue;
    }
    if (log.statusCode !== null && DENIED_STATUS.has(log.statusCode)) deniedCount += 1;

    if (log.resourceType === 'main_frame') {
      if (log.statusCode !== null && log.statusCode < 400) {
        mainSuccess += 1;
        continue;
      }
      if (log.statusCode !== null && DENIED_STATUS.has(log.statusCode)) {
        mainDenied += 1;
        continue;
      }
      if (log.error !== null) mainNetworkError = true;
      continue;
    }

    if (log.resourceType === 'xmlhttprequest' || log.resourceType === 'fetch') {
      const failed = log.statusCode === null || log.statusCode >= 400;
      if (!failed) continue;
      const host = hostOf(log.url);
      const entry = failedHosts.get(host) ?? { host, failures: 0, error: log.error ?? `HTTP ${log.statusCode}` };
      entry.failures += 1;
      failedHosts.set(host, entry);
    }
  }

  const verdict: LogVerdict = {
    coreEvidence: `${mainSuccess} main page load${mainSuccess === 1 ? '' : 's'} succeeded`,
    deniedCount,
    failedApiHosts: [...failedHosts.values()].sort((a, b) => b.failures - a.failures),
    abortedCount,
  };

  if (mainDenied > 0 || mainNetworkError) {
    verdict.coreSuggestion = 'failing';
    verdict.coreEvidence =
      mainDenied > 0
        ? `Main page was denied ${mainDenied} time(s) with 403/451`
        : 'Main page request failed with a network error';
  } else if (mainSuccess > 0) {
    verdict.coreSuggestion = 'working';
  }

  return verdict;
}
