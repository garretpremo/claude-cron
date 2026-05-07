// Tier 1 — chrome eager. These appear on every page; preload to avoid FOUC.
// Tier 2 components import their @m3e/* package inside their wrapper file.
//
// CLAUDE.md rule: when adding a new wrapper, dynamic-import inside the wrapper
// — only add to this file if the component appears on every page's chrome.

import { browser } from "$app/environment";

if (browser) {
  void Promise.all([
    import("@m3e/theme"),
    import("@m3e/app-bar"),
    import("@m3e/icon"),
    import("@m3e/icon-button"),
    import("@m3e/divider"),
    import("@m3e/drawer-container"),
    import("@m3e/nav-menu"),
  ]);
}
