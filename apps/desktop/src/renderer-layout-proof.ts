import type { WanexDesktopRendererProofResult } from "./proof-contract.js"

export interface WanexDesktopRendererLayoutProof {
  captureInitialLayout(
    surface: Element | null | undefined,
    composer: Element
  ): WanexDesktopRendererProofResult["initialLayout"]
  isTimelineScrollOwner(timeline: HTMLElement): boolean
  intersectsViewport(element: Element | null | undefined): boolean
  emptyInitialLayout(): WanexDesktopRendererProofResult["initialLayout"]
}

export type WanexDesktopRendererLayoutProofFactory =
  () => WanexDesktopRendererLayoutProof

export function wanexDesktopRendererLayoutProofFactorySource(): string {
  return createWanexDesktopRendererLayoutProof.toString()
}

function createWanexDesktopRendererLayoutProof(): WanexDesktopRendererLayoutProof {
  return {
    captureInitialLayout(surface, composer) {
      const sidebar = surface?.querySelector("[data-ui-session-drawer]")
      const conversationTimeline = surface?.querySelector(
        "[data-ui-conversation-timeline]"
      )
      const composeDock = surface?.querySelector(
        "[data-ui-composer-dock]"
      )
      const sidebarRect = sidebar?.getBoundingClientRect()
      const composerRect = composer.getBoundingClientRect()
      const timelineRect = conversationTimeline?.getBoundingClientRect()
      const composeDockRect = composeDock?.getBoundingClientRect()
      const surfaceRect = surface?.getBoundingClientRect()
      const providerSettingsTrigger = document.querySelector(
        '[data-ui-action="open-settings"]'
      )
      const providerSetupDialog = document.querySelector(
        "[data-ui-settings-panel]"
      )
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        shellTop: surfaceRect?.top ?? 0,
        shellBottom: surfaceRect?.bottom ?? 0,
        sidebarWidth: sidebarRect?.width ?? 0,
        timelineHeight: timelineRect?.height ?? 0,
        composerDockHeight: composeDockRect?.height ?? 0,
        composerHeight: composerRect.height,
        shellStartsAtViewportTop:
          surfaceRect !== undefined && Math.abs(surfaceRect.top) < 1,
        shellFitsViewport:
          surfaceRect !== undefined &&
          surfaceRect.bottom <= window.innerHeight + 1,
        noHorizontalOverflow:
          document.documentElement.scrollWidth <= window.innerWidth,
        settingsTriggerFullyVisible: isFullyContainedInViewport(
          providerSettingsTrigger
        ),
        settingsPanelInitiallyClosed: providerSetupDialog === null,
        sidebarVisible: isFullyContainedInViewport(sidebar),
        composerFullyVisible: isFullyContainedInViewport(composer),
        initialScrollPolicyValid:
          surface instanceof HTMLElement &&
          conversationTimeline instanceof HTMLElement &&
          hasValidInitialScrollPolicy(surface, conversationTimeline)
      }
    },
    isTimelineScrollOwner,
    intersectsViewport(element) {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      )
    },
    emptyInitialLayout() {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        shellTop: 0,
        shellBottom: 0,
        sidebarWidth: 0,
        timelineHeight: 0,
        composerDockHeight: 0,
        composerHeight: 0,
        shellStartsAtViewportTop: false,
        shellFitsViewport: false,
        noHorizontalOverflow: false,
        settingsTriggerFullyVisible: false,
        settingsPanelInitiallyClosed: false,
        sidebarVisible: false,
        composerFullyVisible: false,
        initialScrollPolicyValid: false
      }
    }
  }

  function isTimelineScrollOwner(timeline: HTMLElement): boolean {
    const timelineOverflow = getComputedStyle(timeline).overflowY
    return timelineOverflow === "auto" || timelineOverflow === "scroll"
  }

  function hasValidInitialScrollPolicy(
    surface: HTMLElement,
    timeline: HTMLElement
  ): boolean {
    const main = surface.querySelector("[data-ui-conversation-main]")
    if (!(main instanceof HTMLElement)) return false
    const mainOverflow = getComputedStyle(main).overflowY
    return mainOverflow !== "auto" &&
      mainOverflow !== "scroll" &&
      isTimelineScrollOwner(timeline)
  }

  function isFullyContainedInViewport(
    element: Element | null | undefined
  ): boolean {
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    )
  }
}
