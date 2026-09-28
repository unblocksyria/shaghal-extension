import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { bakeEdits, openEditableImage, type EditableImage } from '../../lib/imageBake';
import {
  HANDLES,
  commit,
  hasEdits,
  moveRect,
  noEdits,
  redo,
  resizeRect,
  roundRect,
  sameEdits,
  spanRect,
  startHistory,
  undo,
  type EditedScreenshot,
  type Handle,
  type ImageEdits,
  type Point,
  type Rect,
  type Size,
} from '../../lib/imageEdits';

/**
 * Full-window editor for one screenshot. It has no modes. The crop frame is
 * always shown, and dragging inside it draws a black box over names, emails or
 * numbers. Saving renders a new image, so hidden pixels never reach the upload.
 *
 * `onSave` receives the edited image, or null if every edit was undone. With
 * `guardClose` (the editor window), closing with unsaved edits asks first.
 */
export function ScreenshotEditor(props: {
  source: Blob;
  edits?: ImageEdits;
  label: string;
  guardClose?: boolean;
  onCancel: () => void;
  onSave: (edited: EditedScreenshot | null) => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<EditableImage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // showModal makes the form behind inert, focus included.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return () => {
      if (typeof element.close === 'function') element.close();
    };
  }, []);

  useEffect(() => {
    let opened: EditableImage | null = null;
    let cancelled = false;
    openEditableImage(props.source).then(
      (result) => {
        if (cancelled) result.dispose();
        else {
          opened = result;
          setImage(result);
        }
      },
      (error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
      opened?.dispose();
    };
  }, [props.source]);

  return (
    <dialog
      ref={dialog}
      className="us-editor"
      aria-label={t('editor.dialog', { label: props.label })}
      // Once the image is open, Workspace handles Escape so it can clear a
      // selection or confirm discarding edits. Before that, Escape closes.
      onCancel={(event) => {
        event.preventDefault();
        if (image === null) props.onCancel();
      }}
      onClose={props.onCancel}
    >
      {image === null ? (
        <>
          <div className="us-editor-bar">
            <button type="button" className="us-editor-text-btn" onClick={props.onCancel}>
              {t('editor.cancel')}
            </button>
          </div>
          <div className="us-editor-stage us-editor-message" role="status">
            {failed !== null ? (
              t('editor.openFailed', { error: failed })
            ) : (
              <>
                <LoaderCircle size={22} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
                <span className="us-editor-visually-hidden">{t('editor.opening')}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <Workspace
          image={image}
          initial={props.edits ?? noEdits(image)}
          guardClose={props.guardClose ?? false}
          onCancel={props.onCancel}
          onSave={props.onSave}
        />
      )}
    </dialog>
  );
}

/** One drag on the stage, from press to release. */
type Gesture =
  | { kind: 'draw'; start: Point; id: string }
  | { kind: 'box'; id: string; handle: Handle | null; start: Point; rect: Rect }
  | { kind: 'crop'; handle: Handle | null; start: Point; rect: Rect };

/** What a drag is doing, for the cursor and the hint. `frame` moves the crop frame. */
type Dragging = 'draw' | 'box' | 'crop' | 'frame';

/** Image scale and offset on the stage. */
interface Frame {
  scale: number;
  left: number;
  top: number;
}

/** Stage size until measured, and in tests. Roughly a side panel. */
const FALLBACK_STAGE: Size = { width: 360, height: 480 };

/** Room around the image for the crop handles, which sit mostly outside it. */
const STAGE_PADDING = 28;

/** A box smaller than this on screen is a click, not a drag. */
const MIN_DRAWN = 6;

function frameFor(stage: Size, image: Size): Frame {
  const width = Math.max(stage.width - STAGE_PADDING * 2, 1);
  const height = Math.max(stage.height - STAGE_PADDING * 2, 1);
  // Never upscale past one image pixel per screen pixel.
  const scale = Math.min(width / image.width, height / image.height, 1);
  return {
    scale,
    left: (stage.width - image.width * scale) / 2,
    top: (stage.height - image.height * scale) / 2,
  };
}

/**
 * Stage size, measured before first paint so the image doesn't visibly grow
 * into place, and updated on resize.
 */
function useStageSize(stage: React.RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>(FALLBACK_STAGE);
  useLayoutEffect(() => {
    const element = stage.current;
    if (element === null) return;
    const measure = (width: number, height: number) => {
      if (width > 0 && height > 0)
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    const { width, height } = element.getBoundingClientRect();
    measure(width, height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) =>
      measure(entry?.contentRect.width ?? 0, entry?.contentRect.height ?? 0),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [stage]);
  return size;
}

function newBoxId(): string {
  return `box-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function rounded(edits: ImageEdits): ImageEdits {
  return { crop: roundRect(edits.crop), boxes: edits.boxes.map(roundRect) };
}

function Workspace(props: {
  image: EditableImage;
  initial: ImageEdits;
  guardClose: boolean;
  onCancel: () => void;
  onSave: (edited: EditedScreenshot | null) => void;
}) {
  const { t } = useTranslation();
  const { image } = props;
  const full: Rect = { x: 0, y: 0, width: image.width, height: image.height };

  const [history, setHistory] = useState(() => startHistory(props.initial));
  const [draft, setDraft] = useState<ImageEdits | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // The dragged handle, so its resize cursor persists when the pointer leaves it.
  const [resizing, setResizing] = useState<Handle | null>(null);
  // Pointer is over the dimmed area outside the crop, where a drag moves the frame.
  const [overOutside, setOverOutside] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Briefly true after undo, redo or Reset crop, to animate the change. Never
  // set on first layout or resize.
  const [gliding, setGliding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stageSize = useStageSize(stage);

  // Keep focus on the stage, initially and after the discard prompt, so Enter
  // saves instead of activating whichever button had focus.
  useEffect(() => {
    if (!confirming) stage.current?.focus({ preventScroll: true });
  }, [confirming]);
  useEffect(() => () => clearTimeout(glideTimer.current), []);

  const edits = draft ?? history.present;
  const frame = frameFor(stageSize, image);
  const selected = edits.boxes.find((box) => box.id === selectedId) ?? null;
  const cropped = history.present.crop.width < image.width || history.present.crop.height < image.height;
  const dirty = !sameEdits(history.present, props.initial);

  /**
   * In the editor window, fade out before closing so it doesn't vanish
   * mid-frame. In the panel, close immediately.
   */
  const leave = (then: () => void) => {
    if (!props.guardClose) return then();
    setLeaving(true);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setTimeout(then, reduced ? 0 : 140);
  };

  const cancel = () => leave(props.onCancel);

  /** Cancels, confirming first if there are unsaved edits. */
  const requestCancel = () => {
    if (dirty) setConfirming(true);
    else cancel();
  };

  // Also confirm when the window is closed with the browser's close button.
  useEffect(() => {
    if (!props.guardClose || !dirty || leaving) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [props.guardClose, dirty, leaving]);

  const apply = (next: ImageEdits) => setHistory((current) => commit(current, rounded(next)));

  const glide = () => {
    setGliding(true);
    clearTimeout(glideTimer.current);
    glideTimer.current = setTimeout(() => setGliding(false), 260);
  };
  const jump = (step: typeof undo) => {
    glide();
    setDraft(null);
    setHistory(step);
  };

  const toImage = (event: { clientX: number; clientY: number }): Point => {
    const origin = canvas.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return {
      x: (event.clientX - origin.left) / frame.scale,
      y: (event.clientY - origin.top) / frame.scale,
    };
  };

  const insideCrop = (point: Point): boolean => {
    const { crop } = history.present;
    return point.x >= crop.x && point.y >= crop.y && point.x <= crop.x + crop.width && point.y <= crop.y + crop.height;
  };
  const onImage = (point: Point): boolean =>
    point.x >= 0 && point.y >= 0 && point.x <= image.width && point.y <= image.height;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || saving || leaving || target.closest('button') !== null) return;
    const handle = (target.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null) as Handle | null;
    const boxId = target.closest<HTMLElement>('[data-box]')?.dataset.box;
    const point = toImage(event);
    const base = history.present;

    if (boxId !== undefined) {
      const box = base.boxes.find((candidate) => candidate.id === boxId);
      if (box === undefined) return;
      setSelectedId(boxId);
      gesture.current = { kind: 'box', id: boxId, handle, start: point, rect: box };
    } else if (handle !== null && target.closest('[data-crop]') !== null) {
      setSelectedId(null);
      gesture.current = { kind: 'crop', handle, start: point, rect: base.crop };
    } else if (insideCrop(point)) {
      setSelectedId(null);
      gesture.current = { kind: 'draw', start: point, id: newBoxId() };
    } else if (onImage(point)) {
      // Dragging the dimmed area outside the crop moves the crop frame.
      setSelectedId(null);
      gesture.current = { kind: 'crop', handle: null, start: point, rect: base.crop };
    } else {
      setSelectedId(null);
      return;
    }
    const started = gesture.current;
    setDragging(started.kind === 'crop' && started.handle === null ? 'frame' : started.kind);
    setResizing(started.kind === 'draw' ? null : started.handle);
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some environments lack pointer capture. The drag still works within the stage.
    }
  };

  /** The edits a drag produces with the pointer at `point`. */
  const draftFor = (current: Gesture, point: Point): ImageEdits => {
    // Whole-pixel deltas match the committed edges, so moving a box keeps its size exact.
    const dx = Math.round(point.x - current.start.x);
    const dy = Math.round(point.y - current.start.y);
    const base = history.present;
    if (current.kind === 'draw') {
      const rect = spanRect(current.start, point, base.crop);
      return { ...base, boxes: [...base.boxes, { ...rect, id: current.id }] };
    }
    if (current.kind === 'box') {
      const rect =
        current.handle === null
          ? moveRect(current.rect, dx, dy, full)
          : resizeRect(current.rect, current.handle, dx, dy, full, 8 / frame.scale);
      return { ...base, boxes: base.boxes.map((box) => (box.id === current.id ? { ...box, ...rect } : box)) };
    }
    const crop =
      current.handle === null
        ? moveRect(current.rect, dx, dy, full)
        : resizeRect(current.rect, current.handle, dx, dy, full, 48 / frame.scale);
    return { ...base, crop };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    const point = toImage(event);
    if (current === null) {
      const outside = cropped && onImage(point) && !insideCrop(point);
      if (outside !== overOutside) setOverOutside(outside);
      return;
    }
    setDraft(draftFor(current, point));
  };

  const endGesture = () => {
    gesture.current = null;
    setDragging(null);
    setResizing(null);
    setDraft(null);
  };

  // Use the release point, not the last rendered move. A quick release can outrun rendering.
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current === null) return;
    endGesture();
    const final = draftFor(current, toImage(event));
    if (current.kind === 'draw') {
      const drawn = final.boxes.at(-1);
      if (drawn === undefined || drawn.width * frame.scale < MIN_DRAWN || drawn.height * frame.scale < MIN_DRAWN)
        return;
      setSelectedId(drawn.id);
    }
    apply(final);
  };

  const removeSelected = () => {
    if (selected === null) return;
    apply({ ...history.present, boxes: history.present.boxes.filter((box) => box.id !== selected.id) });
    setSelectedId(null);
  };

  const save = async () => {
    if (saving || leaving) return;
    const final = history.present;
    if (sameEdits(final, props.initial)) return cancel();
    if (!hasEdits(final, image)) return leave(() => props.onSave(null));
    setSaving(true);
    setError(null);
    try {
      const edited = { blob: await bakeEdits(image, final), edits: final };
      leave(() => props.onSave(edited));
    } catch (bakeError) {
      setSaving(false);
      setError(t('editor.saveFailed', { error: bakeError instanceof Error ? bakeError.message : String(bakeError) }));
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (saving || leaving) return;
    if (gesture.current !== null) {
      // Mid-drag, ignore keys except Escape, which cancels the drag.
      if (event.key === 'Escape') {
        event.preventDefault();
        endGesture();
      }
      return;
    }
    if (confirming) {
      // The prompt's buttons handle Enter. Escape returns to editing.
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirming(false);
      }
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, summary, a')) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      jump(event.shiftKey ? redo : undo);
    } else if (mod && key === 'y') {
      event.preventDefault();
      jump(redo);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
      event.preventDefault();
      removeSelected();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (selected !== null) setSelectedId(null);
      else requestCancel();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      void save();
    }
  };

  // Listen on window, not the layout. A button that disables itself (Redo at the
  // last step) drops focus to the body, and the editor is modal anyway.
  const keyHandler = useRef(onKeyDown);
  useEffect(() => {
    keyHandler.current = onKeyDown;
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const toStage = (rect: Rect): Box => ({
    left: rect.x * frame.scale,
    top: rect.y * frame.scale,
    width: rect.width * frame.scale,
    height: rect.height * frame.scale,
  });

  const hint =
    error ??
    (dragging === 'crop' || dragging === 'frame'
      ? t('editor.hintOutside')
      : selected !== null
        ? t('editor.hintSelected')
        : overOutside
          ? t('editor.hintFrame')
          : edits.boxes.length === 0 && !cropped
            ? t('editor.hintDraw')
            : cropped
              ? t('editor.hintCropped')
              : t('editor.hintBlackout'));

  return (
    <div className="us-editor-layout" data-leaving={leaving}>
      {/* Inert while the discard prompt is open, so Tab can't reach it. */}
      <div className="us-editor-bar" inert={confirming}>
        <button type="button" className="us-editor-text-btn" onClick={requestCancel} disabled={saving || leaving}>
          {t('editor.cancel')}
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="us-editor-icon-btn"
            aria-label={t('editor.undo')}
            title={t('editor.undoTitle')}
            disabled={saving || history.past.length === 0}
            onClick={() => jump(undo)}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="us-editor-icon-btn"
            aria-label={t('editor.redo')}
            title={t('editor.redoTitle')}
            disabled={saving || history.future.length === 0}
            onClick={() => jump(redo)}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <button type="button" className="us-editor-save" onClick={() => void save()} disabled={saving || leaving}>
          {saving && <LoaderCircle size={14} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />}
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
      </div>

      <div
        ref={stage}
        inert={confirming}
        className="us-editor-stage"
        data-dragging={dragging ?? undefined}
        data-gliding={gliding || undefined}
        data-resizing={resizing ?? undefined}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endGesture}
      >
        <div
          ref={canvas}
          className="us-editor-canvas"
          data-over={overOutside ? 'outside' : undefined}
          style={{
            left: frame.left,
            top: frame.top,
            width: image.width * frame.scale,
            height: image.height * frame.scale,
          }}
        >
          <div className="us-editor-clip">
            <img src={image.url} alt="" draggable={false} />
            {edits.boxes.map((box, index) => (
              <div
                key={box.id}
                data-box={box.id}
                className="us-editor-box"
                role="img"
                aria-label={t('editor.hiddenArea', { n: index + 1 })}
                aria-current={box.id === selected?.id ? 'true' : undefined}
                style={toStage(box)}
              />
            ))}
          </div>

          <CropFrame box={toStage(edits.crop)} active={dragging === 'crop' || dragging === 'frame'} />
          {selected !== null && (
            <BoxHandles
              id={selected.id}
              box={toStage(selected)}
              canvasTop={-frame.top}
              moving={dragging === 'box'}
              onDelete={removeSelected}
            />
          )}
        </div>
      </div>

      <div className="us-editor-footer" inert={confirming}>
        <details style={{ marginBottom: 8 }}>
          <summary>{t('editor.precise')}</summary>
          <fieldset disabled={saving || leaving} style={{ border: 0, padding: '8px 0', margin: 0 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              {t('editor.region')}
              <select
                value={selected?.id ?? 'crop'}
                onChange={(event) => setSelectedId(event.target.value === 'crop' ? null : event.target.value)}
              >
                <option value="crop">{t('editor.cropFrame')}</option>
                {edits.boxes.map((box, index) => (
                  <option key={box.id} value={box.id}>
                    {t('editor.blackBox', { n: index + 1 })}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 8 }}>
              {(['x', 'y', 'width', 'height'] as const).map((field) => {
                const rect = selected ?? edits.crop;
                const max =
                  field === 'x'
                    ? image.width - rect.width
                    : field === 'y'
                      ? image.height - rect.height
                      : field === 'width'
                        ? image.width - rect.x
                        : image.height - rect.y;
                const min = field === 'x' || field === 'y' ? 0 : 1;
                return (
                  <label key={field} style={{ display: 'grid', gap: 3, fontSize: 12 }}>
                    {t(`editor.${({ x: 'left', y: 'top', width: 'width', height: 'height' } as const)[field]}`)}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      step={1}
                      value={rect[field]}
                      style={{ minWidth: 0 }}
                      onChange={(event) => {
                        if (!Number.isFinite(event.target.valueAsNumber)) return;
                        const next = {
                          ...rect,
                          [field]: Math.max(min, Math.min(max, Math.round(event.target.valueAsNumber))),
                        };
                        apply(
                          selected === null
                            ? { ...edits, crop: next }
                            : {
                                ...edits,
                                boxes: edits.boxes.map((box) => (box.id === selected.id ? { ...box, ...next } : box)),
                              },
                        );
                      }}
                    />
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="us-editor-text-btn"
                onClick={() => {
                  const crop = edits.crop;
                  const id = newBoxId();
                  const width = Math.max(1, Math.round(crop.width / 3));
                  const height = Math.max(1, Math.round(crop.height / 8));
                  apply({
                    ...edits,
                    boxes: [
                      ...edits.boxes,
                      {
                        id,
                        x: Math.round(crop.x + (crop.width - width) / 2),
                        y: Math.round(crop.y + (crop.height - height) / 2),
                        width,
                        height,
                      },
                    ],
                  });
                  setSelectedId(id);
                }}
              >
                {t('editor.addBox')}
              </button>
              {selected !== null && (
                <button type="button" className="us-editor-text-btn" onClick={removeSelected}>
                  {t('editor.removeBox')}
                </button>
              )}
            </div>
          </fieldset>
        </details>
        <div className="us-editor-options">
          <p
            key={hint}
            className="us-editor-hint"
            role={error !== null ? 'alert' : undefined}
            data-error={error !== null}
          >
            {hint}
          </p>
          {cropped && (
            <button
              type="button"
              className="us-editor-text-btn"
              onClick={() => {
                glide();
                apply({ ...history.present, crop: full });
              }}
            >
              <RotateCcw size={15} /> {t('editor.resetCrop')}
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="us-editor-confirm-backdrop">
          <div
            className="us-editor-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="us-editor-discard-title"
            aria-describedby="us-editor-discard-text"
          >
            <p id="us-editor-discard-title" className="us-editor-confirm-title">
              {t('editor.discardTitle')}
            </p>
            <p id="us-editor-discard-text" className="us-editor-hint">
              {t('editor.discardText')}
            </p>
            <div className="us-editor-confirm-actions">
              <button type="button" className="us-editor-text-btn" onClick={() => setConfirming(false)}>
                {t('editor.keepEditing')}
              </button>
              <button type="button" className="us-editor-discard" onClick={cancel} autoFocus>
                {t('editor.discard')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A rectangle in the canvas's own pixels. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Crop handles extend CROP_OUT px outside the frame and CROP_IN px inside, so a
 * box drawn near the image edge isn't mistaken for a crop drag. CROP_SIDE is
 * the thickness of the edge handles.
 */
const CROP_OUT = 20;
const CROP_IN = 8;
const CROP_SIDE = 16;

function cropHandleAt(handle: Handle, box: Box): React.CSSProperties {
  const corner = CROP_OUT + CROP_IN;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const x = handle.includes('w') ? box.left - CROP_OUT : handle.includes('e') ? right - CROP_IN : box.left + CROP_IN;
  const y = handle.includes('n') ? box.top - CROP_OUT : handle.includes('s') ? bottom - CROP_IN : box.top + CROP_IN;
  if (handle.length === 2) return { left: x, top: y, width: corner, height: corner };
  if (handle === 'n' || handle === 's') {
    const top = handle === 'n' ? box.top - CROP_SIDE + 4 : bottom - 4;
    return { left: x, top, width: Math.max(box.width - CROP_IN * 2, 0), height: CROP_SIDE };
  }
  const left = handle === 'w' ? box.left - CROP_SIDE + 4 : right - 4;
  return { left, top: y, width: CROP_SIDE, height: Math.max(box.height - CROP_IN * 2, 0) };
}

function CropFrame(props: { box: Box; active: boolean }) {
  return (
    <>
      <div className="us-editor-crop" data-active={props.active} style={props.box}>
        <span className="us-editor-thirds" aria-hidden />
      </div>
      {HANDLES.map((handle) => (
        <div
          key={handle}
          data-crop
          data-handle={handle}
          className="us-editor-crop-handle"
          style={cropHandleAt(handle, props.box)}
          aria-hidden
        >
          <span />
        </div>
      ))}
    </>
  );
}

/**
 * Corner and side grips for the selected box. On small boxes, such as one line
 * of text, grips shrink and side grips are dropped so the middle stays free for
 * moving.
 */
function BoxHandles(props: { id: string; box: Box; canvasTop: number; moving: boolean; onDelete: () => void }) {
  const { t } = useTranslation();
  const { box } = props;
  const grip = Math.max(10, Math.min(24, Math.min(box.width, box.height) / 2));
  // Side grips span between the corner grips. Show them only when they fit and
  // still leave the middle free.
  const handles = HANDLES.filter(
    (handle) =>
      handle.length === 2 ||
      ((handle === 'n' || handle === 's') && box.height >= 40 && box.width >= grip * 2 + 8) ||
      ((handle === 'e' || handle === 'w') && box.width >= 40 && box.height >= grip * 2 + 8),
  );
  // Delete button goes above the box, or below it if there is no room.
  const above = box.top - 44 >= props.canvasTop + 4;
  return (
    <>
      <div className="us-editor-selection" style={box} aria-hidden />
      {handles.map((handle) => {
        const x = handle.includes('w')
          ? box.left
          : handle.includes('e')
            ? box.left + box.width
            : box.left + box.width / 2;
        const y = handle.includes('n')
          ? box.top
          : handle.includes('s')
            ? box.top + box.height
            : box.top + box.height / 2;
        const sideways = handle === 'n' || handle === 's';
        const upright = handle === 'e' || handle === 'w';
        return (
          <div
            key={handle}
            data-box={props.id}
            data-handle={handle}
            className="us-editor-box-handle"
            style={{
              left: x,
              top: y,
              width: sideways ? box.width - grip * 2 : grip,
              height: upright ? box.height - grip * 2 : grip,
            }}
            aria-hidden
          >
            <span />
          </div>
        );
      })}
      {!props.moving && (
        <button
          type="button"
          className="us-editor-float-delete"
          aria-label={t('editor.deleteBox')}
          title={t('editor.deleteTitle')}
          onClick={props.onDelete}
          style={{ left: box.left + box.width / 2, top: above ? box.top - 40 : box.top + box.height + 8 }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </>
  );
}
