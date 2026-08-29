import type {
  CancelLocalPluginReviewResult,
  PluginManagementMutationResult,
  PluginManagementReadResult,
  AssistantPluginManagementInvalidatedEvent,
  RequestLocalPluginReviewResult
} from "../../plugin-management/model.js"
import { isNonNegativeSafeInteger, isPositiveSafeInteger, isRecord } from "./common.js"

const PLUGIN_CAPABILITIES = new Set([
  "resource.read",
  "resource.write",
  "workspace.change.propose",
  "delegation.graph.read",
  "delegation.graph.write",
  "team.conversation.read",
  "team.conversation.write",
  "channel.connect",
  "channel.receive",
  "channel.deliver",
  "config.read",
  "config.write",
  "network.fetch"
])

const REJECTION_REASONS = new Set([
  "not_configured",
  "selection_failed",
  "inspection_failed",
  "review_failed",
  "review_capacity_reached",
  "review_not_found",
  "review_expired",
  "review_stale",
  "install_failed",
  "install_not_found",
  "state_conflict",
  "state_transition_invalid",
  "invalid_request",
  "storage_failed",
  "disposed"
])

export function isPluginManagementReadResult(
  value: unknown
): value is PluginManagementReadResult {
  if (!isRecord(value)) return false
  if (value.kind === "assistant.plugin-management.unavailable") {
    return exactRecord(value, ["kind", "reason", "message"]) &&
      value.reason === "not_configured" && safeText(value.message, 2_000)
  }
  return isPluginManagementSnapshot(value)
}

export function isRequestLocalPluginReviewResult(
  value: unknown
): value is RequestLocalPluginReviewResult {
  if (!isRecord(value)) return false
  if (value.kind === "plugin.management.review-ready") {
    return exactRecord(value, ["kind", "review"]) && isLocalPluginReview(value.review)
  }
  return isReviewCancelled(value) || isRejected(value)
}

export function isCancelLocalPluginReviewResult(
  value: unknown
): value is CancelLocalPluginReviewResult {
  return isReviewCancelled(value) || isRejected(value)
}

export function isPluginManagementMutationResult(
  value: unknown
): value is PluginManagementMutationResult {
  if (!isRecord(value)) return false
  if (value.kind === "plugin.management.applied") {
    return exactRecord(value, ["kind", "operation", "snapshot", "catalogRevision"]) &&
      isOperation(value.operation) &&
      isPluginManagementSnapshot(value.snapshot) &&
      safeRevision(value.catalogRevision)
  }
  if (value.kind === "plugin.management.attention-required") {
    return exactRecord(value, [
      "kind",
      "operation",
      "snapshot",
      "catalogRevision",
      "diagnostic"
    ]) &&
      isOperation(value.operation) &&
      isPluginManagementSnapshot(value.snapshot) &&
      safeRevision(value.catalogRevision) &&
      exactRecord(value.diagnostic, ["code", "message"]) &&
      safeIdentifier(value.diagnostic.code) &&
      safeText(value.diagnostic.message, 2_000)
  }
  return isRejected(value)
}

export function isAssistantPluginManagementInvalidatedEvent(
  value: unknown
): value is AssistantPluginManagementInvalidatedEvent {
  return exactRecord(value, ["kind", "sequence", "at", "revision"]) &&
    value.kind === "assistant.plugin-management.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    isNonNegativeSafeInteger(value.at) &&
    safeRevision(value.revision)
}

function isPluginManagementSnapshot(value: unknown): boolean {
  return exactRecord(value, ["kind", "revision", "installs"]) &&
    value.kind === "plugin.management.snapshot" &&
    safeRevision(value.revision) &&
    boundedArray(value.installs, 10_000, isInstalledVersion)
}

function isInstalledVersion(value: unknown): boolean {
  if (!exactAllowedRecord(value, [
    "pluginId",
    "displayName",
    "version",
    "state",
    "runtimeState",
    "capabilities",
    "sourceKind",
    "signatureStatus",
    "artifactSha256",
    "totalBytes",
    "fileCount",
    "commandCount",
    "updatedAt",
    "diagnostic"
  ])) return false
  return safeIdentifier(value.pluginId) &&
    safeText(value.displayName, 500) &&
    safeIdentifier(value.version) &&
    isInstallState(value.state) &&
    ["loaded", "inactive", "attention_required"].includes(String(value.runtimeState)) &&
    boundedArray(value.capabilities, PLUGIN_CAPABILITIES.size, isPluginCapability) &&
    ["local", "registry", "archive", "git", "builtin", "unknown"].includes(String(value.sourceKind)) &&
    ["unsigned", "verified", "invalid", "unknown"].includes(String(value.signatureStatus)) &&
    optionalSha256(value.artifactSha256) &&
    optionalNonNegativeInteger(value.totalBytes) &&
    optionalNonNegativeInteger(value.fileCount) &&
    isNonNegativeSafeInteger(value.commandCount) &&
    isNonNegativeSafeInteger(value.updatedAt) &&
    (value.diagnostic === undefined || isInstallDiagnostic(value.diagnostic))
}

function isInstallDiagnostic(value: unknown): boolean {
  return exactRecord(value, ["code", "message"]) &&
    ["record_invalid", "catalog_refresh_failed", "runtime_not_loaded"].includes(String(value.code)) &&
    safeText(value.message, 2_000)
}

function isLocalPluginReview(value: unknown): boolean {
  return exactRecord(value, [
    "kind",
    "reviewId",
    "expiresAt",
    "pluginId",
    "displayName",
    "version",
    "sourceKind",
    "signatureStatus",
    "artifactSha256",
    "totalBytes",
    "fileCount",
    "capabilities",
    "commands",
    "dependencies"
  ]) &&
    value.kind === "plugin.management.local-review" &&
    safeIdentifier(value.reviewId) &&
    isPositiveSafeInteger(value.expiresAt) &&
    safeIdentifier(value.pluginId) &&
    safeText(value.displayName, 500) &&
    safeIdentifier(value.version) &&
    value.sourceKind === "local" &&
    value.signatureStatus === "unsigned" &&
    isSha256(value.artifactSha256) &&
    isNonNegativeSafeInteger(value.totalBytes) &&
    isNonNegativeSafeInteger(value.fileCount) &&
    boundedArray(value.capabilities, PLUGIN_CAPABILITIES.size, isPluginCapability) &&
    boundedArray(value.commands, 1_000, isReviewCommand) &&
    boundedArray(value.dependencies, 1_000, isReviewDependency)
}

function isReviewCommand(value: unknown): boolean {
  return exactRecord(value, ["id", "title"]) &&
    safeIdentifier(value.id) && safeText(value.title, 500)
}

function isReviewDependency(value: unknown): boolean {
  return exactAllowedRecord(value, [
    "name",
    "distribution",
    "loading",
    "observedBytes",
    "maxPackedBytes"
  ]) &&
    safeIdentifier(value.name) &&
    ["bundled", "peer", "optional", "external-artifact"].includes(String(value.distribution)) &&
    (value.loading === "lazy" || value.loading === "startup") &&
    isNonNegativeSafeInteger(value.observedBytes) &&
    optionalNonNegativeInteger(value.maxPackedBytes)
}

function isReviewCancelled(value: unknown): boolean {
  return exactRecord(value, ["kind"]) &&
    value.kind === "plugin.management.review-cancelled"
}

function isRejected(value: unknown): boolean {
  return exactRecord(value, ["kind", "reason", "message"]) &&
    value.kind === "plugin.management.rejected" &&
    REJECTION_REASONS.has(String(value.reason)) &&
    safeText(value.message, 2_000)
}

function isOperation(value: unknown): boolean {
  return value === "install" || value === "set_state" || value === "retry_refresh"
}

function isInstallState(value: unknown): boolean {
  return value === "installed" || value === "disabled" || value === "removed"
}

function isPluginCapability(value: unknown): boolean {
  return typeof value === "string" && PLUGIN_CAPABILITIES.has(value)
}

function optionalSha256(value: unknown): boolean {
  return value === undefined || isSha256(value)
}

function isSha256(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeSafeInteger(value)
}

function safeRevision(value: unknown): boolean {
  return safeString(value, 256)
}

function safeIdentifier(value: unknown): boolean {
  return safeString(value, 500)
}

function safeText(value: unknown, maxLength: number): boolean {
  return typeof value === "string" &&
    Array.from(value).length <= maxLength &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
}

function safeString(value: unknown, maxLength: number): boolean {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    safeText(value, maxLength)
}

function boundedArray(
  value: unknown,
  maxLength: number,
  predicate: (item: unknown) => boolean
): boolean {
  return Array.isArray(value) &&
    value.length <= maxLength &&
    value.every(predicate)
}

function exactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
}

function exactAllowedRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key))
}
