import { apiRequest } from './api';
import { collectClientMetadata } from './endpoints';
import { turnstileHeader } from './turnstile';

export interface SubmitServiceInput {
  name: string;
  url: string;
  description?: string;
  submitterNote?: string;
  evidenceUrls: string[];
}

export interface SubmissionResult {
  id: string;
  name?: string;
  serviceName?: string;
  accepted?: number;
  count?: number;
  message: string;
}

export async function submitService(input: SubmitServiceInput) {
  return apiRequest<SubmissionResult>('/submissions', {
    method: 'POST',
    unwrap: 'raw',
    headers: await turnstileHeader(),
    body: {
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      submitterNote: input.submitterNote ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
      clientMetadata: collectClientMetadata(),
    },
  });
}

export interface SubmitFunctionalityReportInput {
  serviceId: string;
  items: { slug?: string; proposedName?: string; level: 'working' | 'failing' | 'unknown' }[];
  submitterNote?: string;
  evidenceUrls: string[];
}

export type CorrectionType = 'url' | 'description' | 'category' | 'support_email' | 'support_url' | 'other';

export interface CorrectionChange {
  correctionType: CorrectionType;
  proposedValue: string;
}

export interface SubmitCorrectionInput {
  serviceId: string;
  changes: CorrectionChange[];
  submitterEmail?: string;
  submitterNote?: string;
  evidenceUrls: string[];
}

export async function submitCorrection(input: SubmitCorrectionInput) {
  return apiRequest<SubmissionResult>('/corrections', {
    method: 'POST',
    unwrap: 'raw',
    headers: await turnstileHeader(),
    body: {
      serviceId: input.serviceId,
      changes: input.changes,
      submitterNote: input.submitterNote ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
      clientMetadata: collectClientMetadata(),
    },
  });
}

export async function submitFunctionalityReport(input: SubmitFunctionalityReportInput) {
  return apiRequest<SubmissionResult>('/functionality-reports', {
    method: 'POST',
    unwrap: 'raw',
    headers: await turnstileHeader(),
    body: {
      serviceId: input.serviceId,
      items: input.items,
      submitterNote: input.submitterNote ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
      clientMetadata: collectClientMetadata(),
    },
  });
}
