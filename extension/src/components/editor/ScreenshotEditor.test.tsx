/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { EditedScreenshot, ImageEdits } from '../../lib/imageEdits';
import { ScreenshotEditor } from './ScreenshotEditor';

// jsdom cannot decode or draw images, so opening one gives a fixed size and
// saving gives marked bytes. The geometry and the flow are what is under test.
const bakes = vi.hoisted(() => [] as ImageEdits[]);
vi.mock('../../lib/imageBake', () => ({
  openEditableImage: () =>
    Promise.resolve({ width: 1000, height: 600, url: 'blob:source', bitmap: {}, dispose: () => undefined }),
  bakeEdits: (_image: unknown, edits: ImageEdits) => {
    bakes.push(edits);
    return Promise.resolve(new Blob(['edited'], { type: 'image/jpeg' }));
  },
}));

/**
 * Without layout the stage keeps its fallback size (360 × 480, less 28 of
 * padding a side), so a 1000 × 600 image is shown at 0.304.
 */
const SCALE = 0.304;

interface Opened {
  user: UserEvent;
  saved: (EditedScreenshot | null)[];
  cancelled: () => number;
}

async function openEditor(edits?: ImageEdits, options: { guardClose?: boolean } = {}): Promise<Opened> {
  bakes.length = 0;
  const saved: (EditedScreenshot | null)[] = [];
  let cancels = 0;
  const user = userEvent.setup();
  render(
    <ScreenshotEditor
      source={new Blob(['capture'])}
      edits={edits}
      label="evidence #1"
      guardClose={options.guardClose}
      onCancel={() => (cancels += 1)}
      onSave={(edited) => saved.push(edited)}
    />,
  );
  await screen.findByRole('button', { name: 'Undo' });
  return { user, saved, cancelled: () => cancels };
}

/** The image on the stage; a drag that starts on it bubbles up to the stage. */
function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.us-editor-canvas');
  if (element === null) throw new Error('The editor shows no image');
  return element;
}

function boxHandle(handle: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-box][data-handle="${handle}"]`);
  if (element === null) throw new Error(`No box handle ${handle}`);
  return element;
}

function cropHandle(handle: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-crop][data-handle="${handle}"]`);
  if (element === null) throw new Error(`No crop handle ${handle}`);
  return element;
}

/** A drag in image pixels, turned into screen pixels at the fallback scale. */
async function drag(user: UserEvent, from: [number, number], to: [number, number], target = stage()) {
  await user.pointer([
    { keys: '[MouseLeft>]', target, coords: { clientX: from[0] * SCALE, clientY: from[1] * SCALE } },
    { target, coords: { clientX: to[0] * SCALE, clientY: to[1] * SCALE } },
    { keys: '[/MouseLeft]', target },
  ]);
}

const boxes = () => screen.queryAllByRole('img', { name: /Hidden area/ });

describe('the screenshot editor', () => {
  it('blacks out a dragged area straight away, with no tool to pick', async () => {
    const { user, saved } = await openEditor();
    expect(screen.getByRole('dialog', { name: 'Edit evidence #1' })).toBeDefined();
    expect(screen.queryByRole('radio')).toBeNull();

    await drag(user, [100, 100], [300, 200]);
    expect(boxes()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    const expected = {
      crop: { x: 0, y: 0, width: 1000, height: 600 },
      boxes: [expect.objectContaining({ x: 100, y: 100, width: 200, height: 100 })],
    };
    expect(bakes).toEqual([expected]);
    expect(saved).toHaveLength(1);
    expect(await saved[0]?.blob.text()).toBe('edited');
    expect(saved[0]?.edits).toEqual(expected);
  });

  it('undoes and redoes with the buttons and the keyboard', async () => {
    const { user } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await drag(user, [500, 300], [700, 400]);
    expect(boxes()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(boxes()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(boxes()).toHaveLength(2);

    // Redo has just disabled itself and dropped focus: the shortcuts must still work.
    await user.keyboard('{Control>}z{/Control}');
    expect(boxes()).toHaveLength(1);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(boxes()).toHaveLength(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Undo' }).disabled).toBe(true);
    await user.keyboard('{Shift>}{Control>}z{/Control}{/Shift}');
    await user.keyboard('{Shift>}{Meta>}z{/Meta}{/Shift}');
    expect(boxes()).toHaveLength(2);
  });

  it('treats a click as a click, not as a tiny box', async () => {
    const { user } = await openEditor();
    await drag(user, [100, 100], [104, 104]);
    expect(boxes()).toHaveLength(0);
  });

  it('keeps a box exactly its size however it is moved', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    const moves: [number, number][] = [
      [13.3, 7.7],
      [-4.6, 21.2],
      [31.9, -0.4],
    ];
    for (const [dx, dy] of moves) await drag(user, [150, 150], [150 + dx, 150 + dy], boxes()[0]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ width: 200, height: 100 })]);
  });

  it('moves the selected box', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await drag(user, [150, 150], [250, 200], boxes()[0]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ x: 200, y: 150, width: 200, height: 100 })]);
  });

  it('deletes the selected box with its floating button or the keyboard', async () => {
    const { user } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Delete this box' }));
    expect(boxes()).toHaveLength(0);

    await drag(user, [100, 100], [300, 200]);
    await user.keyboard('{Backspace}');
    expect(boxes()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Delete this box' })).toBeNull();
  });

  it('crops and hides together, without switching anything', async () => {
    const { user, saved } = await openEditor();
    expect(screen.queryByRole('button', { name: 'Reset crop' })).toBeNull();

    await drag(user, [1000, 600], [600, 400], cropHandle('se'));
    // Straight after cropping, a drag inside the frame draws, kept to the frame.
    await drag(user, [500, 100], [900, 200]);
    await drag(user, [50, 50], [120, 90]);
    expect(boxes()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.crop).toEqual({ x: 0, y: 0, width: 600, height: 400 });
    expect(saved[0]?.edits.boxes).toEqual([
      expect.objectContaining({ x: 500, y: 100, width: 100, height: 100 }),
      expect.objectContaining({ x: 50, y: 50, width: 70, height: 40 }),
    ]);
  });

  it('moves the crop frame by dragging the dimmed part, never past the image', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [1000, 600], [600, 400], cropHandle('se'));
    await drag(user, [800, 500], [900, 600]);
    expect(boxes()).toHaveLength(0);
    // Far past the corner: the frame stops at the image's edge.
    await drag(user, [750, 550], [2000, 2000]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.crop).toEqual({ x: 400, y: 200, width: 600, height: 400 });
  });

  it('never crops smaller than a usable frame', async () => {
    const { user, saved } = await openEditor();
    await drag(user, [1000, 600], [0, 0], cropHandle('se'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const crop = saved[0]?.edits.crop;
    expect(crop?.width).toBeGreaterThanOrEqual(150);
    expect(crop?.height).toBeGreaterThanOrEqual(150);
  });

  it('resizes the selected box from a corner', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await drag(user, [300, 200], [400, 300], boxHandle('se'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ x: 100, y: 100, width: 300, height: 200 })]);
  });

  it('keeps a thin box movable: no side grips to cover its middle', async () => {
    const { user, saved } = await openEditor();
    const grips = () =>
      [...document.querySelectorAll<HTMLElement>('[data-box][data-handle]')].map((grip) => grip.dataset.handle).sort();

    // One line of text: about 24 image pixels, 7 on screen. Only its corners have grips.
    await drag(user, [100, 100], [600, 124]);
    expect(grips()).toEqual(['ne', 'nw', 'se', 'sw']);
    await drag(user, [300, 112], [320, 132], boxes()[0]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ x: 120, y: 120, width: 500, height: 24 })]);
  });

  it('never gives a grip a negative size, on a tall narrow box too', async () => {
    const { user } = await openEditor();
    await drag(user, [100, 100], [130, 500]);
    const grips = [...document.querySelectorAll<HTMLElement>('[data-box][data-handle]')];
    expect(grips.map((grip) => grip.dataset.handle).sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    for (const grip of grips) {
      expect(Number.parseFloat(grip.style.width)).toBeGreaterThan(0);
      expect(Number.parseFloat(grip.style.height)).toBeGreaterThan(0);
    }
  });

  it('takes a drag from where the pointer is let go, however few moves were seen', async () => {
    const { user, saved } = await openEditor();
    const target = stage();
    // Pressed, then released far away with no move in between.
    await user.pointer([
      { keys: '[MouseLeft>]', target, coords: { clientX: 100 * SCALE, clientY: 100 * SCALE } },
      { keys: '[/MouseLeft]', target, coords: { clientX: 300 * SCALE, clientY: 200 * SCALE } },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ x: 100, y: 100, width: 200, height: 100 })]);
  });

  it('holds the keys mid-drag, and Escape drops the drag', async () => {
    const { user, saved } = await openEditor();
    const target = stage();
    await user.pointer([
      { keys: '[MouseLeft>]', target, coords: { clientX: 100 * SCALE, clientY: 100 * SCALE } },
      { target, coords: { clientX: 300 * SCALE, clientY: 200 * SCALE } },
    ]);
    await user.keyboard('{Enter}');
    expect(saved).toEqual([]);
    await user.keyboard('{Escape}');
    await user.pointer({ keys: '[/MouseLeft]', target });
    expect(boxes()).toHaveLength(0);
  });

  it('rests focus on the image, and returns it there after the discard question', async () => {
    const { user } = await openEditor();
    const onStage = () => document.activeElement === document.querySelector('.us-editor-layout .us-editor-stage');
    expect(onStage()).toBe(true);

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onStage()).toBe(true);
  });

  it('puts everything behind the discard question out of reach', async () => {
    const { user } = await openEditor();
    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // jsdom has no inert of its own; the browser test checks that Tab stays in the question.
    const behind = ['.us-editor-bar', '.us-editor-layout .us-editor-stage', '.us-editor-footer'];
    for (const part of behind) expect(document.querySelector(part)?.hasAttribute('inert')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    for (const part of behind) expect(document.querySelector(part)?.hasAttribute('inert')).toBe(false);
  });

  it('never moves a box off the image', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await drag(user, [200, 150], [-500, -500], boxes()[0]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.boxes).toEqual([expect.objectContaining({ x: 0, y: 0, width: 200, height: 100 })]);
  });

  it('glides only when the editor moves things itself, never under the pointer', async () => {
    const { user } = await openEditor();
    const gliding = () => document.querySelector('.us-editor-layout .us-editor-stage')?.hasAttribute('data-gliding');
    expect(gliding()).toBe(false);

    await drag(user, [100, 100], [300, 200]);
    expect(gliding()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(gliding()).toBe(true);
    await waitFor(() => expect(gliding()).toBe(false));

    await drag(user, [1000, 600], [600, 400], cropHandle('se'));
    expect(gliding()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Reset crop' }));
    expect(gliding()).toBe(true);
  });

  it('shows what each drag does in the hint', async () => {
    const { user } = await openEditor();
    expect(screen.getByText(/Drag over names, emails or numbers/)).toBeDefined();

    await drag(user, [100, 100], [300, 200]);
    expect(screen.getByText(/Drag to move it, or drag a corner to resize/)).toBeDefined();

    await user.keyboard('{Escape}');
    expect(screen.getByText(/Drag to black out more/)).toBeDefined();
  });

  it('crops from a side, and Reset crop takes it back', async () => {
    const { user, saved } = await openEditor();

    await drag(user, [0, 300], [200, 300], cropHandle('w'));
    await user.click(screen.getByRole('button', { name: 'Reset crop' }));
    expect(screen.queryByRole('button', { name: 'Reset crop' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved[0]?.edits.crop).toEqual({ x: 200, y: 0, width: 800, height: 600 });
  });

  it('saves with Enter', async () => {
    const { user, saved } = await openEditor();
    await drag(user, [100, 100], [300, 200]);
    await user.keyboard('{Enter}');
    expect(saved).toHaveLength(1);
  });

  it('cancels at once when nothing was changed', async () => {
    const { user, cancelled } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelled()).toBe(1);
    await user.keyboard('{Escape}');
    expect(cancelled()).toBe(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before throwing edits away, and Keep editing keeps them', async () => {
    const { user, cancelled } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const question = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    // Discard has focus, so Enter answers it; Escape goes back.
    expect(document.activeElement).toBe(within(question).getByRole('button', { name: 'Discard' }));

    await user.click(within(question).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(boxes()).toHaveLength(1);
    expect(cancelled()).toBe(0);

    // Escape first lets go of the box, then asks, then goes back to editing.
    await drag(user, [500, 300], [700, 400]);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeDefined();
    // Shortcuts wait while the question is open.
    await user.keyboard('{Control>}z{/Control}');
    expect(boxes()).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(cancelled()).toBe(0);
  });

  it('discards the edits when asked to', async () => {
    const { user, cancelled, saved } = await openEditor();

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(cancelled()).toBe(1);
    expect(saved).toEqual([]);
    expect(bakes).toEqual([]);
  });

  it('opens with earlier edits, and saving none of them restores the capture', async () => {
    const earlier: ImageEdits = {
      crop: { x: 0, y: 0, width: 1000, height: 600 },
      boxes: [{ id: 'earlier', x: 100, y: 100, width: 200, height: 100 }],
    };
    const { user, saved } = await openEditor(earlier);
    expect(boxes()).toHaveLength(1);

    await user.click(boxes()[0] as HTMLElement);
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved).toEqual([null]);
    expect(bakes).toEqual([]);
  });

  it('closes without a new image when nothing changed', async () => {
    const { user, saved, cancelled } = await openEditor();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved).toEqual([]);
    expect(cancelled()).toBe(1);
  });

  it('in its own window, asks before the window closes on unsaved edits', async () => {
    const { user } = await openEditor(undefined, { guardClose: true });
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(closing()).toBe(false);
    await drag(user, [100, 100], [300, 200]);
    expect(closing()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(closing()).toBe(false);

    // Once the edits are discarded the window closes without a second question.
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(closing()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(closing()).toBe(false);
  });

  it('in its own window, still asks before closing while the edits are being saved', async () => {
    const imageBake = await import('../../lib/imageBake');
    const { user } = await openEditor(undefined, { guardClose: true });
    vi.spyOn(imageBake, 'bakeEdits').mockReturnValueOnce(new Promise(() => undefined));

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Saving…' });
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('in its own window, fades out before handing back the edits', async () => {
    const { user, saved } = await openEditor(undefined, { guardClose: true });

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(document.querySelector('.us-editor-layout')?.getAttribute('data-leaving')).toBe('true');
    // Nothing more can be done once it is leaving.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(bakes).toHaveLength(1);
  });

  it('closes with Escape while the screenshot is still opening', async () => {
    const imageBake = await import('../../lib/imageBake');
    vi.spyOn(imageBake, 'openEditableImage').mockReturnValueOnce(new Promise(() => undefined));
    let cancels = 0;
    render(
      <ScreenshotEditor
        source={new Blob(['?'])}
        label="evidence #1"
        onCancel={() => (cancels += 1)}
        onSave={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit evidence #1' });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancels).toBe(1);
  });

  it('says so when the screenshot cannot be opened, and can still be closed', async () => {
    const imageBake = await import('../../lib/imageBake');
    vi.spyOn(imageBake, 'openEditableImage').mockRejectedValueOnce(new Error('not an image'));
    let cancels = 0;
    const user = userEvent.setup();
    render(
      <ScreenshotEditor
        source={new Blob(['?'])}
        label="evidence #1"
        onCancel={() => (cancels += 1)}
        onSave={() => {}}
      />,
    );
    await screen.findByText(/This screenshot could not be opened/);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancels).toBe(1);
  });

  it('keeps the edits and says so when saving fails', async () => {
    const imageBake = await import('../../lib/imageBake');
    const { user, saved } = await openEditor();
    vi.spyOn(imageBake, 'bakeEdits').mockRejectedValueOnce(new Error('out of memory'));

    await drag(user, [100, 100], [300, 200]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save the edits/);
    expect(saved).toEqual([]);
    expect(boxes()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saved).toHaveLength(1);
  });
});
