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

export function parseBackendPortExecuteAssistantCommandInput(
  input: unknown
): BackendExecuteCommandRequest {
  const record = parseRecord("executeAssistantCommand input", input)
  return {
    commandId: parseString(record, "commandId", "executeAssistantCommand input"),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}

export function parseBackendPortExplainCommandContributionInput(
  input: unknown
): BackendExplainCommandContributionRequest {
  const record = parseRecord("explainAssistantCommandContribution input", input)
  return {
    commandId: parseString(
      record,
      "commandId",
      "explainAssistantCommandContribution input"
    )
  }
}

export function parseBackendPortPreviewCommandInvocationInput(
  input: unknown
): BackendPreviewCommandInvocationRequest {
  const record = parseRecord("previewAssistantCommandInvocation input", input)
  return {
    commandId: parseString(
      record,
      "commandId",
      "previewAssistantCommandInvocation input"
    ),
    ...(Object.hasOwn(record, "input") ? { input: record.input } : {})
  }
}
