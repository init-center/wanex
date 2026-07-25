export const WANEX_DESKTOP_INVOKE_CHANNEL = "wanex.desktop.v1.invoke"

export interface WanexDesktopBridge {
  invoke(request: unknown): Promise<unknown>
}

export interface WanexElectronBoundarySmokeChecks {
  readonly snapshotOk: boolean
  readonly profilesOk: boolean
  readonly hotConfigOk: boolean
  readonly actionOk: boolean
  readonly isolatedResponse: boolean
  readonly privacyOk: boolean
}

export interface WanexElectronBoundaryRendererTimings {
  readonly rendererInteractive: number
  readonly conversationSettlement: number
  readonly rendererPostSettlement: number
}

export interface WanexElectronBoundaryConversationEvidence {
  readonly sessionId: string
  readonly refreshCount: number
}

export interface WanexElectronBoundaryRendererSmokeResult {
  readonly checks: WanexElectronBoundarySmokeChecks
  readonly timingsMs: WanexElectronBoundaryRendererTimings
  readonly conversation: WanexElectronBoundaryConversationEvidence
}
