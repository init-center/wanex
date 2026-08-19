import {
  WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS,
  WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT,
  WANEX_DESKTOP_PROOF_SCHEDULE_QUIET_WINDOW_MS,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE,
  WANEX_DESKTOP_PROOF_SCHEDULE_TITLE,
} from "./proof-contract.js"
import {
  runWanexDesktopScheduleCreateAdmissionProof,
  runWanexDesktopScheduleCreateSettlementProof,
  runWanexDesktopScheduleRestoreProof,
  type WanexDesktopScheduleCreateAdmission,
  type WanexDesktopScheduleProofExpected,
} from "./schedule-proof.js"

export function wanexDesktopScheduleCreateAdmissionProofScript(): string {
  return `(${runWanexDesktopScheduleCreateAdmissionProof.toString()})(${JSON.stringify(expected())})`
}

export function wanexDesktopScheduleCreateSettlementProofScript(
  admission: WanexDesktopScheduleCreateAdmission,
): string {
  return `(${runWanexDesktopScheduleCreateSettlementProof.toString()})(${JSON.stringify(expected())}, ${JSON.stringify(admission)})`
}

export function wanexDesktopScheduleRestoreProofScript(): string {
  return `(${runWanexDesktopScheduleRestoreProof.toString()})(${JSON.stringify(expected())})`
}

function expected(): WanexDesktopScheduleProofExpected {
  return {
    title: WANEX_DESKTOP_PROOF_SCHEDULE_TITLE,
    prompt: WANEX_DESKTOP_PROOF_SCHEDULE_PROMPT,
    partialResponse: WANEX_DESKTOP_PROOF_SCHEDULE_PARTIAL_RESPONSE,
    response: WANEX_DESKTOP_PROOF_SCHEDULE_RESPONSE,
    restoredResponse: WANEX_DESKTOP_PROOF_SCHEDULE_RESTORED_RESPONSE,
    intervalSeconds: WANEX_DESKTOP_PROOF_SCHEDULE_INTERVAL_SECONDS,
    quietWindowMs: WANEX_DESKTOP_PROOF_SCHEDULE_QUIET_WINDOW_MS,
  }
}
