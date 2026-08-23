export const WANEX_DESKTOP_VISUAL_ACCESSIBILITY_PROOF_STAGES = [
  "normal_viewport",
  "normal_composer_layout",
  "normal_settings_open",
  "normal_settings_focus",
  "normal_settings_close",
  "normal_settings_initial_cleanup",
  "narrow_viewport",
  "narrow_drawer_initially_hidden",
  "narrow_composer_layout",
  "narrow_drawer_open",
  "narrow_drawer_focus",
  "narrow_drawer_close",
  "narrow_settings_open",
  "narrow_settings_close",
  "narrow_drawer_reopen",
  "visual_script_exception",
] as const

export type WanexDesktopVisualAccessibilityProofStage =
  typeof WANEX_DESKTOP_VISUAL_ACCESSIBILITY_PROOF_STAGES[number]

export interface WanexDesktopVisualElementEvidence {
  readonly present: boolean
  readonly rect: null | {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
  readonly visibility: "missing" | "visible" | "hidden" | "other"
  readonly pointerInteractive: boolean
}

export interface WanexDesktopVisualAccessibilityFailureEvidence {
  readonly viewport: {
    readonly width: number
    readonly height: number
    readonly documentScrollWidth: number
    readonly bodyScrollWidth: number
  }
  readonly productSurfacePresent: boolean
  readonly composer: WanexDesktopVisualElementEvidence
  readonly sidebar: WanexDesktopVisualElementEvidence
  readonly drawerState: "missing" | "open" | "closed" | "invalid"
  readonly settingsPresent: boolean
  readonly activeElement:
    | "none"
    | "other"
    | "settings"
    | "sidebar"
    | "open_settings"
    | "open_conversations"
}

export interface WanexDesktopVisualAccessibilityProofFailure {
  readonly code: "condition_timeout" | "unexpected_exception"
  readonly stage: WanexDesktopVisualAccessibilityProofStage
  readonly evidence: WanexDesktopVisualAccessibilityFailureEvidence
}

export type WanexDesktopVisualAccessibilityExecutionResult<Result> =
  | {
      readonly completed: true
      readonly result: Result
    }
  | {
      readonly completed: false
      readonly failure: WanexDesktopVisualAccessibilityProofFailure
    }

export interface WanexDesktopNormalVisualAccessibilityProofResult {
  readonly ok: boolean
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly soleProductSurface: boolean
  readonly timelineLogSemantics: boolean
  readonly completedMessagesUnframed: boolean
  readonly productChromeBrandFree: boolean
  readonly noHorizontalOverflow: boolean
  readonly composerFullyVisible: boolean
  readonly reducedMotionRuleShipped: boolean
  readonly settingsOpenerFocused: boolean
  readonly settingsDialogFocused: boolean
  readonly settingsBackgroundInert: boolean
  readonly settingsForwardTabContained: boolean
  readonly settingsBackwardTabContained: boolean
  readonly extensionManagementVisible: boolean
  readonly extensionPathInputAbsent: boolean
  readonly settingsClosedWithEscape: boolean
  readonly settingsFocusRestored: boolean
}

export interface WanexDesktopNarrowVisualAccessibilityProofResult {
  readonly ok: boolean
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly mobileNavigationVisible: boolean
  readonly sidebarInitiallyHidden: boolean
  readonly noHorizontalOverflow: boolean
  readonly composerFullyVisible: boolean
  readonly drawerDialogSemantics: boolean
  readonly drawerInitialFocusEntered: boolean
  readonly drawerBackgroundInert: boolean
  readonly drawerForwardTabContained: boolean
  readonly drawerBackwardTabContained: boolean
  readonly drawerClosedWithEscape: boolean
  readonly drawerFocusRestored: boolean
  readonly narrowSettingsFitsViewport: boolean
  readonly narrowExtensionManagementVisible: boolean
  readonly drawerReopenedForScreenshot: boolean
}

export interface WanexDesktopVisualAccessibilityProofResult {
  readonly normal: WanexDesktopNormalVisualAccessibilityProofResult
  readonly narrow: WanexDesktopNarrowVisualAccessibilityProofResult
}
