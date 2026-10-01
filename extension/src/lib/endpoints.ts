import { apiRequest, type ApiResult } from './api';
import { activeLanguage, i18next } from './i18n';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nullableText = (value: unknown) => value === null || text(value);
const optionalText = (value: unknown) => value === undefined || nullableText(value);
const named = (value: unknown) => record(value) && text(value.id) && text(value.name);
const part = (value: unknown) =>
  record(value) &&
  text(value.slug) &&
  value.slug.length > 0 &&
  value.slug.length <= 64 &&
  !Object.hasOwn(Object.prototype, value.slug) &&
  text(value.name);
const listOf = (check: (value: unknown) => boolean) => (value: unknown) => Array.isArray(value) && value.every(check);
const expectation = (check: (value: unknown) => boolean) => ({
  check,
  message: i18next.t('api.incompleteData'),
});

const isFunctionality = (value: unknown) =>
  record(value) &&
  part(value) &&
  ['working', 'failing', 'unknown'].includes(String(value.level)) &&
  ['description', 'changedAt', 'lastObservedAt'].every((key) => optionalText(value[key]));

function isServiceRecord(value: unknown): boolean {
  return (
    record(value) &&
    named(value) &&
    nullableText(value.url) &&
    ['description', 'supportEmail', 'supportUrl'].every((key) => optionalText(value[key])) &&
    (value.categories === undefined || listOf(named)(value.categories)) &&
    (value.functionalities === undefined || listOf(isFunctionality)(value.functionalities))
  );
}

function isCatalogService(value: unknown): boolean {
  return (
    record(value) &&
    named(value) &&
    text(value.slug) &&
    nullableText(value.logoUrl) &&
    text(value.availability) &&
    Number.isSafeInteger(value.voteCount) &&
    Number(value.voteCount) >= 0 &&
    nullableText(value.statusCheckedAt) &&
    (value.company === null || (record(value.company) && text(value.company.name)))
  );
}

function isMatch(value: unknown): boolean {
  return (
    record(value) &&
    (value.service === null || isCatalogService(value.service)) &&
    (value.matchType === null || value.matchType === 'host' || value.matchType === 'parent_domain') &&
    listOf(isCatalogService)(value.alternatives)
  );
}

function isVote(value: unknown): boolean {
  return record(value) && Number.isSafeInteger(value.voteCount) && Number(value.voteCount) >= 0;
}

/** One part of a service as `GET /services/:slug` records it. */
export interface ServiceFunctionality {
  slug: string;
  name: string;
  level: 'working' | 'failing' | 'unknown';
  /** What this part does, or null when the record says nothing about it. */
  description?: string | null;
  /** When the level last changed, which the card shows as "Since". */
  changedAt?: string | null;
  /** When a tester last checked it, which the card shows as "Checked". */
  lastObservedAt?: string | null;
}

/** A service's full record, used by the report and correction forms. */
export interface ServiceRecord {
  id: string;
  name: string;
  /** The Arabic name, or null when the catalogue has none. */
  nameAr?: string | null;
  url: string | null;
  description?: string | null;
  supportEmail?: string | null;
  supportUrl?: string | null;
  categories?: { id: string; name: string }[];
  functionalities?: ServiceFunctionality[];
}

export async function getServiceBySlug(slug: string): Promise<ApiResult<ServiceRecord>> {
  return apiRequest<ServiceRecord>(`/services/${encodeURIComponent(slug)}?locale=${activeLanguage()}`, {
    expect: expectation(isServiceRecord),
  });
}

export interface FunctionalityItem {
  slug: string;
  name: string;
}

export interface CategoryItem {
  id: string;
  name: string;
}

export async function getCategories(): Promise<ApiResult<CategoryItem[]>> {
  return apiRequest<CategoryItem[]>(`/categories?locale=${activeLanguage()}`, { expect: expectation(listOf(named)) });
}

export async function getFunctionalities(): Promise<ApiResult<FunctionalityItem[]>> {
  return apiRequest<FunctionalityItem[]>(`/functionalities?locale=${activeLanguage()}`, {
    expect: expectation(listOf(part)),
  });
}

interface EvidenceFilePayload {
  file: { url: string };
}

function isEvidenceFile(data: unknown): data is EvidenceFilePayload {
  const file = (data as { file?: unknown } | null)?.file;
  const url = (file as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && url.length > 0;
}

/** Each upload needs its own Turnstile token and draws on a separate upload quota. */
export async function uploadEvidence(
  file: Blob,
  filename: string,
  type: 'submission' | 'correction' | 'functionality_report',
): Promise<ApiResult<string>> {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('type', type);

  const result = await apiRequest<EvidenceFilePayload>('/uploads/evidence', {
    verify: 'upload',
    method: 'POST',
    write: true,
    contentType: 'multipart',
    body: form,
    unwrap: 'raw',
    expect: { check: isEvidenceFile, message: i18next.t('api.uploadNoFile') },
  });
  if (!result.ok) return result;
  return { ok: true, data: result.data.file.url };
}

export type Availability = 'available' | 'usable' | 'blocked' | 'unknown';

/** A service as the match route returns it. */
export interface CatalogService {
  id: string;
  name: string;
  /** The Arabic name, or null when the catalogue has none. */
  nameAr?: string | null;
  slug: string;
  logoUrl: string | null;
  availability: Availability;
  voteCount: number;
  /** ISO time of the newest part check, or null when nothing was checked. */
  statusCheckedAt: string | null;
  company: { name: string } | null;
}

export interface ServiceMatch {
  service: CatalogService | null;
  /** `parent_domain` when the service covers a parent of the page's host. */
  matchType: 'host' | 'parent_domain' | null;
  /** Services on this site, most voted first, when there is no single match. */
  alternatives: CatalogService[];
}

/**
 * Finds the catalogue service for a page. The URL goes in the body to keep it
 * out of request logs. Callers strip credentials and fragments (see matchUrl).
 */
export async function matchService(url: string, signal?: AbortSignal): Promise<ApiResult<ServiceMatch>> {
  return apiRequest<ServiceMatch>('/services/match', {
    method: 'POST',
    body: { url, locale: activeLanguage() },
    signal,
    expect: expectation(isMatch),
  });
}

interface VotePayload {
  voteCount: number;
}

/** One vote per network address per service. */
export async function voteForService(slug: string): Promise<ApiResult<VotePayload>> {
  return apiRequest<VotePayload>(`/services/${encodeURIComponent(slug)}/vote`, {
    method: 'POST',
    unwrap: 'raw',
    verify: 'vote',
    write: true,
    expect: expectation(isVote),
  });
}

export async function removeVoteForService(slug: string): Promise<ApiResult<VotePayload>> {
  return apiRequest<VotePayload>(`/services/${encodeURIComponent(slug)}/vote`, {
    method: 'DELETE',
    unwrap: 'raw',
    verify: 'vote',
    write: true,
    expect: expectation(isVote),
  });
}
