import type {
  ResourceKind,
  ResourceOrigin,
  ResourceSource,
  ResourceState
} from "@wanex/protocol"
import {
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-common.js"

export function expectResourceKind(value: unknown, name: string): ResourceKind {
  const kind = expectString(value, name)
  if (
    kind !== "file" &&
    kind !== "image" &&
    kind !== "video" &&
    kind !== "audio" &&
    kind !== "document" &&
    kind !== "artifact" &&
    kind !== "log" &&
    kind !== "patch" &&
    kind !== "url"
  ) {
    throw new Error(`invalid resource kind: ${kind}`)
  }
  return kind
}

export function expectResourceOrigin(value: unknown, name: string): ResourceOrigin {
  const origin = expectString(value, name)
  if (
    origin !== "user_upload" &&
    origin !== "model_output" &&
    origin !== "tool_output" &&
    origin !== "provider_file" &&
    origin !== "remote_url" &&
    origin !== "system"
  ) {
    throw new Error(`invalid resource origin: ${origin}`)
  }
  return origin
}

export function expectResourceState(value: unknown, name: string): ResourceState {
  const state = expectString(value, name)
  if (
    state !== "pending" &&
    state !== "fetching" &&
    state !== "available" &&
    state !== "failed" &&
    state !== "expired" &&
    state !== "deleted"
  ) {
    throw new Error(`invalid resource state: ${state}`)
  }
  return state
}

export function expectResourceSource(value: unknown): ResourceSource {
  if (!isRecord(value)) {
    throw new Error("resource.source must be an object")
  }
  return withOptionalFields(
    {},
    {
      provider: optionalString(value.provider, "resource.source.provider"),
      providerFileId: optionalString(
        value.provider_file_id,
        "resource.source.provider_file_id"
      ),
      providerOperationId: optionalString(
        value.provider_operation_id,
        "resource.source.provider_operation_id"
      ),
      sourceUrl: optionalString(value.source_url, "resource.source.source_url"),
      sourceExpiresAt: optionalNumber(
        value.source_expires_at,
        "resource.source.source_expires_at"
      )
    }
  )
}
