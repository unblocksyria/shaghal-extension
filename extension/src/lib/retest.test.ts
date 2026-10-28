import { describe, expect, it } from 'vitest';
import type { ServiceFunctionality } from './endpoints';
import { needsRecheck } from './retest';

const part = (
  level: ServiceFunctionality['level'],
  lastObservedAt: string | null,
  changedAt: string | null = null,
): ServiceFunctionality => ({ slug: 'payment', name: 'Payment', level, lastObservedAt, changedAt });

describe('which parts a recheck would clear', () => {
  it('asks for a failing part last checked before 24 August 2026, and not one checked since', () => {
    expect(needsRecheck(part('failing', '2026-08-23T23:59:00.000Z'))).toBe(true);
    expect(needsRecheck(part('failing', '2026-08-24T00:00:00.000Z'))).toBe(false);
  });

  it('goes by when the level changed when no check is dated, and asks when neither is', () => {
    expect(needsRecheck(part('failing', null, '2026-02-01T00:00:00.000Z'))).toBe(true);
    expect(needsRecheck(part('failing', null))).toBe(true);
  });

  it('never asks for a part that works or was never checked', () => {
    expect(needsRecheck(part('working', '2026-01-01T00:00:00.000Z'))).toBe(false);
    expect(needsRecheck(part('unknown', null))).toBe(false);
  });
});
