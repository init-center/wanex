import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { distributionRoot } from "../build.mjs"

export async function writeProductDesktopFailureReport({
  error,
  proofRoot,
  providerRequests = [],
  outputRoot = distributionRoot
}) {
  const runtimeFailures = await readRuntimeFailures(proofRoot)
  const report = {
    kind: "wanex.product-desktop.proof-receipt",
    ok: false,
    host: { platform: process.platform, arch: process.arch },
    failure: boundedProofError(error),
    runtimeFailures,
    providerFixture: boundedProviderFixture(providerRequests)
  }
  await mkdir(outputRoot, { recursive: true })
  await writeFile(
    join(outputRoot, "product-desktop-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  )
  return report
}

async function readRuntimeFailures(proofRoot) {
  let entries
  try {
    entries = await readdir(proofRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
  const receiptNames = entries
    .filter((entry) =>
      entry.isFile() &&
      (entry.name.startsWith("runtime-receipt-") ||
        entry.name.endsWith("-receipt.json"))
    )
    .map((entry) => entry.name)
    .sort()
    .slice(0, 32)
  const failures = []
  for (const name of receiptNames) {
    let value
    try {
      value = JSON.parse(await readFile(join(proofRoot, name), "utf8"))
    } catch {
      continue
    }
    const failure = boundedRuntimeFailure(value)
    if (failure !== undefined) failures.push(failure)
  }
  return failures
}

function boundedRuntimeFailure(value) {
  if (!isRecord(value) ||
    value.kind !== "wanex.product-desktop.runtime-receipt" ||
    value.ok !== false) return undefined
  const renderer = boundedRendererFailure(value.renderer)
  return {
    kind: "wanex.product-desktop.runtime-receipt",
    ok: false,
    failurePhase: boundedIdentifier(value.failurePhase, "unknown_phase"),
    ...(typeof value.failureProofStep === "string"
      ? {
          failureProofStep: boundedIdentifier(
            value.failureProofStep,
            "unknown_step"
          )
        }
      : {}),
    ...(typeof value.failureDiagnostic === "string"
      ? {
          failureDiagnostic: boundedIdentifier(
            value.failureDiagnostic,
            "unknown_diagnostic"
          )
        }
      : {}),
    error: {
      name: isRecord(value.error)
        ? boundedIdentifier(value.error.name, "Error")
        : "Error",
      code: isRecord(value.error)
        ? boundedIdentifier(value.error.code, "product_desktop_failed")
        : "product_desktop_failed"
    },
    ...(renderer === undefined ? {} : { renderer })
  }
}

function boundedRendererFailure(value) {
  if (!isRecord(value) || value.ok !== false) return undefined
  const diagnostics = boundedRendererDiagnostics(value.failureDiagnostics)
  return {
    ok: false,
    failureStage: boundedEnum(
      value.failureStage,
      [
        "provider_configure",
        "settings_close",
        "renderer_ready",
        "model_switch",
        "conversation_settlement",
        "canonical_command",
        "provider_lifecycle"
      ],
      "unknown_stage"
    ),
    ...(diagnostics === undefined ? {} : { failureDiagnostics: diagnostics }),
    providerConfigured: value.providerConfigured === true,
    providerEditedWithoutCredential:
      value.providerEditedWithoutCredential === true,
    configuredProviderCount: boundedCount(value.configuredProviderCount),
    activeProviderRemoved: value.activeProviderRemoved === true,
    fallbackProviderReady: value.fallbackProviderReady === true,
    fallbackModelResponseVisible: value.fallbackModelResponseVisible === true
  }
}

function boundedRendererDiagnostics(value) {
  if (!isRecord(value)) return undefined
  return {
    surfaceCount: boundedCount(value.surfaceCount),
    userRowCount: boundedCount(value.userRowCount),
    assistantRowCount: boundedCount(value.assistantRowCount),
    composerCount: boundedCount(value.composerCount),
    composerDisabled: value.composerDisabled === true,
    modelSelectorCount: boundedCount(value.modelSelectorCount),
    modelSelectorDisabled: value.modelSelectorDisabled === true,
    providerState: boundedEnum(
      value.providerState,
      ["ready", "blocked", "missing"],
      "unknown"
    ),
    errorVisible: value.errorVisible === true,
    activeSessionCount: boundedCount(value.activeSessionCount),
    activeSessionIdPresent: value.activeSessionIdPresent === true,
    richHeadingVisible: value.richHeadingVisible === true,
    richCodeVisible: value.richCodeVisible === true,
    selectedResponseVisible: value.selectedResponseVisible === true
  }
}

function boundedProviderFixture(requests) {
  const values = Array.isArray(requests) ? requests : []
  const retained = values.slice(0, 64).map((request) => ({
    kind: providerRequestKind(request),
    authorized: isRecord(request) && request.authorized === true
  }))
  return {
    requestCount: values.length,
    retainedCount: retained.length,
    truncated: values.length > retained.length,
    requests: retained
  }
}

function providerRequestKind(value) {
  if (!isRecord(value) || typeof value.path !== "string") return "unknown"
  if (value.path.endsWith("/chat/completions")) return "chat_completion"
  if (value.path.endsWith("/images/generations")) return "image_generation"
  return "other"
}

function boundedProofError(error) {
  return {
    name: error instanceof Error
      ? boundedIdentifier(error.name, "Error")
      : "UnknownError",
    code: isRecord(error)
      ? boundedIdentifier(error.code, "product_desktop_proof_failed")
      : "product_desktop_proof_failed"
  }
}

function boundedIdentifier(value, fallback) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(value)
    ? value
    : fallback
}

function boundedEnum(value, allowed, fallback) {
  return typeof value === "string" && allowed.includes(value) ? value : fallback
}

function boundedCount(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1_000_000)
    : 0
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
