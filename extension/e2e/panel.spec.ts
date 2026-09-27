import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TEST_PAGE_ORIGIN, VERIFICATION_TOKEN } from './stubs';

/** The tester's page in front, the panel following it from its own background tab. */
async function browseToTestPage(page: Page, panel: Page): Promise<void> {
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();
  await expect(panel.getByRole('button', { name: 'Report what works' })).toBeVisible({ timeout: 15_000 });
}

test('loads the built extension and sends a vote against the stubbed API (covers AC-7)', async ({
  page,
  panel,
  api,
}) => {
  await browseToTestPage(page, panel);

  const vote = panel.getByRole('button', { name: /I need this/ });
  await expect(vote).toHaveAttribute('aria-pressed', 'false');

  await vote.click();
  await expect(panel.getByRole('button', { name: /^Voted/ })).toHaveAttribute('aria-pressed', 'true');

  const sent = api.calls.find((call) => call.method === 'POST' && call.path === '/services/netflix/vote');
  expect(sent).toBeDefined();
  expect(sent?.headers['x-turnstile-token']).toBe(VERIFICATION_TOKEN);
  expect(sent?.body).toBeNull();
  expect(api.unstubbed).toEqual([]);
});

test('sends a report from the panel against the stubbed API (covers AC-7)', async ({ page, panel, api }) => {
  await browseToTestPage(page, panel);

  await panel.getByRole('button', { name: 'Report what works' }).click();
  await expect(panel.getByRole('heading', { name: 'Report what works' })).toBeVisible();

  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works' }).click();
  await panel.getByPlaceholder('What happened?').fill('Worked from Syria without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();

  await expect(panel.getByRole('heading', { name: 'Report sent' })).toBeVisible();

  const sent = api.calls.find((call) => call.method === 'POST' && call.path === '/functionality-reports');
  expect(sent).toBeDefined();
  expect(sent?.headers['x-turnstile-token']).toBe(VERIFICATION_TOKEN);
  expect(JSON.parse(sent?.body ?? 'null')).toEqual({
    serviceId: 'svc-netflix',
    items: [{ slug: 'core_use', level: 'working', description: 'Worked from Syria without a VPN.' }],
    submitterEmail: null,
    locale: 'en',
  });
  expect(api.unstubbed).toEqual([]);
});
