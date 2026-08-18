import {
  WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT,
  WANEX_DESKTOP_PROOF_GOAL_CRITERION,
  WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE,
  WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE,
  WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE,
  WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
  WANEX_DESKTOP_PROOF_MULTIMODAL_IMAGE_LABEL,
  WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT,
  WANEX_DESKTOP_PROOF_PLAN_REQUEST,
  WANEX_DESKTOP_PROOF_PLAN_RESPONSE,
  WANEX_DESKTOP_PROOF_PLAN_STEP_ID,
  WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE,
  WANEX_DESKTOP_PROOF_PLAN_SUMMARY,
  WANEX_DESKTOP_PROOF_PLAN_TITLE,
  WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE,
  WANEX_DESKTOP_PROOF_RELAUNCH_CODE,
  WANEX_DESKTOP_PROOF_RELAUNCH_FOLLOW_UP,
  WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
  WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
  WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE,
  WANEX_DESKTOP_PROOF_RELAUNCH_TEXT,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_RESPONSE,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT,
  WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION,
  WANEX_DESKTOP_PROOF_UNSUPPORTED_DRAFT
} from "./proof-contract.js"
import {
  runWanexDesktopProviderCancelRegenerateProof
} from "./provider-cancel-regenerate-proof.js"
import {
  runWanexDesktopProviderGuidedFollowUpAdmissionProof,
  runWanexDesktopProviderGuidedFollowUpSettlementProof,
  type WanexDesktopProviderGuidedFollowUpAdmission
} from "./provider-guided-follow-up-proof.js"
import { runWanexDesktopProviderGoalProof } from "./provider-goal-proof.js"
import {
  runWanexDesktopProviderImageGenerationProof
} from "./provider-image-generation-proof.js"
import {
  runWanexDesktopProviderMultimodalProof
} from "./provider-multimodal-proof.js"
import { runWanexDesktopProviderPlanProof } from "./provider-plan-proof.js"
import {
  runWanexDesktopProviderRelaunchProof
} from "./provider-relaunch-proof.js"
import {
  createWanexDesktopProviderRelaunchProofResult
} from "./provider-relaunch-proof-result.js"
import {
  runWanexDesktopProviderSideQueryAdmissionProof,
  runWanexDesktopProviderSideQuerySettlementProof,
  type WanexDesktopProviderSideQueryAdmission
} from "./provider-side-query-proof.js"
import type {
  WanexDesktopProviderRelaunchProofOptions
} from "./provider-relaunch-proof-types.js"

export type {
  WanexDesktopProviderRelaunchProofOptions
} from "./provider-relaunch-proof-types.js"

export function wanexDesktopProviderRelaunchProofScript(
  options: WanexDesktopProviderRelaunchProofOptions
): string {
  return `(${runWanexDesktopProviderRelaunchProof.toString()})(${JSON.stringify(
    {
      ...options,
      heading: WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
      code: WANEX_DESKTOP_PROOF_RELAUNCH_CODE,
      initialText: WANEX_DESKTOP_PROOF_RELAUNCH_TEXT,
      followUpText: WANEX_DESKTOP_PROOF_RELAUNCH_FOLLOW_UP,
      cancelRegenerateText: WANEX_DESKTOP_PROOF_CANCEL_REGENERATE_TEXT,
      cancelPartialResponse: WANEX_DESKTOP_PROOF_CANCEL_PARTIAL_RESPONSE,
      regeneratedResponse: WANEX_DESKTOP_PROOF_REGENERATED_RESPONSE,
      modelId: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
      response: WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE,
      imageGenerationModelId: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
      imageGenerationText: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_TEXT,
      imageGenerationResponse: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_RESPONSE,
      planRequest: WANEX_DESKTOP_PROOF_PLAN_REQUEST,
      planTitle: WANEX_DESKTOP_PROOF_PLAN_TITLE,
      planSummary: WANEX_DESKTOP_PROOF_PLAN_SUMMARY,
      planStepId: WANEX_DESKTOP_PROOF_PLAN_STEP_ID,
      planStepTitle: WANEX_DESKTOP_PROOF_PLAN_STEP_TITLE,
      planResponse: WANEX_DESKTOP_PROOF_PLAN_RESPONSE,
      goalObjective: WANEX_DESKTOP_PROOF_GOAL_OBJECTIVE,
      goalCriterion: WANEX_DESKTOP_PROOF_GOAL_CRITERION,
      goalFirstResponse: WANEX_DESKTOP_PROOF_GOAL_FIRST_RESPONSE,
      goalFinalResponse: WANEX_DESKTOP_PROOF_GOAL_FINAL_RESPONSE,
      multimodalText: WANEX_DESKTOP_PROOF_MULTIMODAL_TEXT,
      multimodalImageLabel: WANEX_DESKTOP_PROOF_MULTIMODAL_IMAGE_LABEL,
      unsupportedDraft: WANEX_DESKTOP_PROOF_UNSUPPORTED_DRAFT,
      pngBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    }
  )}, ${runWanexDesktopProviderMultimodalProof.toString()}, ${runWanexDesktopProviderImageGenerationProof.toString()}, ${runWanexDesktopProviderPlanProof.toString()}, ${runWanexDesktopProviderGoalProof.toString()}, ${runWanexDesktopProviderCancelRegenerateProof.toString()}, ${createWanexDesktopProviderRelaunchProofResult.toString()})`
}

export function wanexDesktopProviderGuidedFollowUpAdmissionProofScript(): string {
  return `(${runWanexDesktopProviderGuidedFollowUpAdmissionProof.toString()})(${JSON.stringify(
    guidedFollowUpExpected()
  )})`
}

export function wanexDesktopProviderGuidedFollowUpSettlementProofScript(
  admission: WanexDesktopProviderGuidedFollowUpAdmission
): string {
  return `(${runWanexDesktopProviderGuidedFollowUpSettlementProof.toString()})(${JSON.stringify(
    guidedFollowUpExpected()
  )}, ${JSON.stringify(admission)}, ${createWanexDesktopProviderRelaunchProofResult.toString()})`
}

function guidedFollowUpExpected() {
  return {
    modelId: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
    parentText: WANEX_DESKTOP_PROOF_GUIDED_PARENT_TEXT,
    followUpText: WANEX_DESKTOP_PROOF_GUIDED_FOLLOW_UP_TEXT,
    parentPartialResponse:
      WANEX_DESKTOP_PROOF_GUIDED_PARENT_PARTIAL_RESPONSE,
    parentResponse: WANEX_DESKTOP_PROOF_GUIDED_PARENT_RESPONSE,
    childResponse: WANEX_DESKTOP_PROOF_GUIDED_CHILD_RESPONSE
  }
}

export function wanexDesktopProviderSideQueryAdmissionProofScript(): string {
  return `(${runWanexDesktopProviderSideQueryAdmissionProof.toString()})(${JSON.stringify(
    sideQueryExpected()
  )})`
}

export function wanexDesktopProviderSideQuerySettlementProofScript(
  admission: WanexDesktopProviderSideQueryAdmission
): string {
  return `(${runWanexDesktopProviderSideQuerySettlementProof.toString()})(${JSON.stringify(
    sideQueryExpected()
  )}, ${JSON.stringify(admission)}, ${createWanexDesktopProviderRelaunchProofResult.toString()})`
}

function sideQueryExpected() {
  return {
    modelId: WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID,
    parentText: WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_TEXT,
    question: WANEX_DESKTOP_PROOF_SIDE_QUERY_QUESTION,
    answer: WANEX_DESKTOP_PROOF_SIDE_QUERY_ANSWER,
    parentPartialResponse:
      WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_PARTIAL_RESPONSE,
    parentResponse: WANEX_DESKTOP_PROOF_SIDE_QUERY_PARENT_RESPONSE
  }
}
