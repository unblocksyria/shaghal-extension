import { afterEach, describe, expect, it, vi } from 'vitest';

/** The background definition, built for one browser. */
async function background(firefox: boolean) {
  vi.resetModules();
  vi.doMock('../lib/config', () => ({ IS_FIREFOX: firefox }));
  const definition = (await import('../entrypoints/background')).default;
  return () => {
    if (definition.main === undefined) throw new Error('The background has no main.');
    definition.main();
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.doUnmock('../lib/config'));

describe('the background script', () => {
  it('makes the toolbar button open the side panel in Chrome', async () => {
    const setPanelBehavior = vi.fn(() => Promise.resolve());
    vi.stubGlobal('chrome', { sidePanel: { setPanelBehavior } });
    (await background(false))();
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });

  it('makes the toolbar button toggle the sidebar in Firefox, which has no side panel', async () => {
    const clicks: Array<() => void> = [];
    const toggle = vi.fn(() => Promise.resolve());
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (listener: () => void) => clicks.push(listener) } },
      sidebarAction: { toggle },
    });
    (await background(true))();
    expect(clicks).toHaveLength(1);
    expect(toggle).not.toHaveBeenCalled();
    clicks[0]?.();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('survives a browser that refuses either call', async () => {
    vi.stubGlobal('chrome', { sidePanel: { setPanelBehavior: () => Promise.reject(new Error('refused')) } });
    (await background(false))();
    await settle();

    const clicks: Array<() => void> = [];
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (listener: () => void) => clicks.push(listener) } },
      sidebarAction: { toggle: () => Promise.reject(new Error('refused')) },
    });
    (await background(true))();
    clicks[0]?.();
    await settle();
  });
});
