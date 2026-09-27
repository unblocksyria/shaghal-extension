import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

// The end to end contract the spec fixes (spec 0001, AC-8).
describe('the end to end run', () => {
  it('retries at most once, only on CI, and keeps the trace of a failure (covers AC-8)', () => {
    expect(config.retries ?? 0).toBeLessThanOrEqual(1);
    if (process.env.CI !== undefined) expect(config.retries).toBe(1);
    expect(config.use?.trace).toBe('retain-on-failure');
    expect(config.use?.navigationTimeout).toBe(15_000);
    expect(config.expect?.timeout).toBe(10_000);
  });
});
