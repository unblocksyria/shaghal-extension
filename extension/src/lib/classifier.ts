import type { RedactedRequestLog } from './redact';
import type { ContentSignal } from './session';
import type { BlockTier } from './blocklist';
import { isSameSite } from './sameSite';
import { hostOf } from './url';

export interface SuspiciousHost {
  host: string;
  failures: number;
  successes: number;
  error: string;
}

export interface PartVerdict {
  level?: 'working' | 'failing';
  evidence: string;
}

export interface LogVerdict {
  parts: { landing_page: PartVerdict; core_use: PartVerdict };
  coreWarnings: string[];
  blockedMessage?: string;
  blockedMessageTier?: BlockTier;
  deniedCount: number;
  failedApiHosts: SuspiciousHost[];
  abortedCount: number;
}

const DENIED_STATUS = new Set([403, 451]);
const API_COLLAPSE_FAILURE_THRESHOLD = 5;
const HEALTHY_API_SUCCESS_THRESHOLD = 3;
const HEALTHY_MAX_FAILURE_RATIO = 0.25;

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
  mainHost?: string;
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

function isApiRequest(resourceType: string): boolean {
  return resourceType === 'xmlhttprequest' || resourceType === 'fetch';
}

function describeFailure(log: RedactedRequestLog): string {
  return log.error ?? `HTTP ${log.statusCode}`;
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
      if (scan.mainHost === undefined) scan.mainHost = hostOf(log.url);
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

function hasStrongContentMatch(contentSignal?: ContentSignal): boolean {
  return contentSignal?.matchedPhrase != null && (contentSignal.tier ?? 'weak') === 'strong';
}

function hasWeakContentMatch(contentSignal?: ContentSignal): boolean {
  return contentSignal?.matchedPhrase != null && (contentSignal.tier ?? 'weak') !== 'strong';
}

function sameSiteTraffic(scan: TrafficScan, serviceHost?: string): HostTraffic[] {
  if (serviceHost === undefined) return [];
  return [...scan.apiHosts.values()].filter((traffic) => isSameSite(traffic.host, serviceHost));
}

function collectWarnings(scan: TrafficScan, contentSignal?: ContentSignal): string[] {
  const warnings: string[] = [];
  if (hasWeakContentMatch(contentSignal)) {
    warnings.push(`Possible block message on page ("${contentSignal?.matchedPhrase}") — verify manually`);
  }
  for (const traffic of scan.apiHosts.values()) {
    if (traffic.failures >= API_COLLAPSE_FAILURE_THRESHOLD && traffic.successes > 0) {
      warnings.push(`Repeated API failures on ${traffic.host} (×${traffic.failures})`);
    }
  }
  return warnings;
}

function assessLandingPage(scan: TrafficScan, contentSignal?: ContentSignal): PartVerdict {
  if (hasStrongContentMatch(contentSignal)) {
    return { level: 'failing', evidence: `Block message detected on page: "${contentSignal?.matchedPhrase}"` };
  }
  if (scan.main.denied > 0) {
    return { level: 'failing', evidence: `Main page was denied ${scan.main.denied} time(s) with 403/451` };
  }
  if (scan.main.successes > 0) {
    return { level: 'working', evidence: `${scan.main.successes} main page load(s) succeeded` };
  }
  if (scan.main.networkError) {
    return { level: 'failing', evidence: 'Main page request failed with a network error' };
  }
  return { evidence: 'No main page load captured' };
}

function assessCoreUse(scan: TrafficScan, contentSignal?: ContentSignal, serviceHost?: string): PartVerdict {
  const traffic = sameSiteTraffic(scan, serviceHost);

  if (hasStrongContentMatch(contentSignal)) {
    return { level: 'failing', evidence: `Block message detected on page: "${contentSignal?.matchedPhrase}"` };
  }
  const collapse = traffic.find(
    (entry) => entry.failures >= API_COLLAPSE_FAILURE_THRESHOLD && entry.successes === 0,
  );
  if (collapse !== undefined) {
    return { level: 'failing', evidence: `Page loads but ${collapse.failures} API calls to ${collapse.host} all failed` };
  }
  if (scan.main.denied > 0) {
    return { level: 'failing', evidence: `Service unreachable — main page was denied ${scan.main.denied} time(s)` };
  }
  if (scan.main.networkError && scan.main.successes === 0) {
    return { level: 'failing', evidence: 'Main page request failed with a network error' };
  }

  const failures = traffic.reduce((total, entry) => total + entry.failures, 0);
  const successes = traffic.reduce((total, entry) => total + entry.successes, 0);
  const failureRatio = failures / (failures + successes);

  if (successes >= HEALTHY_API_SUCCESS_THRESHOLD && failureRatio <= HEALTHY_MAX_FAILURE_RATIO) {
    return {
      level: 'working',
      evidence: `${successes} API call(s) succeeded${failures > 0 ? `, ${failures} failed` : ' with no failures'}`,
    };
  }
  if (traffic.length === 0) {
    const landing = assessLandingPage(scan, contentSignal);
    return {
      level: landing.level,
      evidence: landing.level === undefined ? landing.evidence : `No API calls observed — ${landing.evidence.toLowerCase()}`,
    };
  }
  if (failures > 0) {
    return { evidence: `${failures} of ${failures + successes} same-site API call(s) failed` };
  }
  return { evidence: 'Not enough API activity to judge' };
}

export function classifyLogs(logs: RedactedRequestLog[], contentSignal?: ContentSignal, serviceHost?: string): LogVerdict {
  const scan = scanTraffic(logs);
  const resolvedServiceHost = serviceHost ?? scan.mainHost;

  const verdict: LogVerdict = {
    parts: {
      landing_page: assessLandingPage(scan, contentSignal),
      core_use: assessCoreUse(scan, contentSignal, resolvedServiceHost),
    },
    coreWarnings: collectWarnings(scan, contentSignal),
    deniedCount: scan.deniedCount,
    failedApiHosts: [...scan.apiHosts.values()].sort((a, b) => b.failures - a.failures),
    abortedCount: scan.abortedCount,
  };

  if (contentSignal?.matchedPhrase != null) {
    verdict.blockedMessage = contentSignal.matchedPhrase;
    verdict.blockedMessageTier = contentSignal.tier ?? 'weak';
  }

  return verdict;
}
