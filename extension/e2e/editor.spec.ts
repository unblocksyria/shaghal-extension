import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { TEST_PAGE_ORIGIN } from './stubs';

const IDLE_HINT = 'Click a screenshot to crop it or hide personal details.';

/**
 * The report form open on the test page, and one screenshot of it taken for
 * "Core use". Taking it opens the editor window, which this returns.
 */
async function captureIntoEditor(context: BrowserContext, page: Page, panel: Page): Promise<Page> {
  await page.goto(`${TEST_PAGE_ORIGIN}/`);
  await page.bringToFront();
  await panel.getByRole('button', { name: 'Report what works' }).click({ timeout: 15_000 });
  await panel.getByRole('radiogroup', { name: 'Core use' }).getByRole('radio', { name: 'Fails' }).click();
  const [editor] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Add screenshot' }).click(),
  ]);
  expect(editor.url()).toContain('/editor.html?session=');
  await expect(editor.getByRole('dialog', { name: 'Edit evidence #1' })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Undo' })).toBeVisible();
  return editor;
}

/** The thumbnail's image size, and the colour at points given as fractions of it. */
function readThumbnail(panel: Page, points: [number, number][] = []) {
  return panel.getByAltText('Evidence #1').evaluate(async (img: HTMLImageElement, at) => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.drawImage(img, 0, 0);
    const colours = at.map(([fx, fy]) =>
      Array.from(context.getImageData(Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data).slice(
        0,
        3,
      ),
    );
    return { width: img.naturalWidth, height: img.naturalHeight, colours };
  }, points);
}

/** A drag across the editor's image, from and to fractions of it. */
async function dragAcross(editor: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await editor.locator('.us-editor-canvas').boundingBox();
  if (box === null) throw new Error('The editor shows no image');
  await editor.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await editor.mouse.down();
  await editor.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await editor.mouse.up();
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

test('a new screenshot opens in the editor; the saved copy is cropped and blacked out in its pixels', async ({
  context,
  page,
  panel,
}) => {
  const editor = await captureIntoEditor(context, page, panel);
  await expect(panel.getByText('Editing evidence #1 in its own window.')).toBeVisible();
  const before = await readThumbnail(panel, [[0.4, 0.5]]);
  // The test page is white away from its heading.
  expect(before.colours[0]).toEqual(WHITE);

  // Black out a band, crop the right side off, then slide the frame right by
  // dragging the dimmed part: all on one surface, no tools to switch.
  await dragAcross(editor, [0.25, 0.25], [0.45, 0.75]);
  await expect(editor.getByRole('img', { name: 'Hidden area 1' })).toBeVisible();
  await dragAcross(editor, [1, 0.5], [0.6, 0.5]);
  await dragAcross(editor, [0.8, 0.5], [0.9, 0.5]);
  await expect(editor.getByRole('button', { name: 'Reset crop' })).toBeVisible();

  await Promise.all([editor.waitForEvent('close'), editor.keyboard.press('Enter')]);
  await expect(panel.getByText(IDLE_HINT)).toBeVisible();

  // Kept: 10% to 70% of the width. The band, 25% to 45%, is now 25% to 58% of it.
  await expect.poll(async () => (await readThumbnail(panel)).width).toBeLessThan(before.width * 0.62);
  const after = await readThumbnail(panel, [
    [0.4, 0.5],
    [0.1, 0.5],
    [0.8, 0.5],
  ]);
  expect(after.width).toBeGreaterThan(before.width * 0.58);
  expect(after.height).toBe(before.height);
  expect(after.colours).toEqual([BLACK, WHITE, WHITE]);

  // Clicking the thumbnail reopens it with the edits, to change them.
  const [again] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Edit evidence #1' }).click(),
  ]);
  await expect(again.getByRole('img', { name: 'Hidden area 1' })).toBeVisible();
  await expect(again.getByRole('button', { name: 'Reset crop' })).toBeVisible();
  // Nothing changed, so Cancel closes without asking and the saved copy stays.
  await Promise.all([again.waitForEvent('close'), again.getByRole('button', { name: 'Cancel' }).click()]);
  expect((await readThumbnail(panel)).width).toBe(after.width);
});

test('opens with the image at its full size, fading in rather than growing', async ({ context, page, panel }) => {
  // Every frame of the editor's opening: the image's size and transform.
  await context.addInitScript(() => {
    if (!location.pathname.endsWith('/editor.html')) return;
    const frames: [number, number, string, number][] = [];
    Object.assign(window, { openingFrames: frames });
    const started = performance.now();
    const record = () => {
      const image = document.querySelector('.us-editor-canvas');
      if (image !== null) {
        const box = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        frames.push([Math.round(box.width), Math.round(box.height), style.transform, Number(style.opacity)]);
      }
      if (performance.now() - started < 1500) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  const editor = await captureIntoEditor(context, page, panel);
  await editor.waitForTimeout(600);

  const frames = await editor.evaluate(
    () => (window as unknown as { openingFrames: [number, number, string, number][] }).openingFrames,
  );
  expect(frames.length).toBeGreaterThan(3);
  const [width, height] = frames.at(-1) ?? [0, 0];
  // Never resized or scaled on the way in: it fades from nearly transparent to fully shown.
  for (const [frameWidth, frameHeight, transform] of frames)
    expect([frameWidth, frameHeight, transform]).toEqual([width, height, 'none']);
  expect(frames[0]?.[3]).toBeLessThan(0.5);
  expect(frames.at(-1)?.[3]).toBe(1);
});

test('asks before discarding edits, and a discard leaves the screenshot as it was', async ({
  context,
  page,
  panel,
}) => {
  const editor = await captureIntoEditor(context, page, panel);
  await dragAcross(editor, [0.25, 0.25], [0.45, 0.75]);

  await editor.getByRole('button', { name: 'Cancel' }).click();
  const question = editor.getByRole('alertdialog', { name: 'Discard your changes?' });
  await expect(question).toBeVisible();
  // Tab stays inside the question: what is behind it is out of reach.
  for (let press = 0; press < 4; press += 1) {
    await editor.keyboard.press('Tab');
    expect(await question.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await question.getByRole('button', { name: 'Keep editing' }).click();
  await expect(question).toBeHidden();
  await expect(editor.getByRole('img', { name: 'Hidden area 1' })).toBeVisible();

  // Escape lets go of the box, then asks; Enter answers with the focused Discard.
  await editor.keyboard.press('Escape');
  await editor.keyboard.press('Escape');
  await expect(question).toBeVisible();
  await Promise.all([editor.waitForEvent('close'), editor.keyboard.press('Enter')]);

  await expect(panel.getByText(IDLE_HINT)).toBeVisible();
  expect((await readThumbnail(panel, [[0.35, 0.5]])).colours[0]).toEqual(WHITE);
});

test('warns before the window is closed on unsaved edits', async ({ context, page, panel }) => {
  const editor = await captureIntoEditor(context, page, panel);
  await dragAcross(editor, [0.25, 0.25], [0.45, 0.75]);

  const warned = new Promise<string>((resolve) =>
    editor.once('dialog', (dialog) => {
      resolve(dialog.type());
      void dialog.dismiss();
    }),
  );
  await editor.close({ runBeforeUnload: true });
  expect(await warned).toBe('beforeunload');
  expect(editor.isClosed()).toBe(false);
  await expect(editor.getByRole('img', { name: 'Hidden area 1' })).toBeVisible();
});

test('treats closing the editor window as cancelling', async ({ context, page, panel }) => {
  const editor = await captureIntoEditor(context, page, panel);
  await expect(panel.getByText('Editing…')).toBeVisible();
  await editor.close();
  await expect(panel.getByText(IDLE_HINT)).toBeVisible();
  await expect(panel.getByText('Editing…')).toBeHidden();
});

test('closes the editor when its screenshot is removed from the form', async ({ context, page, panel }) => {
  const editor = await captureIntoEditor(context, page, panel);
  await Promise.all([editor.waitForEvent('close'), panel.getByRole('button', { name: 'Remove evidence #1' }).click()]);
  await expect(panel.getByAltText('Evidence #1')).toBeHidden();
});

test('keeps to one editor, and sends nothing while a screenshot is open in it', async ({
  context,
  page,
  panel,
  api,
}) => {
  const editor = await captureIntoEditor(context, page, panel);
  await panel.getByPlaceholder('What happened?').fill('Blocked from Syria.');

  await panel.getByRole('button', { name: 'Send report' }).click();
  await expect(panel.getByRole('alert')).toHaveText('Save or cancel the screenshot open in the editor first.');
  const sent = api.calls.filter((call) => ['/uploads/evidence', '/functionality-reports'].includes(call.path));
  expect(sent).toEqual([]);

  // A double click on the thumbnail opens no second window.
  const pages = context.pages().length;
  await panel.getByRole('button', { name: 'Edit evidence #1' }).dblclick();
  await expect(panel.getByRole('button', { name: 'Add another screenshot' })).toBeDisabled();
  await panel.waitForTimeout(500);
  expect(context.pages()).toHaveLength(pages);

  await Promise.all([editor.waitForEvent('close'), editor.getByRole('button', { name: 'Cancel' }).click()]);
  await expect(panel.getByRole('button', { name: 'Add another screenshot' })).toBeEnabled();
});

test('closes an editor with unsaved edits when the panel lets it go, and forgets it', async ({
  context,
  page,
  panel,
}) => {
  const editor = await captureIntoEditor(context, page, panel);
  await dragAcross(editor, [0.25, 0.25], [0.45, 0.75]);
  // The close warning is armed now; the panel's own dismissal must not trip it.
  editor.on('dialog', (dialog) => void dialog.dismiss());

  await Promise.all([editor.waitForEvent('close'), panel.getByRole('button', { name: 'Remove evidence #1' }).click()]);
  // No editor is left behind: a new capture opens a fresh one.
  await expect(panel.getByRole('button', { name: 'Add screenshot' })).toBeEnabled();
  const [next] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('button', { name: 'Add screenshot' }).click(),
  ]);
  await expect(next.getByRole('dialog', { name: 'Edit evidence #1' })).toBeVisible();
});
