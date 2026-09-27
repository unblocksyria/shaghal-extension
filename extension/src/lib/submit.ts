import { submitWithReceipt } from './receipts';
import { saveEmail } from './settings';
import type { TurnstileAction } from './turnstile';

/** Remember only confirmed submissions; a preference failure must not invite resending. */
async function submitPublicForm(path: string, body: Record<string, unknown>, verify: TurnstileAction) {
  const result = await submitWithReceipt(path, body, verify);
  const email = body.submitterEmail;
  if (result.ok && typeof email === 'string' && email.trim() !== '') {
    await saveEmail(email).catch(() => undefined);
  }
  return result;
}

export interface SubmitServiceInput {
  name: string;
  url: string;
  description?: string;
  submitterEmail?: string;
  evidenceUrls: string[];
}

export async function submitService(input: SubmitServiceInput) {
  return submitPublicForm(
    '/submissions',
    {
      name: input.name,
      url: input.url,
      description: input.description ?? null,
      submitterEmail: input.submitterEmail ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
    },
    'submission',
  );
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
  return submitPublicForm(
    '/functionality-reports',
    {
      serviceId: input.serviceId,
      items: input.items,
      submitterEmail: input.submitterEmail ?? null,
      locale: 'en',
    },
    'report',
  );
}

export type CorrectionType = 'url' | 'description' | 'category' | 'support_email' | 'support_url' | 'other';

export interface SubmitCorrectionInput {
  serviceId: string;
  changes: { correctionType: CorrectionType; proposedValue: string }[];
  submitterEmail?: string;
  evidenceUrls: string[];
}

export async function submitCorrection(input: SubmitCorrectionInput) {
  return submitPublicForm(
    '/corrections',
    {
      serviceId: input.serviceId,
      changes: input.changes,
      submitterEmail: input.submitterEmail ?? null,
      evidenceUrls: input.evidenceUrls,
      locale: 'en',
    },
    'correction',
  );
}
