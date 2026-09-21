const SENSITIVE_PARAM_PATTERN = /(token|key|secret|password|passwd|auth|session|credential|apikey|access_?token|refresh)/i;

export interface RedactedRequestLog {
  url: string;
  method: string;
  statusCode: number | null;
  error: string | null;
  timestamp: number;
  resourceType: string;
  ip?: string | null;
}

export function redactUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_PARAM_PATTERN.test(key)) {
      parsed.searchParams.set(key, '[REDACTED]');
    }
  }
  return parsed.toString();
}
