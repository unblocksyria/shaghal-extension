import { API_BASE } from './config';
import { turnstileToken, type TurnstileAction } from './turnstile';

export interface ApiError {
  error: string;
  message: string;
  requestId?: string;
  status: number;
  retryAfterSeconds?: number;
}

/** Keep the draft open and make a shared-network cooldown actionable. */
export function formErrorMessage(error: ApiError): string {
  if (error.status !== 429) return error.message;
  const seconds = Math.max(1, Math.ceil(error.retryAfterSeconds ?? 60));
  const amount = seconds < 60 ? seconds : Math.ceil(seconds / 60);
  const unit = seconds < 60 ? 'second' : 'minute';
  const wait = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  return `This shared network is busy. Try again in ${wait}. Keep this panel open to preserve your draft.`;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  signal?: AbortSignal;
  body?: unknown;
  headers?: Record<string, string>;
  unwrap?: 'data' | 'raw';
  contentType?: 'json' | 'multipart';
  /** Attach a Turnstile token solved for this action (see lib/turnstile.ts). */
  verify?: TurnstileAction;
  /**
   * What a successful answer must look like. One that doesn't pass `check` is
   * a BAD_RESPONSE with this `message`, as an unreadable answer is, so a
   * caller never reads fields that are not there.
   */
  expect?: { check: (data: unknown) => boolean; message: string };
}

function badResponse(status: number, message: string): { ok: false; error: ApiError } {
  return { ok: false, error: { error: 'BAD_RESPONSE', message, status } };
}

function extractRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function parseErrorBody(response: Response): Promise<{ error: string; message: string; requestId?: string }> {
  try {
    const body = (await response.json()) as unknown;
    const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    return {
      error: typeof fields.error === 'string' ? fields.error : 'UNKNOWN_ERROR',
      message: typeof fields.message === 'string' ? fields.message : response.statusText,
      requestId: typeof fields.requestId === 'string' ? fields.requestId : undefined,
    };
  } catch {
    return { error: 'UNKNOWN_ERROR', message: response.statusText };
  }
}

function buildError(response: Response, parsed: { error: string; message: string; requestId?: string }): ApiError {
  return {
    ...parsed,
    status: response.status,
    retryAfterSeconds: response.status === 429 ? extractRetryAfter(response) : undefined,
  };
}

/** Long enough for a screenshot upload on a slow connection. */
const TIMEOUT_MS = 60_000;

/** Never throws and never retries: a 429 comes back with `retryAfterSeconds`. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.verify !== undefined) {
    const verification = await turnstileToken(options.verify);
    if (!verification.ok) {
      return { ok: false, error: { error: 'VERIFICATION_FAILED', message: verification.message, status: 0 } };
    }
    if (verification.token.length > 0) headers['X-Turnstile-Token'] = verification.token;
  }

  const isMultipart = options.contentType === 'multipart';
  if (options.body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined
          ? undefined
          : isMultipart
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      // Never forward uploads or verification tokens through an unexpected redirect.
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal:
        options.signal === undefined
          ? AbortSignal.timeout(TIMEOUT_MS)
          : AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch (networkError) {
    const timedOut = networkError instanceof DOMException && networkError.name === 'TimeoutError';
    return {
      ok: false,
      error: {
        error: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: timedOut
          ? 'Unblock Syria took too long to answer. Your request may have arrived; check before sending again.'
          : options.method === 'POST' || options.method === 'DELETE'
            ? 'The request could not be confirmed. It may have arrived; check before sending again.'
            : 'Could not reach Unblock Syria. Check your connection.',
        status: 0,
      },
    };
  }

  if (!response.ok) {
    return { ok: false, error: buildError(response, await parseErrorBody(response)) };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return badResponse(response.status, 'Unblock Syria sent an answer the panel could not read.');
  }
  const unwrapped = (options.unwrap ?? 'data') === 'raw' ? payload : (payload as { data?: unknown } | null)?.data;
  try {
    if (unwrapped === undefined || (options.expect !== undefined && !options.expect.check(unwrapped)))
      return badResponse(response.status, options.expect?.message ?? 'Unblock Syria sent an incomplete answer.');
  } catch {
    return badResponse(response.status, 'Unblock Syria sent an invalid answer.');
  }
  return { ok: true, data: unwrapped as T };
}
