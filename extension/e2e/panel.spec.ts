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

test('fits a narrow panel in both themes and keeps Settings labels attached to visible controls', async ({
  page,
  panel,
}) => {
  await panel.setViewportSize({ width: 320, height: 720 });
  await browseToTestPage(page, panel);
  const overflows = () => panel.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(await overflows()).toBe(false);
  await panel.screenshot({ path: 'test-results/review-home-light.png', fullPage: true, animations: 'disabled' });
  await panel.getByRole('button', { name: 'Report what works' }).click();
  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.locator('label:visible').filter({ hasText: 'Your email' }).click();
  await expect(panel.getByRole('textbox', { name: 'Your email' })).toBeFocused();
  // Scoped to Appearance: the Language row below it has a System radio too.
  await panel
    .getByRole('radiogroup', { name: 'Appearance' })
    .getByRole('radio', { name: 'System', exact: true })
    .focus();
  await panel.keyboard.press('End');
  await expect(panel.getByRole('radio', { name: 'Dark', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await overflows()).toBe(false);
  await panel.screenshot({ path: 'test-results/review-settings-dark.png', fullPage: true, animations: 'disabled' });
  await panel.getByRole('button', { name: 'Back', exact: true }).click();
  expect(await overflows()).toBe(false);
  await panel.screenshot({ path: 'test-results/review-report-dark.png', fullPage: true, animations: 'disabled' });
});

test('an interactive verification is modal and Escape cancels without a vote', async ({
  page,
  panel,
  context,
  api,
}) => {
  await context.route('https://verify.unblocksyria.com/extension/turnstile**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Verification</title><button>Challenge</button><script>
      const params = new URLSearchParams(location.search);
      parent.postMessage({type:'unblocksyria-turnstile', nonce:params.get('nonce'), action:params.get('action'), status:'interactive'}, '*');
    </script>`,
    }),
  );
  await browseToTestPage(page, panel);
  await panel.getByRole('button', { name: /I need this/ }).click();
  const dialog = panel.getByRole('dialog', { name: 'Confirm you are human' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await panel.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByText('Verification cancelled.')).toBeVisible();
  expect(api.calls.some((call) => call.path.endsWith('/vote'))).toBe(false);
});

test('keeps a report intact after a shared-network 429 and lets the user retry', async ({
  context,
  page,
  panel,
  api,
}) => {
  let attempts = 0;
  await context.route('**/functionality-reports', async (route) => {
    attempts += 1;
    if (attempts > 1) return route.fallback();
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '42' },
      body: JSON.stringify({ error: 'RATE_LIMITED', message: 'Busy network' }),
    });
  });
  await browseToTestPage(page, panel);
  await panel.getByRole('button', { name: 'Report what works' }).click();
  const choice = panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works' });
  await choice.click();
  await panel.getByPlaceholder('What happened?').fill('Worked from Syria without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByRole('alert')).toContainText('42 seconds');
  await expect(panel.getByPlaceholder('What happened?')).toHaveValue('Worked from Syria without a VPN.');
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  expect(attempts).toBe(1);
  // An explicit retry obtains a fresh verification token; no automatic resend.
  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  expect(attempts).toBe(2);
  expect(api.unstubbed).toEqual([]);
});
