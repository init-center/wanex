import type {
  WanexDesktopProviderRelaunchProofStep
} from "./proof-contract.js"
import type {
  WanexDesktopProviderImageGenerationProofExpected
} from "./provider-image-generation-proof.js"
import type {
  WanexDesktopProviderMultimodalProofExpected
} from "./provider-multimodal-proof.js"
import type {
  WanexDesktopProviderPlanProofExpected
} from "./provider-plan-proof.js"
import type {
  WanexDesktopProviderGoalProofExpected
} from "./provider-goal-proof.js"
import type {
  WanexDesktopProviderCancelRegenerateProofExpected
} from "./provider-cancel-regenerate-proof.js"

export type WanexDesktopProviderRelaunchProofOptions =
  | {
      readonly step: "relaunch-configure"
      readonly providerBaseUrl: string
      readonly credential: string
    }
  | {
      readonly step: Exclude<
        WanexDesktopProviderRelaunchProofStep,
        | "relaunch-configure"
        | "relaunch-guided-follow-up"
        | "relaunch-side-query"
      >
    }

export interface WanexDesktopProviderRelaunchProofExpected
  extends WanexDesktopProviderMultimodalProofExpected,
    WanexDesktopProviderImageGenerationProofExpected,
    WanexDesktopProviderPlanProofExpected,
    WanexDesktopProviderGoalProofExpected,
    WanexDesktopProviderCancelRegenerateProofExpected {
  readonly step: WanexDesktopProviderRelaunchProofStep
  readonly providerBaseUrl?: string
  readonly credential?: string
  readonly heading: string
  readonly code: string
  readonly initialText: string
  readonly followUpText: string
}
