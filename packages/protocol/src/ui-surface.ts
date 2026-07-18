import type { ResourceId } from "./ids.js"
import type { JsonValue } from "./json.js"

export type UiSurfaceProtocol =
  | "a2ui"
  | "markdown"
  | "html-safe"
  | (string & {})

export interface UiSurfaceTextFallback {
  readonly kind: "text"
  readonly text: string
}

export interface UiSurfaceResourceFallback {
  readonly kind: "resource"
  readonly resourceId: ResourceId
  readonly mediaType?: string
  readonly label?: string
}

export type UiSurfaceFallback =
  | UiSurfaceTextFallback
  | UiSurfaceResourceFallback

export interface UiSurfaceActionBridge {
  readonly kind: "runtime"
  readonly route:
    | "session.input"
    | "plugin.action"
    | "tool.call"
    | "app.action"
    | (string & {})
  readonly allowedActions?: readonly string[]
  readonly target?: JsonValue
  readonly metadata?: JsonValue
}

export interface UiSurfaceEnvelope {
  readonly protocol: UiSurfaceProtocol
  readonly version: string
  readonly surfaceKind: string
  readonly payload: JsonValue
  readonly requiredCapabilities?: readonly string[]
  readonly fallback?: UiSurfaceFallback
  readonly actionBridge?: UiSurfaceActionBridge
  readonly metadata?: JsonValue
}

export interface UiSurfaceEmittedPayload {
  readonly surface: UiSurfaceEnvelope
  readonly source?: "message_part" | "tool_result" | "model_output" | "system"
  readonly metadata?: JsonValue
}
