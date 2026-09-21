const API_BASE = 'https://api.unblocksyria.com';

export interface ApiError {
  error: string;
  message: string;
  requestId?: string;
  status: number;
  retryAfterSeconds?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  unwrap?: 'data' | 'raw';
  contentType?: 'json' | 'multipart';
}

function extractRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function parseErrorBody(response: Response): Promise<{ error: string; message: string; requestId?: string }> {
  try {
    const body = await response.json();
    return {
      error: typeof body.error === 'string' ? body.error : 'UNKNOWN_ERROR',
      message: typeof body.message === 'string' ? body.message : response.statusText,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce<T>(path: string, options: RequestOptions): Promise<ApiResult<T>> {
  const isMultipart = options.contentType === 'multipart';
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : isMultipart ? (options.body as FormData) : JSON.stringify(options.body),
    });
  } catch (networkError) {
    return {
      ok: false,
      error: { error: 'NETWORK_ERROR', message: String(networkError), status: 0 },
    };
  }

  if (!response.ok) {
    return { ok: false, error: buildError(response, await parseErrorBody(response)) };
  }

  const payload = await response.json();
  const unwrapped = (options.unwrap ?? 'data') === 'raw' ? payload : payload.data;
  return { ok: true, data: unwrapped as T };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const first = await requestOnce<T>(path, options);
  if (first.ok || first.error.status !== 429) return first;

  const waitMs = (first.error.retryAfterSeconds ?? 60) * 1000;
  await sleep(waitMs);
  return requestOnce<T>(path, options);
}
