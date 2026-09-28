/** Firefox's sidebar API, which WXT's Chrome-based types leave out. */
interface SidebarAction {
  toggle(): Promise<void>;
}

export default defineBackground(() => {
  if (import.meta.env.FIREFOX) {
    // Firefox has no sidePanel API. The toolbar button toggles the sidebar,
    // which Firefox allows only from the click handler itself.
    const { sidebarAction } = browser as unknown as { sidebarAction: SidebarAction };
    browser.action.onClicked.addListener(() => {
      void sidebarAction.toggle().catch(() => undefined);
    });
    return;
  }
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});
