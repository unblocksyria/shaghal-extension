import type { ServiceFunctionality } from './endpoints';

/**
 * When retesting was asked for: Syria left the US State Sponsors of Terrorism
 * list on 24 August 2026. A failing part last checked before then keeps a
 * service's `needsRetesting` flag on until someone checks that part again,
 * the same rule as the website's "Needs retesting" filter.
 */
export const RETEST_SINCE = '2026-08-24T00:00:00.000Z';

/** A failing part whose last check predates RETEST_SINCE. Only checking this part clears the flag. */
export function needsRecheck(part: ServiceFunctionality): boolean {
  if (part.level !== 'failing') return false;
  const checked = Date.parse(part.lastObservedAt ?? part.changedAt ?? '');
  return !Number.isFinite(checked) || checked < Date.parse(RETEST_SINCE);
}
