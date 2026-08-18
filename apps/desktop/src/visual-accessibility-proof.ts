import type {
  WanexDesktopNarrowVisualAccessibilityProofResult,
  WanexDesktopNormalVisualAccessibilityProofResult,
} from "./proof-contract.js";

export function wanexDesktopNormalVisualAccessibilityProofScript(): string {
  return visualAccessibilityScript(runNormalVisualAccessibilityProof);
}

export function wanexDesktopNarrowVisualAccessibilityProofScript(): string {
  return visualAccessibilityScript(runNarrowVisualAccessibilityProof);
}

function visualAccessibilityScript(run: () => Promise<unknown>): string {
  return `(() => {
    ${focusableElements.toString()}
    ${tabEvent.toString()}
    ${layoutFitsViewport.toString()}
    ${elementFitsViewport.toString()}
    ${elementVisible.toString()}
    ${elementIntersectsViewport.toString()}
    ${hasReducedMotionRule.toString()}
    ${waitForElement.toString()}
    ${waitForAbsent.toString()}
    ${waitFor.toString()}
    ${nextPaint.toString()}
    return (${run.toString()})();
  })()`;
}

async function runNormalVisualAccessibilityProof(): Promise<
  WanexDesktopNormalVisualAccessibilityProofResult
> {
  await closeSettingsIfOpen();
  await nextPaint();

  const surface = document.querySelector('[data-ui-product-shell]');
  const timeline = surface?.querySelector("[data-ui-conversation-timeline]");
  const composer = surface?.querySelector("[data-ui-composer-dock]");
  const topbar = surface?.querySelector("[data-ui-topbar]");
  const layout = surface?.querySelector("[data-ui-layout]");
  const opener = topbar?.querySelector('[data-ui-action="open-settings"]');
  const completedMessages = [...(surface?.querySelectorAll(
    '[data-ui-conversation-row][data-ui-role="user"], ' +
      '[data-ui-conversation-row][data-ui-role="assistant"]',
  ) ?? [])];

  const soleProductSurface =
    surface instanceof HTMLElement &&
    document.querySelectorAll("[data-ui-product-shell]").length === 1;
  const timelineLogSemantics =
    timeline instanceof HTMLElement &&
    timeline.getAttribute("role") === "log" &&
    timeline.getAttribute("aria-label") === "Conversation messages" &&
    timeline.getAttribute("aria-relevant") === "additions text";
  const completedMessagesUnframed =
    completedMessages.length >= 2 &&
    completedMessages.every((message) =>
      message instanceof HTMLElement &&
      message.tagName === "ARTICLE" &&
      message.querySelector("[data-ui-message-header]") === null
    );
  const productChromeBrandFree =
    surface instanceof HTMLElement &&
    surface.querySelector("[data-ui-brand]") === null &&
    !surface.textContent?.includes("Wanex");
  const noHorizontalOverflow = layoutFitsViewport(surface);
  const composerFullyVisible = elementFitsViewport(composer);
  const reducedMotionRuleShipped = hasReducedMotionRule();

  let settingsOpenerFocused = false;
  let settingsDialogFocused = false;
  let settingsBackgroundInert = false;
  let settingsForwardTabContained = false;
  let settingsBackwardTabContained = false;
  let extensionManagementVisible = false;
  let extensionPathInputAbsent = false;
  let settingsClosedWithEscape = false;
  let settingsFocusRestored = false;

  if (opener instanceof HTMLButtonElement) {
    opener.focus();
    settingsOpenerFocused = document.activeElement === opener;
    opener.click();
    const dialog = await waitForElement<HTMLElement>("[data-ui-settings-panel]");
    settingsDialogFocused = dialog.contains(document.activeElement);
    settingsBackgroundInert =
      topbar?.hasAttribute("inert") === true &&
      layout?.hasAttribute("inert") === true;
    const extensions = dialog.querySelector("[data-ui-extension-settings]");
    extensionManagementVisible = extensions instanceof HTMLElement;
    extensionPathInputAbsent =
      extensions instanceof HTMLElement &&
      extensions.querySelector('input[type="text"], input[type="url"], textarea') === null &&
      !extensions.textContent?.toLowerCase().includes("path");
    const focusable = focusableElements(dialog);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first !== undefined && last !== undefined) {
      last.focus();
      const forward = tabEvent(false);
      last.dispatchEvent(forward);
      settingsForwardTabContained =
        forward.defaultPrevented && document.activeElement === first;

      first.focus();
      const backward = tabEvent(true);
      first.dispatchEvent(backward);
      settingsBackwardTabContained =
        backward.defaultPrevented && document.activeElement === last;
    }
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? dialog).dispatchEvent(escape);
    await waitForAbsent("[data-ui-settings-panel]");
    settingsClosedWithEscape = true;
    settingsFocusRestored = document.activeElement === opener;
  }

  const result = {
    ok: false,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    soleProductSurface,
    timelineLogSemantics,
    completedMessagesUnframed,
    productChromeBrandFree,
    noHorizontalOverflow,
    composerFullyVisible,
    reducedMotionRuleShipped,
    settingsOpenerFocused,
    settingsDialogFocused,
    settingsBackgroundInert,
    settingsForwardTabContained,
    settingsBackwardTabContained,
    extensionManagementVisible,
    extensionPathInputAbsent,
    settingsClosedWithEscape,
    settingsFocusRestored,
  };
  return {
    ...result,
    ok: Object.entries(result).every(([key, value]) =>
      key === "ok" || key.startsWith("viewport") || value === true
    ),
  };

  async function closeSettingsIfOpen(): Promise<void> {
    const close = document.querySelector(
      '[data-ui-settings-panel] [aria-label="Close settings"]',
    );
    if (!(close instanceof HTMLButtonElement)) return;
    close.click();
    await waitForAbsent("[data-ui-settings-panel]");
  }
}

async function runNarrowVisualAccessibilityProof(): Promise<
  WanexDesktopNarrowVisualAccessibilityProofResult
> {
  await nextPaint();
  const surface = document.querySelector('[data-ui-product-shell]');
  const topbar = surface?.querySelector("[data-ui-topbar]");
  const layout = surface?.querySelector("[data-ui-layout]");
  const main = surface?.querySelector("[data-ui-conversation-main]");
  const sidebar = surface?.querySelector("[data-ui-session-drawer]");
  const composer = surface?.querySelector("[data-ui-composer-dock]");
  const trigger = surface?.querySelector('[data-ui-action="open-conversations"]');

  if (sidebar instanceof HTMLElement) {
    await waitFor(() =>
      sidebar.getAttribute("data-ui-drawer-open") === "false" &&
      getComputedStyle(sidebar).visibility === "hidden" &&
      !elementIntersectsViewport(sidebar)
    );
  }

  const mobileNavigationVisible = elementVisible(trigger);
  const sidebarInitiallyHidden =
    sidebar instanceof HTMLElement &&
    sidebar.getAttribute("data-ui-drawer-open") === "false" &&
    getComputedStyle(sidebar).visibility === "hidden" &&
    !elementIntersectsViewport(sidebar);
  const noHorizontalOverflow = layoutFitsViewport(surface);
  const composerFullyVisible = elementFitsViewport(composer);

  let drawerDialogSemantics = false;
  let drawerInitialFocusEntered = false;
  let drawerBackgroundInert = false;
  let drawerForwardTabContained = false;
  let drawerBackwardTabContained = false;
  let drawerClosedWithEscape = false;
  let drawerFocusRestored = false;
  let narrowSettingsFitsViewport = false;
  let narrowExtensionManagementVisible = false;
  let drawerReopenedForScreenshot = false;

  if (trigger instanceof HTMLButtonElement && sidebar instanceof HTMLElement) {
    trigger.focus();
    trigger.click();
    await waitFor(() => sidebar.getAttribute("data-ui-drawer-open") === "true");
    const initial = sidebar.querySelector("[data-ui-initial-focus]");
    if (initial instanceof HTMLElement) {
      await waitFor(() => document.activeElement === initial);
    }
    drawerDialogSemantics =
      sidebar.getAttribute("role") === "dialog" &&
      sidebar.getAttribute("aria-modal") === "true";
    drawerInitialFocusEntered = document.activeElement === initial;
    drawerBackgroundInert =
      topbar?.hasAttribute("inert") === true &&
      main?.hasAttribute("inert") === true;
    const focusable = focusableElements(sidebar);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first !== undefined && last !== undefined) {
      last.focus();
      const forward = tabEvent(false);
      last.dispatchEvent(forward);
      drawerForwardTabContained =
        forward.defaultPrevented && document.activeElement === first;

      first.focus();
      const backward = tabEvent(true);
      first.dispatchEvent(backward);
      drawerBackwardTabContained =
        backward.defaultPrevented && document.activeElement === last;
    }
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? sidebar).dispatchEvent(escape);
    await waitFor(() => sidebar.getAttribute("data-ui-drawer-open") === "false");
    drawerClosedWithEscape = true;
    drawerFocusRestored = document.activeElement === trigger;

    const settingsTrigger = surface?.querySelector('[data-ui-action="open-settings"]');
    if (settingsTrigger instanceof HTMLButtonElement) {
      settingsTrigger.click();
      const settings = await waitForElement<HTMLElement>("[data-ui-settings-panel]");
      const extensions = settings.querySelector("[data-ui-extension-settings]");
      narrowSettingsFitsViewport =
        elementFitsViewport(settings) && layoutFitsViewport(settings);
      narrowExtensionManagementVisible = extensions instanceof HTMLElement;
      const closeSettings = settings.querySelector('[aria-label="Close settings"]');
      if (closeSettings instanceof HTMLButtonElement) closeSettings.click();
      await waitForAbsent("[data-ui-settings-panel]");
    }

    trigger.click();
    await waitFor(() =>
      sidebar.getAttribute("data-ui-drawer-open") === "true" &&
      getComputedStyle(sidebar).visibility === "visible" &&
      getComputedStyle(sidebar).transform === "matrix(1, 0, 0, 1, 0, 0)"
    );
    drawerReopenedForScreenshot = true;
  }

  const result = {
    ok: false,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    mobileNavigationVisible,
    sidebarInitiallyHidden,
    noHorizontalOverflow,
    composerFullyVisible,
    drawerDialogSemantics,
    drawerInitialFocusEntered,
    drawerBackgroundInert,
    drawerForwardTabContained,
    drawerBackwardTabContained,
    drawerClosedWithEscape,
    drawerFocusRestored,
    narrowSettingsFitsViewport,
    narrowExtensionManagementVisible,
    drawerReopenedForScreenshot,
  };
  return {
    ...result,
    ok: Object.entries(result).every(([key, value]) =>
      key === "ok" || key.startsWith("viewport") || value === true
    ),
  };
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>([
    "a[href]",
    "button:not([disabled]):not([tabindex='-1'])",
    "input:not([disabled]):not([type=hidden]):not([tabindex='-1'])",
    "select:not([disabled]):not([tabindex='-1'])",
    "textarea:not([disabled]):not([tabindex='-1'])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","))].filter((element) =>
    element.getAttribute("aria-hidden") !== "true" &&
    element.closest("[hidden]") === null &&
    getComputedStyle(element).visibility !== "hidden"
  );
}

function tabEvent(shiftKey: boolean): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
}

function layoutFitsViewport(surface: Element | null | undefined): boolean {
  if (!(surface instanceof HTMLElement)) return false;
  const rect = surface.getBoundingClientRect();
  return (
    document.documentElement.scrollWidth <= window.innerWidth + 1 &&
    document.body.scrollWidth <= window.innerWidth + 1 &&
    rect.left >= -1 &&
    rect.right <= window.innerWidth + 1
  );
}

function elementFitsViewport(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= -1 &&
    rect.top >= -1 &&
    rect.right <= window.innerWidth + 1 &&
    rect.bottom <= window.innerHeight + 1
  );
}

function elementVisible(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" &&
    elementIntersectsViewport(element);
}

function elementIntersectsViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.right > 0 &&
    rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
}

function hasReducedMotionRule(): boolean {
  return [...document.styleSheets].some((sheet) => {
    try {
      return [...sheet.cssRules].some((rule) =>
        rule.cssText.includes("prefers-reduced-motion: reduce") &&
        rule.cssText.includes("animation-duration: 0.01ms") &&
        rule.cssText.includes("transition-duration: 0.01ms")
      );
    } catch {
      return false;
    }
  });
}

async function waitForElement<T extends Element>(selector: string): Promise<T> {
  return await waitFor(() => {
    const element = document.querySelector(selector);
    return element instanceof Element ? element as T : false;
  });
}

async function waitForAbsent(selector: string): Promise<void> {
  await waitFor(() => document.querySelector(selector) === null);
}

async function waitFor<T>(read: () => T | false): Promise<T> {
  const end = Date.now() + 5_000;
  while (Date.now() < end) {
    const value = read();
    if (value !== false) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("desktop visual accessibility proof timed out");
}

async function nextPaint(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
