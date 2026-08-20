import type { JsonValue } from "@wanex/protocol"

export type GitProjectionAttentionCode =
  | "binary"
  | "link_or_reparse"
  | "gitlink"
  | "mode_only"
  | "rename"
  | "copy"
  | "unsupported_status"
  | "path_invalid"
  | "identity_drift"
  | "limit_exceeded"
  | "read_failed"

export interface GitProjectionAttention {
  readonly code: GitProjectionAttentionCode
  readonly path?: string
  readonly previousPath?: string
  readonly status?: string
  readonly detail?: string
}

export class GitProjectionError extends Error {
  readonly attention: GitProjectionAttention

  constructor(attention: GitProjectionAttention) {
    super("workspace Git projection requires attention")
    this.name = "GitProjectionError"
    this.attention = attention
  }
}

export function projectionAttention(
  attention: GitProjectionAttention
): GitProjectionError {
  return new GitProjectionError(attention)
}

export function projectionAttentionToJson(
  attention: GitProjectionAttention
): JsonValue {
  return {
    code: attention.code,
    ...(attention.path === undefined ? {} : { path: attention.path }),
    ...(attention.previousPath === undefined
      ? {}
      : { previousPath: attention.previousPath }),
    ...(attention.status === undefined ? {} : { status: attention.status }),
    ...(attention.detail === undefined ? {} : { detail: attention.detail })
  }
}
