import { apiRequest, type ApiResult } from './api';
import { i18next } from './i18n';
import type { TurnstileAction } from './turnstile';

type PendingReceipt = { key: string; fingerprint: string };

/** Read when it is shown, so it follows the panel's language. */
const uncertainMessage = () => i18next.t('receipts.uncertain');

/** Session storage keeps uncertain delivery markers across panel closures, without storing form contents. */
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
    const stored = (await chrome.storage.session.get(slot))[slot] as PendingReceipt | undefined;
    retained = stored !== undefined;
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
      if (
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
      }
      return { ok: false, error: { error: 'DELIVERY_UNCONFIRMED', message: uncertainMessage(), status: 409 } };
    }
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
  // An unreadable success or server/network failure may follow a completed write.
  // Keep its key; a retry can only retrieve that receipt, never repeat the write.
  const definiteFailure =
    !result.ok &&
    !retained &&
    (result.error.error === 'VERIFICATION_FAILED' ||
      (result.error.status >= 400 &&
        result.error.status < 500 &&
        !['DELIVERY_UNCONFIRMED', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_KEY_EXPIRED'].includes(result.error.error)));
  if (result.ok || definiteFailure) await chrome.storage.session.remove(slot).catch(() => undefined);
  return result;
}
