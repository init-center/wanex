import type {
  ApproveLocalPluginReviewRequest,
  CancelLocalPluginReviewRequest,
  SetPluginInstallStateRequest
} from "../../plugin-management/model.js"
import type { PluginInstallState } from "@wanex/protocol"
import {
  parseBoundedText,
  parseRecord,
  parseRequiredBoundedIdentityField,
  SurfaceValidationError
} from "./common.js"

export function parseSurfaceApproveLocalPluginReviewRequest(
  input: unknown
): ApproveLocalPluginReviewRequest {
  const context = "approveLocalPluginReview input"
  const record = parseRecord(input, context)
  assertFields(record, ["reviewId", "reason"], context)
  const reason = record.reason
  return {
    reviewId: parseRequiredBoundedIdentityField(record, "reviewId", context),
    ...(reason === undefined
      ? {}
      : { reason: parseBoundedText(reason, `${context}.reason`, 2_000) })
  }
}

export function parseSurfaceCancelLocalPluginReviewRequest(
  input: unknown
): CancelLocalPluginReviewRequest {
  const context = "cancelLocalPluginReview input"
  const record = parseRecord(input, context)
  assertFields(record, ["reviewId"], context)
  return {
    reviewId: parseRequiredBoundedIdentityField(record, "reviewId", context)
  }
}

export function parseSurfaceSetPluginInstallStateRequest(
  input: unknown
): SetPluginInstallStateRequest {
  const context = "setPluginInstallState input"
  const record = parseRecord(input, context)
  assertFields(
    record,
    ["pluginId", "version", "expectedState", "state"],
    context
  )
  return {
    pluginId: parseRequiredBoundedIdentityField(record, "pluginId", context),
    version: parseRequiredBoundedIdentityField(record, "version", context),
    expectedState: parseInstallState(record.expectedState, `${context}.expectedState`),
    state: parseInstallState(record.state, `${context}.state`)
  }
}

function parseInstallState(value: unknown, context: string): PluginInstallState {
  if (value === "installed" || value === "disabled" || value === "removed") {
    return value
  }
  throw new SurfaceValidationError(`${context} is not supported`)
}

function assertFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  context: string
): void {
  const unexpected = Object.keys(record).find((key) => !allowed.includes(key))
  if (unexpected !== undefined) {
    throw new SurfaceValidationError(`${context}.${unexpected} is not supported`)
  }
}
