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

function isServiceRecord(value: unknown): boolean {
  return (
    record(value) &&
    named(value) &&
    nullableText(value.url) &&
    ['description', 'supportEmail', 'supportUrl'].every((key) => optionalText(value[key])) &&
    (value.categories === undefined || listOf(named)(value.categories)) &&
    (value.functionalities === undefined ||
      listOf((item) => record(item) && part(item) && ['working', 'failing', 'unknown'].includes(String(item.level)))(
        value.functionalities,
      ))
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

/** A service's full record, as the report and correction forms need it. */
export interface ServiceRecord {
  id: string;
  name: string;
  /** The Arabic name, or null when the catalogue has none (spec 0002, AC-6). */
  nameAr?: string | null;
  url: string | null;
  description?: string | null;
  supportEmail?: string | null;
  supportUrl?: string | null;
  categories?: { id: string; name: string }[];
  functionalities?: { slug: string; name: string; level: 'working' | 'failing' | 'unknown' }[];
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

/** Each upload requires its own verification token and a separate upload allowance. */
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
  /** The Arabic name, or null when the catalogue has none (spec 0002, AC-6). */
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
  /** When there is no single match: the services on this site, most voted first. */
  alternatives: CatalogService[];
}

/**
 * Which catalogue service a page belongs to. The address goes in the body so
 * it stays out of request URL logs. The caller removes credentials and fragments.
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
    expect: expectation(isVote),
  });
}

export async function removeVoteForService(slug: string): Promise<ApiResult<VotePayload>> {
  return apiRequest<VotePayload>(`/services/${encodeURIComponent(slug)}/vote`, {
    method: 'DELETE',
    unwrap: 'raw',
    verify: 'vote',
    expect: expectation(isVote),
  });
}
