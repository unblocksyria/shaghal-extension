import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TEST_PAGE_ORIGIN, VERIFICATION_TOKEN } from './stubs';

/** Brings the test page to the front and waits for the panel, in a background tab, to pick it up. */
async function browseToTestPage(page: Page, panel: Page): Promise<void> {
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();
  await expect(panel.getByRole('button', { name: 'Report what works' })).toBeVisible({ timeout: 15_000 });
}

test('shows an HTTP/2 gateway error on the page card', async ({ page, panel, context }) => {
  await context.route('https://api.unblocksyria.com/services/match', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }),
  );
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();
  await expect(panel.getByText('The server answered with an error (502). Try again in a moment.')).toBeVisible();
});

test('shows a selectable request reference when a vote fails', async ({ page, panel, context }) => {
  await browseToTestPage(page, panel);
  await context.route('https://api.unblocksyria.com/services/netflix/vote', (route) =>
    route.fulfill({ status: 502, json: { error: 'UPSTREAM_ERROR', requestId: 'vote-reference-123' } }),
  );
  await panel.getByRole('button', { name: /I need this/ }).click();
  const error = panel.getByText(/Reference: vote-reference-123/);
  await expect(error).toBeVisible();
  expect(
    await error.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString();
    }),
  ).toContain('Reference: vote-reference-123');
  await expect(error).not.toHaveCSS('user-select', 'none');
});

test('keeps the request reference when a report fails', async ({ page, panel, context }) => {
  await browseToTestPage(page, panel);
  await context.route('https://api.unblocksyria.com/functionality-reports', (route) =>
    route.fulfill({
      status: 400,
      json: { error: 'INVALID_REPORT', message: 'Review the report.', requestId: 'report-123' },
    }),
  );
  await panel.getByRole('button', { name: 'Report what works' }).click();
  await panel.getByRole('button', { name: 'Core use', pressed: false }).click();
  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works now' }).click();
  await panel.getByPlaceholder('What happened?').fill('Works without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByText('Review the report. Reference: report-123')).toBeVisible();
});

test('loads the built extension and sends a vote against the stubbed API', async ({ page, panel, api }) => {
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

test('sends a report from the panel against the stubbed API', async ({ page, panel, api }) => {
  await browseToTestPage(page, panel);

  await panel.getByRole('button', { name: 'Report what works' }).click();
  await expect(panel.getByRole('heading', { name: 'Report what works' })).toBeVisible();

  // Nothing is chosen at first; the tester picks what they tried.
  await expect(panel.getByRole('button', { name: 'Send report' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Core use', pressed: false }).click();
  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works now' }).click();
  await panel.getByPlaceholder('What happened?').fill('Worked from Syria without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();

  await expect(panel.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  await expect(panel.getByText('Core use: Works')).toBeVisible();

  const sent = api.calls.find((call) => call.method === 'POST' && call.path === '/functionality-reports');
  expect(sent).toBeDefined();
  expect(sent?.headers['x-turnstile-token']).toBe(VERIFICATION_TOKEN);
  expect(JSON.parse(sent?.body ?? 'null')).toEqual({
    serviceId: 'svc-netflix',
    items: [{ slug: 'core_use', level: 'working', description: 'Worked from Syria without a VPN.' }],
    submitterEmail: null,
    locale: 'en',
    testedHost: 'stream.test',
  });
  expect(api.unstubbed).toEqual([]);
});

test('searches the catalogue when the page is not tracked, and opens the pick', async ({
  page,
  panel,
  context,
  api,
}) => {
  // No match for the test page: the card turns to the untracked search.
  await context.route('https://api.unblocksyria.com/services/match', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { service: null, matchType: null, alternatives: [] } }),
    }),
  );
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();

  const field = panel.getByRole('searchbox', { name: 'Search for a service' });
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.fill('netf');

  const row = panel.getByRole('button', { name: /Netflix/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('button', { name: 'Report a Service' })).toBeVisible();

  const sent = api.calls.find((call) => call.method === 'GET' && call.path === '/services');
  expect(sent).toBeDefined();
  expect(sent?.body).toBeNull();

  await row.click();
  await expect(panel.getByRole('heading', { name: 'Netflix' })).toBeVisible();
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
  // Scoped because Language also has a System radio.
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

test('an interactive verification shows under the vote button, and Escape cancels without a vote', async ({
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
  const challenge = panel.getByRole('group', { name: 'Confirm you are human' });
  await expect(challenge).toBeVisible();
  // In the card, right below the button that asked, not over the whole panel.
  await expect(panel.getByRole('dialog')).toHaveCount(0);
  const slot = panel.locator('.us-verify-slot').filter({ has: challenge });
  const voteButton = slot.locator('button[aria-pressed]');
  await expect(voteButton).toHaveCount(1);
  expect(
    await voteButton.evaluate(
      (button, box) => (button.compareDocumentPosition(box!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      await challenge.elementHandle(),
    ),
  ).toBe(true);
  await expect(challenge.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await panel.keyboard.press('Escape');
  await expect(challenge).toHaveCount(0);
  await expect(panel.getByText('Verification cancelled.')).toBeVisible();
  expect(api.calls.some((call) => call.path.endsWith('/vote'))).toBe(false);
});

test('a verification needed while a report sends shows under Send and can be cancelled', async ({
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
  await panel.getByRole('button', { name: 'Report what works' }).click();
  await panel.getByRole('button', { name: 'Core use', pressed: false }).click();
  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works now' }).click();
  await panel.getByPlaceholder('What happened?').fill('Worked from Syria without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();

  // The form is busy and its fields are locked, but the challenge sits outside them.
  const challenge = panel.getByRole('group', { name: 'Confirm you are human' });
  await expect(challenge).toBeVisible();
  const cancel = challenge.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(challenge).toHaveCount(0);
  await expect(panel.getByRole('alert')).toContainText('Verification cancelled.');
  await expect(panel.getByPlaceholder('What happened?')).toHaveValue('Worked from Syria without a VPN.');
  expect(api.calls.some((call) => call.path === '/functionality-reports')).toBe(false);
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
  await panel.getByRole('button', { name: 'Core use', pressed: false }).click();
  const choice = panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Works now' });
  await choice.click();
  await panel.getByPlaceholder('What happened?').fill('Worked from Syria without a VPN.');
  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByRole('alert')).toContainText('42 seconds');
  await expect(panel.getByPlaceholder('What happened?')).toHaveValue('Worked from Syria without a VPN.');
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  expect(attempts).toBe(1);
  // Nothing resends on its own. The retry click sends again with a fresh verification token.
  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByRole('heading', { name: 'Report sent' })).toBeVisible();
  expect(attempts).toBe(2);
  expect(api.unstubbed).toEqual([]);
});
