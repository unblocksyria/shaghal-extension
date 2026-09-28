import { IS_FIREFOX } from '../lib/config';

/** Firefox's sidebar API, which the Chrome-based types leave out. */
interface SidebarAction {
  toggle: () => Promise<void>;
}

export default defineBackground(() => {
  if (IS_FIREFOX) {
    // Firefox has no sidePanel API. The toolbar button toggles the sidebar,
    // which Firefox allows only from the click handler itself.
    const { sidebarAction } = chrome as unknown as { sidebarAction: SidebarAction };
    chrome.action.onClicked.addListener(() => {
      void sidebarAction.toggle().catch(() => undefined);
    });
    return;
  }
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});
