import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TEST_PAGE_ORIGIN } from './stubs';

/**
 * Accessibility checks of the panel's main states, in English and in the
 * right-to-left Arabic layout (issue 54). Serious and critical violations
 * fail the test. A rule that needs a real fix can be listed in KNOWN with the
 * issue that tracks it, so the check can land before the fix.
 */
const KNOWN: { rule: string; issue: string }[] = [];

async function expectAccessible(panel: Page, state: string): Promise<void> {
  // Cards fade in and buttons change colour over a moment; a check mid-change
  // would measure colours that never stay on screen.
  await panel.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const results = await new AxeBuilder({ page: panel })
    // The default mode finishes in a new tab, which the panel would follow
    // away from the page under test.
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The verification frame is Cloudflare's, so it is not ours to fix.
    .exclude('iframe')
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .filter((violation) => !KNOWN.some((known) => known.rule === violation.id));
  const summary = blocking.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
        .slice(0, 3)
        // The check's own message names the colours and the ratio it measured.
        .map((node) => `${node.target.join(' ')}: ${node.any[0]?.message ?? ''}`)
        .join('\n  ')}`,
  );
  expect(summary, `${state}:\n${summary.join('\n')}`).toEqual([]);
}

/** Answers the page lookup with one of the shared fixtures' shapes. */
async function answerMatch(panel: Page, body: object): Promise<void> {
  await panel
    .context()
    .route('https://api.unblocksyria.com/services/match', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: body }) }),
    );
}

async function showTestPage(page: Page, panel: Page, language: 'en' | 'ar'): Promise<void> {
  await panel.evaluate((value) => chrome.storage.local.set({ language: value, firstRunSeen: true }), language);
  await panel.reload();
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();
}

const T = {
  en: {
    report: 'Report what works',
    correct: 'Suggest Correction',
    settings: 'Settings',
    back: /Back to Netflix/,
    reportNew: 'Report a Service',
    pickTitle: 'Which service is this?',
    firstRun: 'How a test counts',
  },
  ar: {
    report: 'أبلغ عمّا يعمل',
    correct: 'اقترح تصحيحاً',
    settings: 'الإعدادات',
    back: /العودة إلى/,
    reportNew: 'أبلغ عن خدمة',
    pickTitle: 'أي خدمة هي هذه؟',
    firstRun: 'متى يُحتسب الفحص',
  },
};

for (const language of ['en', 'ar'] as const) {
  const t = T[language];

  test(`the matched card, its forms and Settings pass the checks (${language})`, async ({ page, panel }) => {
    await showTestPage(page, panel, language);
    await expect(panel.getByRole('button', { name: t.report })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(panel, 'matched card');

    await panel.getByRole('button', { name: t.report }).click();
    // The stubbed catalogue names parts in English whatever the language, so by position.
    await panel.locator('.us-chip').first().click();
    await panel.getByRole('radiogroup').first().getByRole('radio').first().click();
    await expectAccessible(panel, 'report form');

    await panel.getByRole('button', { name: t.settings }).click();
    await expectAccessible(panel, 'settings');
  });

  test(`the correction form passes the checks (${language})`, async ({ page, panel }) => {
    await showTestPage(page, panel, language);
    await panel.getByRole('button', { name: t.correct }).click({ timeout: 15_000 });
    await panel.getByRole('checkbox').nth(2).click();
    await expectAccessible(panel, 'correction form');
  });

  test(`the pick list passes the checks (${language})`, async ({ page, panel }) => {
    await answerMatch(panel, {
      service: null,
      matchType: null,
      alternatives: [
        {
          id: 'svc-netflix',
          name: 'Netflix',
          slug: 'netflix',
          logoUrl: null,
          availability: 'usable',
          voteCount: 12,
          statusCheckedAt: null,
          company: null,
        },
      ],
    });
    await showTestPage(page, panel, language);
    await expect(panel.getByRole('heading', { name: t.pickTitle })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(panel, 'pick list');
  });

  test(`the untracked card and the new-service form pass the checks (${language})`, async ({ page, panel }) => {
    await answerMatch(panel, { service: null, matchType: null, alternatives: [] });
    await showTestPage(page, panel, language);
    await expect(panel.getByRole('button', { name: t.reportNew })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(panel, 'untracked card');
    await panel.getByRole('button', { name: t.reportNew }).click();
    await expectAccessible(panel, 'new-service form');
  });

  test(`the first-run card passes the checks (${language})`, async ({ page, panel }) => {
    await panel.evaluate((value) => chrome.storage.local.set({ language: value }), language);
    await panel.reload();
    await page.goto(`${TEST_PAGE_ORIGIN}/`);
    await page.bringToFront();
    await expect(panel.getByRole('heading', { name: t.firstRun })).toBeVisible({ timeout: 15_000 });
    await expectAccessible(panel, 'first run');
  });
}

test('the screenshot editor passes the checks', async ({ context, page, panel }) => {
  await showTestPage(page, panel, 'en');
  await panel.getByRole('button', { name: 'Report what works' }).click({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Core use', pressed: false }).click();
  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Still fails' }).click();
  const [editor] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Add screenshot' }).click(),
  ]);
  await expect(editor.getByRole('dialog', { name: 'Edit evidence #1' })).toBeVisible();
  await expectAccessible(editor, 'screenshot editor');
});
