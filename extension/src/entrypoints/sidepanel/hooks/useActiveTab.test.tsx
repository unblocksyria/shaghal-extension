/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActiveTab } from './useActiveTab';

type QueryCallback = (tabs: chrome.tabs.Tab[]) => void;
type UpdatedListener = (tabId: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => void;

/** chrome.tabs whose answers the test hands out, in whatever order it likes. */
function fakeTabs() {
  const queries: QueryCallback[] = [];
  const activated = new Set<() => void>();
  const updated = new Set<UpdatedListener>();
  const focus = new Set<() => void>();
  let lastError: { message: string } | undefined;
  const event = <T,>(set: Set<T>) => ({
    addListener: (listener: T) => set.add(listener),
    removeListener: (listener: T) => set.delete(listener),
  });
  vi.stubGlobal('chrome', {
    runtime: {
      get lastError() {
        return lastError;
      },
    },
    tabs: {
      query: (_query: unknown, callback: QueryCallback) => queries.push(callback),
      onActivated: event(activated),
      onUpdated: event(updated),
    },
    windows: { onFocusChanged: event(focus) },
  });
  const tab = (url: string, title: string, active = true) => ({ id: 1, url, title, active }) as chrome.tabs.Tab;
  return {
    queries,
    tab,
    /** Answers the n-th query, optionally as an API error. */
    answer: (index: number, tabs: chrome.tabs.Tab[], error?: string) =>
      act(() => {
        lastError = error === undefined ? undefined : { message: error };
        queries[index]?.(tabs);
        lastError = undefined;
      }),
    switchTab: () => act(() => activated.forEach((listener) => listener())),
    focusWindow: () => act(() => focus.forEach((listener) => listener())),
    update: (change: chrome.tabs.OnUpdatedInfo, current: chrome.tabs.Tab) =>
      act(() => updated.forEach((listener) => listener(1, change, current))),
    listening: () => activated.size + updated.size + focus.size,
  };
}

afterEach(() => window.history.replaceState(null, '', '/'));

describe('following the active tab', () => {
  it('starts with no page, then shows the tab it is told about', () => {
    const tabs = fakeTabs();
    const { result } = renderHook(() => useActiveTab());
    expect(result.current).toEqual({ url: null, title: null });
    expect(tabs.queries).toHaveLength(1);

    tabs.answer(0, [tabs.tab('https://one.example/', 'One')]);
    expect(result.current).toEqual({ url: 'https://one.example/', title: 'One' });
  });

  it('asks again on a tab switch, a navigation and a window focus change', () => {
    const tabs = fakeTabs();
    renderHook(() => useActiveTab());
    tabs.switchTab();
    tabs.update({ url: 'https://two.example/' }, tabs.tab('https://two.example/', 'Two'));
    tabs.update({ title: 'Two!' }, tabs.tab('https://two.example/', 'Two!'));
    tabs.focusWindow();
    expect(tabs.queries).toHaveLength(5);
  });

  it('ignores updates that change neither address nor title, and updates to background tabs', () => {
    const tabs = fakeTabs();
    renderHook(() => useActiveTab());
    tabs.update({ status: 'complete' }, tabs.tab('https://one.example/', 'One'));
    tabs.update({ url: 'https://hidden.example/' }, tabs.tab('https://hidden.example/', 'Hidden', false));
    expect(tabs.queries).toHaveLength(1);
  });

  it('keeps the newest answer when an older query answers late', () => {
    const tabs = fakeTabs();
    const { result } = renderHook(() => useActiveTab());
    tabs.switchTab();
    tabs.answer(1, [tabs.tab('https://new.example/', 'New')]);
    tabs.answer(0, [tabs.tab('https://old.example/', 'Old')]);
    expect(result.current).toEqual({ url: 'https://new.example/', title: 'New' });
  });

  it('shows no page when the tabs API reports an error, or no tab', () => {
    const tabs = fakeTabs();
    const { result } = renderHook(() => useActiveTab());
    tabs.answer(0, [tabs.tab('https://one.example/', 'One')]);
    tabs.switchTab();
    tabs.answer(1, [tabs.tab('https://two.example/', 'Two')], 'The tab was closed');
    expect(result.current).toEqual({ url: null, title: null });
    tabs.switchTab();
    tabs.answer(2, []);
    expect(result.current).toEqual({ url: null, title: null });
  });

  it('stops listening when the panel closes, and drops an answer that arrives after', () => {
    const tabs = fakeTabs();
    const { result, unmount } = renderHook(() => useActiveTab());
    expect(tabs.listening()).toBe(3);
    unmount();
    expect(tabs.listening()).toBe(0);
    tabs.answer(0, [tabs.tab('https://late.example/', 'Late')]);
    expect(result.current).toEqual({ url: null, title: null });
  });

  it('renders a preview address instead of following tabs, for viewing a state in a tab', () => {
    const tabs = fakeTabs();
    window.history.replaceState(null, '', '/sidepanel.html?preview=https%3A%2F%2Fpreview.example%2Fpage');
    const { result } = renderHook(() => useActiveTab());
    expect(result.current).toEqual({ url: 'https://preview.example/page', title: null });
    expect(tabs.queries).toHaveLength(0);
    expect(tabs.listening()).toBe(0);
  });

  it('shows an example page where there is no tabs API', () => {
    vi.stubGlobal('chrome', undefined);
    const { result } = renderHook(() => useActiveTab());
    expect(result.current).toEqual({ url: 'https://example.com', title: 'Example' });
  });
});
