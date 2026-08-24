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
  runWanexDesktopScheduleDisableBeforeReleaseProof,
  runWanexDesktopScheduleCreateSettlementProof,
  runWanexDesktopScheduleRestoreProof,
  wanexDesktopScheduleSettlementReaderSource,
  type WanexDesktopScheduleCreateAdmission,
  type WanexDesktopScheduleCreatePreRelease,
  type WanexDesktopScheduleProofExpected,
} from "./schedule-proof.js"

export function wanexDesktopScheduleCreateAdmissionProofScript(): string {
  return `(${runWanexDesktopScheduleCreateAdmissionProof.toString()})(${JSON.stringify(expected())}, ${wanexDesktopScheduleSettlementReaderSource()})`
}

export function wanexDesktopScheduleCreateSettlementProofScript(
  admission: WanexDesktopScheduleCreateAdmission,
  preRelease: WanexDesktopScheduleCreatePreRelease,
): string {
  return `(${runWanexDesktopScheduleCreateSettlementProof.toString()})(${JSON.stringify(expected())}, ${JSON.stringify(admission)}, ${JSON.stringify(preRelease)}, ${wanexDesktopScheduleSettlementReaderSource()})`
}

export function wanexDesktopScheduleDisableBeforeReleaseProofScript(
  admission: WanexDesktopScheduleCreateAdmission,
): string {
  return `(${runWanexDesktopScheduleDisableBeforeReleaseProof.toString()})(${JSON.stringify(admission)}, ${wanexDesktopScheduleSettlementReaderSource()})`
}

export function wanexDesktopScheduleRestoreProofScript(): string {
  return `(${runWanexDesktopScheduleRestoreProof.toString()})(${JSON.stringify(expected())}, ${wanexDesktopScheduleSettlementReaderSource()})`
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
