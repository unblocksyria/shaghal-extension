import { apiRequest } from './api';

export interface SubmitServiceInput {
  name: string;
  url: string;
  description?: string;
  submitterEmail?: string;
  evidenceUrls: string[];
}

export async function submitService(input: SubmitServiceInput) {
  return apiRequest<unknown>('/submissions', {
    method: 'POST',
    unwrap: 'raw',
    verify: 'submission',
    body: {
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      submitterEmail: input.submitterEmail ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
    },
  });
}

export interface SubmitFunctionalityReportInput {
  serviceId: string;
  /** Each part carries its own note or screenshots; the API refuses one with neither. */
  items: {
    slug: string;
    level: 'working' | 'failing';
    description?: string;
    evidenceUrls?: string[];
  }[];
  submitterEmail?: string;
}

export async function submitFunctionalityReport(input: SubmitFunctionalityReportInput) {
  return apiRequest<unknown>('/functionality-reports', {
    method: 'POST',
    unwrap: 'raw',
    verify: 'report',
    body: {
      serviceId: input.serviceId,
      items: input.items,
      submitterEmail: input.submitterEmail ?? null,
      locale: 'en',
    },
  });
}

export type CorrectionType = 'url' | 'description' | 'category' | 'support_email' | 'support_url' | 'other';

export interface SubmitCorrectionInput {
  serviceId: string;
  changes: { correctionType: CorrectionType; proposedValue: string }[];
  submitterEmail?: string;
  evidenceUrls: string[];
}

export async function submitCorrection(input: SubmitCorrectionInput) {
  return apiRequest<unknown>('/corrections', {
    method: 'POST',
    unwrap: 'raw',
    verify: 'correction',
    body: {
      serviceId: input.serviceId,
      changes: input.changes,
      submitterEmail: input.submitterEmail ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
    },
  });
}
