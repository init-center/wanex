import type {
  DensityPreference,
  AttachmentDraft,
  AttachmentPreviewKind,
  ConversationSelection,
  Layout,
  Mode,
  StateStore,
  StateStoreLoadResult,
  ThemePreference,
  TrustedConversationOperationReference,
  TrustedStateSnapshot
} from "@wanex/assistant"
import type { JsonValue, ResourceKind, ResourceState } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export const STATE_CONFIG_KEY = "assistant.state" as const

export interface CreateStorageStateStoreOptions {
  readonly storage: Pick<CoreStore, "getConfig" | "putConfig">
  readonly key?: string
}

const layouts: readonly Layout[] = ["single", "split", "diagnostics"]
const modes: readonly Mode[] = ["chat", "workbench", "diagnostics"]
const themes: readonly ThemePreference[] = ["system", "light", "dark"]
const densities: readonly DensityPreference[] = [
  "comfortable",
  "compact"
]
const resourceKinds: readonly ResourceKind[] = [
  "file",
  "image",
  "video",
  "audio",
  "document",
  "artifact",
  "log",
  "patch",
  "url"
]
const resourceStates: readonly ResourceState[] = [
  "pending",
  "fetching",
  "available",
  "failed",
  "expired",
  "deleted"
]
const attachmentPreviewKinds: readonly AttachmentPreviewKind[] = [
  "image",
  "audio",
  "video",
  "document",
  "file"
]

export function createStorageStateStore(
  options: CreateStorageStateStoreOptions
): StateStore {
  const key = options.key ?? STATE_CONFIG_KEY
  return {
    async load(): Promise<StateStoreLoadResult> {
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

function persistedStateToJson(
  state: TrustedStateSnapshot
): JsonValue {
  return {
    ui: {
      ...(state.ui.selection === undefined
        ? {}
        : { selection: { ...state.ui.selection } }),
      ...(state.ui.selectedPlanProposalId === undefined
        ? {}
        : { selectedPlanProposalId: state.ui.selectedPlanProposalId }),
      layout: state.ui.layout,
      mode: state.ui.mode,
      preferences: {
        theme: state.ui.preferences.theme,
        density: state.ui.preferences.density
      }
    },
    trackedConversationOperations: Object.fromEntries(
      Object.entries(state.trackedConversationOperations).map(
        ([sessionId, reference]) => [
          sessionId,
          persistedConversationReferenceToJson(reference)
        ]
      )
    ),
    pendingGuidedFollowUps: Object.fromEntries(
      Object.entries(state.pendingGuidedFollowUps).map(
        ([sessionId, reference]) => [
          sessionId,
          persistedConversationReferenceToJson(reference)
        ]
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

function persistedStateFromJson(
  value: JsonValue
): TrustedStateSnapshot {
  if (!isRecord(value)) {
    throw new Error("application persisted state must be an object")
  }
  if (!isRecord(value.ui)) {
    throw new Error("application persisted state.ui must be an object")
  }
  const ui = value.ui
  assertOnlyKeys(
    ui,
    ["selection", "selectedPlanProposalId", "layout", "mode", "preferences"],
    "ui"
  )
  const selection = persistedSelectionFromJson(ui.selection)
  const selectedPlanProposalId = optionalNonEmptyString(
    ui.selectedPlanProposalId,
    "ui.selectedPlanProposalId"
  )
  const layout = requiredEnum(ui.layout, layouts, "ui.layout")
  const mode = requiredEnum(ui.mode, modes, "ui.mode")
  const preferences = persistedPreferencesFromJson(ui.preferences)

  return {
    ui: {
      ...(selection === undefined ? {} : { selection }),
      ...(selectedPlanProposalId === undefined
        ? {}
        : { selectedPlanProposalId }),
      layout,
      mode,
      preferences
    },
    trackedConversationOperations: persistedConversationReferences(
      value.trackedConversationOperations,
      "trackedConversationOperations"
    ),
    pendingGuidedFollowUps: persistedConversationReferences(
      value.pendingGuidedFollowUps,
      "pendingGuidedFollowUps"
    ),
    conversationAttachmentDrafts: persistedAttachmentDrafts(
      value.conversationAttachmentDrafts
    )
  }
}

function persistedAttachmentDrafts(
  value: JsonValue | undefined
): Readonly<Record<string, readonly AttachmentDraft[]>> {
  if (!isRecord(value)) {
    throw new Error(
      "application persisted conversationAttachmentDrafts must be an object"
    )
  }
  return Object.fromEntries(
    Object.entries(value).map(([draftKey, candidates]) => {
      if (!Array.isArray(candidates)) {
        throw new Error(
          `application persisted attachment draft ${draftKey} must be an array`
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
): AttachmentDraft {
  if (!isRecord(value)) {
    throw new Error(
      `application persisted attachment ${field} must be an object`
    )
  }
  const kind = requiredNonEmptyString(value.kind, `${field}.kind`)
  if (kind !== "assistant.attachment") {
    throw new Error(
      `application persisted attachment ${field}.kind is not supported`
    )
  }
  const sha256 = requiredNonEmptyString(value.sha256, `${field}.sha256`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(
      `application persisted attachment ${field}.sha256 is invalid`
    )
  }
  return {
    kind,
    resourceId: requiredNonEmptyString(value.resourceId, `${field}.resourceId`),
    resourceKind: requiredEnum(
      value.resourceKind,
      resourceKinds,
      `${field}.resourceKind`
    ),
    previewKind: requiredEnum(
      value.previewKind,
      attachmentPreviewKinds,
      `${field}.previewKind`
    ),
    state: requiredEnum(value.state, resourceStates, `${field}.state`),
    sizeBytes: requiredPositiveSafeInteger(
      value.sizeBytes,
      `${field}.sizeBytes`
    ),
    sha256,
    ...optionalStringValue(value.label, `${field}.label`, "label"),
    ...optionalStringValue(value.mediaType, `${field}.mediaType`, "mediaType"),
    ...optionalPositiveSafeIntegerValue(value.width, `${field}.width`, "width"),
    ...optionalPositiveSafeIntegerValue(
      value.height,
      `${field}.height`,
      "height"
    ),
    ...optionalPositiveSafeIntegerValue(
      value.durationMs,
      `${field}.durationMs`,
      "durationMs"
    ),
    addedAt: requiredNonNegativeSafeInteger(value.addedAt, `${field}.addedAt`)
  }
}

function persistedPreferencesFromJson(
  value: JsonValue | undefined
): TrustedStateSnapshot["ui"]["preferences"] {
  if (!isRecord(value)) {
    throw new Error("application persisted preferences must be an object")
  }
  const theme = requiredEnum(value.theme, themes, "preferences.theme")
  const density = requiredEnum(value.density, densities, "preferences.density")
  return { theme, density }
}

function persistedConversationReferences(
  value: JsonValue | undefined,
  field: "trackedConversationOperations" | "pendingGuidedFollowUps"
): Readonly<Record<string, TrustedConversationOperationReference>> {
  if (!isRecord(value)) {
    throw new Error(`application persisted ${field} must be an object`)
  }
  return Object.fromEntries(
    Object.entries(value).map(([sessionId, candidate]) => {
      if (!isRecord(candidate)) {
        throw new Error(
          `application persisted conversation reference ${sessionId} must be an object`
        )
      }
      assertOnlyKeys(
        candidate,
        ["sessionId", "inputId", "turnId", "jobId", "submission"],
        `${field}.${sessionId}`
      )
      const reference = {
        sessionId: requiredNonEmptyString(
          candidate.sessionId,
          "reference.sessionId"
        ),
        inputId: requiredNonEmptyString(candidate.inputId, "reference.inputId"),
        turnId: requiredNonEmptyString(candidate.turnId, "reference.turnId"),
        jobId: requiredNonEmptyString(candidate.jobId, "reference.jobId")
      }
      if (reference.sessionId !== sessionId) {
        throw new Error(
          `application persisted conversation reference key does not match sessionId: ${sessionId}`
        )
      }
      const submission = persistedConversationSubmissionFromJson(
        candidate.submission,
        `${field}.${sessionId}.submission`
      )
      return [
        sessionId,
        {
          ...reference,
          ...(submission === undefined ? {} : { submission })
        }
      ]
    })
  )
}

function persistedConversationReferenceToJson(
  reference: TrustedConversationOperationReference
): JsonValue {
  return {
    sessionId: reference.sessionId,
    inputId: reference.inputId,
    turnId: reference.turnId,
    jobId: reference.jobId,
    ...(reference.submission === undefined
      ? {}
      : { submission: { ...reference.submission } })
  }
}

function persistedConversationSubmissionFromJson(
  value: JsonValue | undefined,
  field: string
): TrustedConversationOperationReference["submission"] {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`application persisted ${field} must be an object`)
  }
  assertOnlyKeys(value, ["idempotencyKeyDigest", "requestFingerprint"], field)
  return {
    idempotencyKeyDigest: persistedSha256Digest(
      value.idempotencyKeyDigest,
      `${field}.idempotencyKeyDigest`
    ),
    requestFingerprint: persistedSha256Digest(
      value.requestFingerprint,
      `${field}.requestFingerprint`
    )
  }
}

function persistedSha256Digest(value: JsonValue | undefined, field: string): string {
  const parsed = requiredNonEmptyString(value, field)
  if (!/^[a-f0-9]{64}$/.test(parsed)) {
    throw new Error(`application persisted ${field} must be a SHA-256 digest`)
  }
  return parsed
}

function persistedSelectionFromJson(
  value: JsonValue | undefined
): ConversationSelection | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error("application persisted state.ui.selection must be an object")
  }
  const kind = requiredNonEmptyString(value.kind, "ui.selection.kind")
  if (kind === "session") {
    assertOnlyKeys(value, ["kind", "sessionId"], "ui.selection")
    return {
      kind,
      sessionId: requiredNonEmptyString(
        value.sessionId,
        "ui.selection.sessionId"
      )
    }
  }
  if (kind === "team") {
    assertOnlyKeys(value, ["kind", "conversationId"], "ui.selection")
    return {
      kind,
      conversationId: requiredNonEmptyString(
        value.conversationId,
        "ui.selection.conversationId"
      )
    }
  }
  throw new Error("application persisted state.ui.selection.kind is invalid")
}

function assertOnlyKeys(
  value: Readonly<Record<string, JsonValue>>,
  allowed: readonly string[],
  field: string
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(
      `application persisted ${field} contains unsupported fields: ${unknown.join(", ")}`
    )
  }
}

function optionalNonEmptyString(
  value: JsonValue | undefined,
  field: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`application persisted ${field} must be a non-empty string`)
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
    throw new Error(`application persisted ${field} is not supported`)
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
    throw new Error(`application persisted ${field} is required`)
  }
  return parsed
}

function requiredNonEmptyString(
  value: JsonValue | undefined,
  field: string
): string {
  const parsed = optionalNonEmptyString(value, field)
  if (parsed === undefined) {
    throw new Error(`application persisted ${field} is required`)
  }
  return parsed
}

function requiredPositiveSafeInteger(
  value: JsonValue | undefined,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(
      `application persisted ${field} must be a positive safe integer`
    )
  }
  return value as number
}

function requiredNonNegativeSafeInteger(
  value: JsonValue | undefined,
  field: string
): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(
      `application persisted ${field} must be a non-negative safe integer`
    )
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
