import { apiRequest, type ApiResult } from './api';
import { i18next } from './i18n';
import type { TurnstileAction } from './turnstile';

type PendingReceipt = { key: string; fingerprint: string };

/** A function so the message is translated at call time. */
const uncertainMessage = () => i18next.t('receipts.uncertain');

/** The API keeps receipts for 24 hours, so an older key can no longer be checked or reused. */
const RECEIPT_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Keys start with their creation time in milliseconds. A key without one is treated as expired. */
function isExpired(key: string): boolean {
  const created = Number(key.slice(0, key.indexOf('.')));
  return !Number.isFinite(created) || Date.now() - created > RECEIPT_LIFETIME_MS;
}

/**
 * POSTs a form with an Idempotency-Key kept in session storage until delivery
 * is certain, so a retry after a lost response cannot create a duplicate. The
 * receipt survives the panel closing and holds only the key and a SHA-256 of
 * the body, never the form contents. If the body changed since an uncertain
 * attempt, the old receipt is looked up instead of sending. A receipt the API
 * no longer knows (expired, or older than 24 hours) is dropped. One it can't
 * confirm stays until the user discards it.
 */
export async function submitWithReceipt(
  path: string,
  body: Record<string, unknown>,
  verify: TurnstileAction,
): Promise<ApiResult<unknown>> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  const fingerprint = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const slot = `pendingReceipt:${path}:${typeof body.serviceId === 'string' ? body.serviceId : 'new-service'}`;
  let receipt: PendingReceipt;
  let retained: boolean;
  try {
    let stored = (await chrome.storage.session.get(slot))[slot] as PendingReceipt | undefined;
    if (stored !== undefined && isExpired(stored.key)) {
      await chrome.storage.session.remove(slot);
      stored = undefined;
    }
    if (stored && stored.fingerprint !== fingerprint) {
      const prior = await apiRequest<{ state: string; status?: number }>('/submission-receipts', {
        method: 'POST',
        body: { key: stored.key },
        unwrap: 'raw',
        expect: {
          check: (value) =>
            typeof value === 'object' &&
            value !== null &&
            ['completed', 'unconfirmed', 'expired'].includes((value as { state: string }).state),
          message: uncertainMessage(),
        },
      });
      if (prior.ok && prior.data.state === 'expired') {
        await chrome.storage.session.remove(slot);
        stored = undefined;
      } else if (
        prior.ok &&
        prior.data.state === 'completed' &&
        typeof prior.data.status === 'number' &&
        Number.isInteger(prior.data.status) &&
        prior.data.status >= 200 &&
        prior.data.status < 500
      ) {
        await chrome.storage.session.remove(slot);
        return {
          ok: false,
          error: {
            error: 'PREVIOUS_DELIVERY_CONFIRMED',
            status: 409,
            message:
              prior.data.status !== undefined && prior.data.status < 300
                ? i18next.t('receipts.received')
                : i18next.t('receipts.refused'),
          },
        };
      } else {
        return {
          ok: false,
          error: {
            error: 'DELIVERY_UNCONFIRMED',
            message: uncertainMessage(),
            status: 409,
            discard: () => chrome.storage.session.remove(slot),
          },
        };
      }
    }
    retained = stored !== undefined;
    receipt = stored ?? { key: `${Date.now()}.${crypto.randomUUID()}`, fingerprint };
    await chrome.storage.session.set({ [slot]: receipt });
  } catch {
    return {
      ok: false,
      error: {
        error: 'RECEIPT_STORAGE_UNAVAILABLE',
        message: i18next.t('receipts.storageFailed'),
        status: 0,
      },
    };
  }
  const result = await apiRequest<unknown>(path, {
    method: 'POST',
    write: true,
    unwrap: 'raw',
    verify,
    body,
    headers: { 'Idempotency-Key': receipt.key },
    expect: {
      check: (value) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { id?: unknown }).id === 'string' &&
        (value as { id: string }).id.length > 0,
      message: i18next.t('receipts.unconfirmed'),
    },
  });
  // A network error, 5xx or unreadable success may follow a completed write, so
  // the key is kept and a retry gets that receipt back instead of writing again.
  const definiteFailure =
    !result.ok &&
    !retained &&
    (result.error.error === 'VERIFICATION_FAILED' ||
      (result.error.status >= 400 &&
        result.error.status < 500 &&
        !['DELIVERY_UNCONFIRMED', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_EXPIRED'].includes(result.error.error)));
  if (result.ok || definiteFailure) await chrome.storage.session.remove(slot).catch(() => undefined);
  // The API no longer knows this key, so no retry can reuse it.
  if (!result.ok && result.error.error === 'IDEMPOTENCY_KEY_EXPIRED') {
    await chrome.storage.session.remove(slot).catch(() => undefined);
    return { ok: false, error: { ...result.error, message: i18next.t('receipts.expired') } };
  }
  return result;
}
