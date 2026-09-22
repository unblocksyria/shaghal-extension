import type { RedactedRequestLog } from './redact';
import type { ContentSignal } from './session';
import type { BlockTier } from './blocklist';

export interface SuspiciousHost {
  host: string;
  failures: number;
  successes: number;
  error: string;
}

export interface LogVerdict {
  coreSuggestion?: 'working' | 'failing';
  coreEvidence: string;
  coreWarnings: string[];
  blockedMessage?: string;
  blockedMessageTier?: BlockTier;
  deniedCount: number;
  failedApiHosts: SuspiciousHost[];
  abortedCount: number;
}

const DENIED_STATUS = new Set([403, 451]);
const API_COLLAPSE_FAILURE_THRESHOLD = 5;

interface MainFrameSummary {
  successes: number;
  denied: number;
  networkError: boolean;
}

interface HostTraffic {
  host: string;
  failures: number;
  successes: number;
  error: string;
}

interface TrafficScan {
  main: MainFrameSummary;
  apiHosts: Map<string, HostTraffic>;
  deniedCount: number;
  abortedCount: number;
}

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

function isApiRequest(resourceType: string): boolean {
  return resourceType === 'xmlhttprequest' || resourceType === 'fetch';
}

function recordApiFailure(hosts: Map<string, HostTraffic>, log: RedactedRequestLog): void {
  const host = hostOf(log.url);
  const traffic = hosts.get(host) ?? { host, failures: 0, successes: 0, error: describeFailure(log) };
  traffic.failures += 1;
  hosts.set(host, traffic);
}

function recordApiSuccess(hosts: Map<string, HostTraffic>, log: RedactedRequestLog): void {
  const host = hostOf(log.url);
  const traffic = hosts.get(host) ?? { host, failures: 0, successes: 0, error: '' };
  traffic.successes += 1;
  hosts.set(host, traffic);
}

function describeFailure(log: RedactedRequestLog): string {
  return log.error ?? `HTTP ${log.statusCode}`;
}

function scanTraffic(logs: RedactedRequestLog[]): TrafficScan {
  const scan: TrafficScan = {
    main: { successes: 0, denied: 0, networkError: false },
    apiHosts: new Map(),
    deniedCount: 0,
    abortedCount: 0,
  };

  for (const log of logs) {
    if (log.error !== null && errorClass(log.error) === 'aborted') {
      scan.abortedCount += 1;
      continue;
    }
    if (log.statusCode !== null && DENIED_STATUS.has(log.statusCode)) scan.deniedCount += 1;

    if (log.resourceType === 'main_frame') {
      scanMainOutcome(scan.main, log);
      continue;
    }
    if (isApiRequest(log.resourceType)) {
      const failed = log.statusCode === null || log.statusCode >= 400;
      if (failed) recordApiFailure(scan.apiHosts, log);
      else recordApiSuccess(scan.apiHosts, log);
    }
  }

  return scan;
}

function scanMainOutcome(main: MainFrameSummary, log: RedactedRequestLog): void {
  if (log.statusCode !== null && log.statusCode < 400) {
    main.successes += 1;
    return;
  }
  if (log.statusCode !== null && DENIED_STATUS.has(log.statusCode)) {
    main.denied += 1;
    return;
  }
  if (log.error !== null) main.networkError = true;
}

function collapsedHost(apiHosts: Map<string, HostTraffic>): HostTraffic | undefined {
  return [...apiHosts.values()].find(
    (traffic) => traffic.failures >= API_COLLAPSE_FAILURE_THRESHOLD && traffic.successes === 0,
  );
}

function collectWarnings(scan: TrafficScan, contentSignal?: ContentSignal): string[] {
  const warnings: string[] = [];
  const weakMatch = contentSignal?.matchedPhrase != null && (contentSignal.tier ?? 'weak') === 'weak';
  if (weakMatch) {
    warnings.push(`Possible block message on page ("${contentSignal?.matchedPhrase}") — verify manually`);
  }
  for (const traffic of scan.apiHosts.values()) {
    if (traffic.failures >= API_COLLAPSE_FAILURE_THRESHOLD && traffic.successes > 0) {
      warnings.push(`Repeated API failures on ${traffic.host} (×${traffic.failures})`);
    }
  }
  return warnings;
}

export function classifyLogs(logs: RedactedRequestLog[], contentSignal?: ContentSignal): LogVerdict {
  const scan = scanTraffic(logs);
  const verdict: LogVerdict = {
    coreEvidence: `${scan.main.successes} main page load${scan.main.successes === 1 ? '' : 's'} succeeded`,
    coreWarnings: collectWarnings(scan, contentSignal),
    deniedCount: scan.deniedCount,
    failedApiHosts: [...scan.apiHosts.values()].sort((a, b) => b.failures - a.failures),
    abortedCount: scan.abortedCount,
  };

  if (contentSignal?.matchedPhrase != null) {
    verdict.blockedMessage = contentSignal.matchedPhrase;
    verdict.blockedMessageTier = contentSignal.tier ?? 'weak';
  }

  if (verdict.blockedMessageTier === 'strong') {
    verdict.coreSuggestion = 'failing';
    verdict.coreEvidence = `Block message detected on page: "${contentSignal?.matchedPhrase}"`;
  } else if (scan.main.denied > 0) {
    verdict.coreSuggestion = 'failing';
    verdict.coreEvidence = `Main page was denied ${scan.main.denied} time(s) with 403/451`;
  } else {
    const collapse = collapsedHost(scan.apiHosts);
    if (collapse !== undefined) {
      verdict.coreSuggestion = 'failing';
      verdict.coreEvidence = `Page loads but ${collapse.failures} API calls to ${collapse.host} all failed`;
    } else if (scan.main.successes > 0) {
      verdict.coreSuggestion = 'working';
    } else if (scan.main.networkError) {
      verdict.coreSuggestion = 'failing';
      verdict.coreEvidence = 'Main page request failed with a network error';
    }
  }

  return verdict;
}
