import {
  parseRecord,
  parseString
} from "./core.js"
import type {
  BackendCommandPortRequest,
  BackendExplainCommandContributionRequest,
  BackendExecuteCommandRequest,
  BackendPreviewCommandInvocationRequest
} from "../../model/index.js"

export function parseBackendPortRequest(
  input: unknown
): BackendCommandPortRequest {
  const record = parseRecord("command port request", input)
  return {
    command: parseString(record, "command", "command port request"),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}

export function parseBackendPortExecuteProductCommandInput(
  input: unknown
): BackendExecuteCommandRequest {
  const record = parseRecord("executeProductCommand input", input)
  return {
    commandId: parseString(record, "commandId", "executeProductCommand input"),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}

export function parseBackendPortExplainCommandContributionInput(
  input: unknown
): BackendExplainCommandContributionRequest {
  const record = parseRecord("explainProductCommandContribution input", input)
  return {
    commandId: parseString(
      record,
      "commandId",
      "explainProductCommandContribution input"
    )
  }
}

export function parseBackendPortPreviewCommandInvocationInput(
  input: unknown
): BackendPreviewCommandInvocationRequest {
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
