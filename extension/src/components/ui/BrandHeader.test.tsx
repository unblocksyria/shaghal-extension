/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { BrandHeader } from './BrandHeader';
import { SITE_BASE } from '../../lib/config';
import { applyLanguage } from '@/lib/i18n';

/** Reset the shared language after each test. */
afterEach(() => applyLanguage('en'));

it('links home in English in a new tab without a referrer, dims under the pointer, and opens Settings', async () => {
  applyLanguage('en');
  const user = userEvent.setup();
  const onOpenSettings = vi.fn();
  render(<BrandHeader onOpenSettings={onOpenSettings} />);

  const home = screen.getByRole('link', { name: 'Unblock Syria home' });
  expect(home).toHaveProperty('href', `${SITE_BASE}/en`);
  expect(home.getAttribute('target')).toBe('_blank');
  expect(home.getAttribute('rel')).toBe('noreferrer');
  await user.hover(home);
  expect(home.style.opacity).toBe('0.85');
  await user.unhover(home);
  expect(home.style.opacity).toBe('1');

  await user.click(screen.getByRole('button', { name: 'Settings' }));
  expect(onOpenSettings).toHaveBeenCalledOnce();
});

it('links home in Arabic', () => {
  applyLanguage('ar');
  render(<BrandHeader onOpenSettings={vi.fn()} />);

  expect(screen.getByRole('link')).toHaveProperty('href', `${SITE_BASE}/ar`);
});
