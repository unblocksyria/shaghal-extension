import { apiRequest, type ApiResult } from './api';

export type DuplicateType = 'published' | 'pending' | 'none';

export interface DuplicateCheck {
  hasDuplicate: boolean;
  duplicateType: DuplicateType;
  existingService?: { slug: string; name: string };
  message?: string;
}

export interface ServiceFunctionality {
  slug: string;
  name: string;
  isCore: boolean;
  level: 'working' | 'failing' | 'unknown';
  description: string | null;
}

export interface ServiceRecord {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  availability: string;
  description?: string | null;
  supportEmail?: string | null;
  supportUrl?: string | null;
  categories?: { id: string; name: string; slug: string }[];
  functionalities?: ServiceFunctionality[];
}

export async function checkDuplicate(url: string): Promise<ApiResult<DuplicateCheck>> {
  return apiRequest<DuplicateCheck>(`/check-duplicate?url=${encodeURIComponent(url)}`, { unwrap: 'raw' });
}

export async function getServiceBySlug(slug: string): Promise<ApiResult<ServiceRecord>> {
  return apiRequest<ServiceRecord>(`/services/${encodeURIComponent(slug)}`);
}

export interface FunctionalityItem {
  slug: string;
  name: string;
  isCore: boolean;
}

export async function getFunctionalities(): Promise<ApiResult<FunctionalityItem[]>> {
  return apiRequest<FunctionalityItem[]>('/functionalities');
}

export interface FunctionalityReportItem {
  slug?: string;
  proposedName?: string;
  level: 'working' | 'failing' | 'unknown';
  description?: string;
  evidenceUrls?: string[];
}

export interface ClientMetadata {
  timezone: string;
  screenResolution: string;
  devicePixelRatio: number;
}

export function collectClientMetadata(): ClientMetadata {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio,
  };
}

interface EvidenceFilePayload {
  success: boolean;
  file: { url: string; filename: string };
}

export interface EvidenceUploadResult {
  url: string;
  filename: string;
}

export async function uploadEvidence(
  file: Blob,
  type: 'submission' | 'correction' | 'functionality_report',
  turnstileToken: string,
): Promise<ApiResult<EvidenceUploadResult>> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);

  const result = await apiRequest<EvidenceFilePayload>('/uploads/evidence', {
    method: 'POST',
    contentType: 'multipart',
    body: form,
    unwrap: 'raw',
    headers: turnstileToken.length > 0 ? { 'X-Turnstile-Token': turnstileToken } : {},
  });
  if (!result.ok) return result;
  return { ok: true, data: { url: result.data.file.url, filename: result.data.file.filename } };
}
