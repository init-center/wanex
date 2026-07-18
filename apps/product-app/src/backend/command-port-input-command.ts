import {
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
  ProductAppBackendCommandPortRequest,
  ProductAppBackendExplainCommandContributionRequest,
  ProductAppBackendExecuteCommandRequest,
  ProductAppBackendPreviewCommandInvocationRequest
} from "./types.js"

export function parseProductAppBackendPortRequest(
  input: unknown
): ProductAppBackendCommandPortRequest {
  const record = parseRecord("command port request", input)
  return {
    command: parseString(record, "command", "command port request"),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}

export function parseProductAppBackendPortExecuteProductCommandInput(
  input: unknown
): ProductAppBackendExecuteCommandRequest {
  const record = parseRecord("executeProductCommand input", input)
  return {
    commandId: parseString(record, "commandId", "executeProductCommand input"),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}

export function parseProductAppBackendPortExplainCommandContributionInput(
  input: unknown
): ProductAppBackendExplainCommandContributionRequest {
  const record = parseRecord("explainProductCommandContribution input", input)
  return {
    commandId: parseString(
      record,
      "commandId",
      "explainProductCommandContribution input"
    )
  }
}

export function parseProductAppBackendPortPreviewCommandInvocationInput(
  input: unknown
): ProductAppBackendPreviewCommandInvocationRequest {
  const record = parseRecord("previewProductCommandInvocation input", input)
  return {
    commandId: parseString(
      record,
      "commandId",
      "previewProductCommandInvocation input"
    ),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}
