/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { BrandHeader } from './BrandHeader';

it('links home in a new tab without a referrer, dims under the pointer, and opens Settings', async () => {
  const user = userEvent.setup();
  const onOpenSettings = vi.fn();
  render(<BrandHeader onOpenSettings={onOpenSettings} />);

  const home = screen.getByRole('link', { name: 'Unblock Syria home' });
  expect(home).toHaveProperty('href', 'https://unblocksyria.com/');
  expect(home.getAttribute('target')).toBe('_blank');
  expect(home.getAttribute('rel')).toBe('noreferrer');
  await user.hover(home);
  expect(home.style.opacity).toBe('0.85');
  await user.unhover(home);
  expect(home.style.opacity).toBe('1');

  await user.click(screen.getByRole('button', { name: 'Settings' }));
  expect(onOpenSettings).toHaveBeenCalledOnce();
});
