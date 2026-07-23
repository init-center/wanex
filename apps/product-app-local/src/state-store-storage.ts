import type {
  ProductAppDensityPreference,
  ProductAppAttachmentDraft,
  ProductAppAttachmentPreviewKind,
  ProductAppLayout,
  ProductAppMode,
  ProductAppStateStore,
  ProductAppStateStoreLoadResult,
  ProductAppThemePreference,
  ProductAppTrustedConversationOperationReference,
  ProductAppTrustedStateSnapshot
} from "@wanex/product-app"
import type { JsonValue, ResourceKind, ResourceState } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export const PRODUCT_APP_STATE_CONFIG_KEY = "product-app.state" as const

export interface CreateStorageProductAppStateStoreOptions {
  readonly storage: Pick<CoreStore, "getConfig" | "putConfig">
  readonly key?: string
}

const layouts: readonly ProductAppLayout[] = [
  "single",
  "split",
  "diagnostics"
]
const modes: readonly ProductAppMode[] = [
  "chat",
  "workbench",
  "diagnostics"
]
const themes: readonly ProductAppThemePreference[] = [
  "system",
  "light",
  "dark"
]
const densities: readonly ProductAppDensityPreference[] = [
  "comfortable",
  "compact"
]
const resourceKinds: readonly ResourceKind[] = [
  "file", "image", "video", "audio", "document", "artifact", "log", "patch", "url"
]
const resourceStates: readonly ResourceState[] = [
  "pending", "fetching", "available", "failed", "expired", "deleted"
]
const attachmentPreviewKinds: readonly ProductAppAttachmentPreviewKind[] = [
  "image", "audio", "video", "document", "file"
]

export function createStorageProductAppStateStore(
  options: CreateStorageProductAppStateStoreOptions
): ProductAppStateStore {
  const key = options.key ?? PRODUCT_APP_STATE_CONFIG_KEY
  return {
    async load(): Promise<ProductAppStateStoreLoadResult> {
      const value = await options.storage.getConfig(key)
      if (value === null) {
        return { found: false }
      }
      return {
        found: true,
        state: persistedStateFromJson(value)
      }
    },
    async save(state): Promise<void> {
      await options.storage.putConfig(key, persistedStateToJson(state))
    }
  }
}

function persistedStateToJson(state: ProductAppTrustedStateSnapshot): JsonValue {
  return {
    ui: {
      ...(state.ui.selectedSessionId === undefined
        ? {}
        : { selectedSessionId: state.ui.selectedSessionId }),
      layout: state.ui.layout,
      mode: state.ui.mode,
      preferences: {
        theme: state.ui.preferences.theme,
        density: state.ui.preferences.density
      }
    },
    trackedConversationOperations: Object.fromEntries(
      Object.entries(state.trackedConversationOperations).map(
        ([sessionId, reference]) => [sessionId, { ...reference }]
      )
    ),
    conversationAttachmentDrafts: Object.fromEntries(
      Object.entries(state.conversationAttachmentDrafts).map(
        ([key, attachments]) => [
          key,
          attachments.map((attachment) => ({ ...attachment }))
        ]
      )
    )
  }
}

function persistedStateFromJson(value: JsonValue): ProductAppTrustedStateSnapshot {
  if (!isRecord(value)) {
    throw new Error("product app persisted state must be an object")
  }
  if (!isRecord(value.ui)) {
    throw new Error("product app persisted state.ui must be an object")
  }
  const ui = value.ui
  const selectedSessionId = optionalNonEmptyString(
    ui.selectedSessionId,
    "ui.selectedSessionId"
  )
  const layout = requiredEnum(ui.layout, layouts, "ui.layout")
  const mode = requiredEnum(ui.mode, modes, "ui.mode")
  const preferences = persistedPreferencesFromJson(ui.preferences)

  return {
    ui: {
      ...(selectedSessionId === undefined ? {} : { selectedSessionId }),
      layout,
      mode,
      preferences
    },
    trackedConversationOperations: persistedConversationReferences(
      value.trackedConversationOperations
    ),
    conversationAttachmentDrafts: persistedAttachmentDrafts(
      value.conversationAttachmentDrafts
    )
  }
}

function persistedAttachmentDrafts(
  value: JsonValue | undefined
): Readonly<Record<string, readonly ProductAppAttachmentDraft[]>> {
  if (!isRecord(value)) {
    throw new Error(
      "product app persisted conversationAttachmentDrafts must be an object"
    )
  }
  return Object.fromEntries(
    Object.entries(value).map(([draftKey, candidates]) => {
      if (!Array.isArray(candidates)) {
        throw new Error(
          `product app persisted attachment draft ${draftKey} must be an array`
        )
      }
      return [
        draftKey,
        candidates.map((candidate, index) =>
          persistedAttachmentFromJson(candidate, `${draftKey}[${index}]`)
        )
      ]
    })
  )
}

function persistedAttachmentFromJson(
  value: JsonValue,
  field: string
): ProductAppAttachmentDraft {
  if (!isRecord(value)) {
    throw new Error(`product app persisted attachment ${field} must be an object`)
  }
  const kind = requiredNonEmptyString(value.kind, `${field}.kind`)
  if (kind !== "product-app.attachment") {
    throw new Error(`product app persisted attachment ${field}.kind is not supported`)
  }
  const sha256 = requiredNonEmptyString(value.sha256, `${field}.sha256`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`product app persisted attachment ${field}.sha256 is invalid`)
  }
  return {
    kind,
    resourceId: requiredNonEmptyString(value.resourceId, `${field}.resourceId`),
    resourceKind: requiredEnum(value.resourceKind, resourceKinds, `${field}.resourceKind`),
    previewKind: requiredEnum(value.previewKind, attachmentPreviewKinds, `${field}.previewKind`),
    state: requiredEnum(value.state, resourceStates, `${field}.state`),
    sizeBytes: requiredPositiveSafeInteger(value.sizeBytes, `${field}.sizeBytes`),
    sha256,
    ...optionalStringValue(value.label, `${field}.label`, "label"),
    ...optionalStringValue(value.mediaType, `${field}.mediaType`, "mediaType"),
    ...optionalPositiveSafeIntegerValue(value.width, `${field}.width`, "width"),
    ...optionalPositiveSafeIntegerValue(value.height, `${field}.height`, "height"),
    ...optionalPositiveSafeIntegerValue(value.durationMs, `${field}.durationMs`, "durationMs"),
    addedAt: requiredNonNegativeSafeInteger(value.addedAt, `${field}.addedAt`)
  }
}

function persistedPreferencesFromJson(
  value: JsonValue | undefined
): ProductAppTrustedStateSnapshot["ui"]["preferences"] {
  if (!isRecord(value)) {
    throw new Error("product app persisted preferences must be an object")
  }
  const theme = requiredEnum(value.theme, themes, "preferences.theme")
  const density = requiredEnum(
    value.density,
    densities,
    "preferences.density"
  )
  return { theme, density }
}

function persistedConversationReferences(
  value: JsonValue | undefined
): Readonly<Record<string, ProductAppTrustedConversationOperationReference>> {
  if (!isRecord(value)) {
    throw new Error(
      "product app persisted trackedConversationOperations must be an object"
    )
  }
  return Object.fromEntries(
    Object.entries(value).map(([sessionId, candidate]) => {
      if (!isRecord(candidate)) {
        throw new Error(
          `product app persisted conversation reference ${sessionId} must be an object`
        )
      }
      const reference = {
        sessionId: requiredNonEmptyString(candidate.sessionId, "reference.sessionId"),
        inputId: requiredNonEmptyString(candidate.inputId, "reference.inputId"),
        turnId: requiredNonEmptyString(candidate.turnId, "reference.turnId"),
        jobId: requiredNonEmptyString(candidate.jobId, "reference.jobId")
      }
      if (reference.sessionId !== sessionId) {
        throw new Error(
          `product app persisted conversation reference key does not match sessionId: ${sessionId}`
        )
      }
      return [sessionId, reference]
    })
  )
}

function optionalNonEmptyString(
  value: JsonValue | undefined,
  field: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`product app persisted ${field} must be a non-empty string`)
  }
  return value
}

function optionalEnum<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`product app persisted ${field} is not supported`)
  }
  return value as T
}

function requiredEnum<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  field: string
): T {
  const parsed = optionalEnum(value, allowed, field)
  if (parsed === undefined) {
    throw new Error(`product app persisted ${field} is required`)
  }
  return parsed
}

function requiredNonEmptyString(
  value: JsonValue | undefined,
  field: string
): string {
  const parsed = optionalNonEmptyString(value, field)
  if (parsed === undefined) {
    throw new Error(`product app persisted ${field} is required`)
  }
  return parsed
}

function requiredPositiveSafeInteger(
  value: JsonValue | undefined,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`product app persisted ${field} must be a positive safe integer`)
  }
  return value as number
}

function requiredNonNegativeSafeInteger(
  value: JsonValue | undefined,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`product app persisted ${field} must be a non-negative safe integer`)
  }
  return value as number
}

function optionalStringValue(
  value: JsonValue | undefined,
  field: string,
  key: string
): Readonly<Record<string, string>> {
  if (value === undefined || value === null) return {}
  return { [key]: requiredNonEmptyString(value, field) }
}

function optionalPositiveSafeIntegerValue(
  value: JsonValue | undefined,
  field: string,
  key: string
): Readonly<Record<string, number>> {
  if (value === undefined || value === null) return {}
  return { [key]: requiredPositiveSafeInteger(value, field) }
}

function isRecord(
  value: JsonValue | undefined
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
