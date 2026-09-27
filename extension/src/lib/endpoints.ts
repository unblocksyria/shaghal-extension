import { apiRequest, type ApiResult } from './api';
import { activeLanguage, i18next } from './i18n';

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
  return apiRequest<ServiceRecord>(`/services/${encodeURIComponent(slug)}?locale=${activeLanguage()}`);
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
  return apiRequest<CategoryItem[]>(`/categories?locale=${activeLanguage()}`);
}

export async function getFunctionalities(): Promise<ApiResult<FunctionalityItem[]>> {
  return apiRequest<FunctionalityItem[]>(`/functionalities?locale=${activeLanguage()}`);
}

interface EvidenceFilePayload {
  file: { url: string };
}

function isEvidenceFile(data: unknown): data is EvidenceFilePayload {
  const file = (data as { file?: unknown } | null)?.file;
  const url = (file as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && url.length > 0;
}

/** Uploads are rate limited and validated, not Turnstile-gated; the submission that cites them is. */
export async function uploadEvidence(
  file: Blob,
  filename: string,
  type: 'submission' | 'correction' | 'functionality_report',
): Promise<ApiResult<string>> {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('type', type);

  const result = await apiRequest<EvidenceFilePayload>('/uploads/evidence', {
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
 * it never appears in request logs; send the page URL as the browser has it.
 */
export async function matchService(url: string): Promise<ApiResult<ServiceMatch>> {
  return apiRequest<ServiceMatch>('/services/match', {
    method: 'POST',
    body: { url, locale: activeLanguage() },
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
  });
}

export async function removeVoteForService(slug: string): Promise<ApiResult<VotePayload>> {
  return apiRequest<VotePayload>(`/services/${encodeURIComponent(slug)}/vote`, {
    method: 'DELETE',
    unwrap: 'raw',
    verify: 'vote',
  });
}
