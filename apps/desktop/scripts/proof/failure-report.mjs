import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { distributionRoot } from "../build.mjs"

export async function writeProductDesktopFailureReport({
  error,
  proofRoot,
  outputRoot = distributionRoot
}) {
  const runtimeFailures = await readRuntimeFailures(proofRoot)
  const report = {
    kind: "wanex.product-desktop.proof-receipt",
    ok: false,
    host: { platform: process.platform, arch: process.arch },
    failure: boundedProofError(error),
    runtimeFailures
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
  const visualAccessibility = boundedBooleanNumberRecord(
    value.visualAccessibility,
    0
  )
  const visualAccessibilityFailure = boundedVisualFailure(
    value.visualAccessibilityFailure
  )
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
    ...(visualAccessibility === undefined ? {} : { visualAccessibility }),
    ...(visualAccessibilityFailure === undefined
      ? {}
      : { visualAccessibilityFailure })
  }
}

function boundedVisualFailure(value) {
  if (!isRecord(value) ||
    !["condition_timeout", "unexpected_exception"].includes(value.code) ||
    !isRecord(value.evidence) ||
    !isRecord(value.evidence.viewport)) return undefined
  const composer = boundedVisualElement(value.evidence.composer)
  const sidebar = boundedVisualElement(value.evidence.sidebar)
  if (composer === undefined || sidebar === undefined) return undefined
  return {
    code: value.code,
    stage: boundedIdentifier(value.stage, "visual_script_exception"),
    evidence: {
      viewport: {
        width: boundedNumber(value.evidence.viewport.width),
        height: boundedNumber(value.evidence.viewport.height),
        documentScrollWidth: boundedNumber(
          value.evidence.viewport.documentScrollWidth
        ),
        bodyScrollWidth: boundedNumber(value.evidence.viewport.bodyScrollWidth)
      },
      productSurfacePresent: value.evidence.productSurfacePresent === true,
      composer,
      sidebar,
      drawerState: boundedEnum(
        value.evidence.drawerState,
        ["missing", "open", "closed", "invalid"],
        "invalid"
      ),
      settingsPresent: value.evidence.settingsPresent === true,
      activeElement: boundedEnum(
        value.evidence.activeElement,
        [
          "none",
          "other",
          "settings",
          "sidebar",
          "open_settings",
          "open_conversations"
        ],
        "other"
      )
    }
  }
}

function boundedVisualElement(value) {
  if (!isRecord(value)) return undefined
  let rect = null
  if (value.rect !== null) {
    if (!isRecord(value.rect)) return undefined
    rect = {
      left: boundedNumber(value.rect.left),
      top: boundedNumber(value.rect.top),
      right: boundedNumber(value.rect.right),
      bottom: boundedNumber(value.rect.bottom),
      width: boundedNumber(value.rect.width),
      height: boundedNumber(value.rect.height)
    }
  }
  return {
    present: value.present === true,
    rect,
    visibility: boundedEnum(
      value.visibility,
      ["missing", "visible", "hidden", "other"],
      "other"
    ),
    pointerInteractive: value.pointerInteractive === true
  }
}

function boundedBooleanNumberRecord(value, depth) {
  if (!isRecord(value) || depth > 3) return undefined
  const result = {}
  for (const [key, item] of Object.entries(value).slice(0, 64)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key)) continue
    if (typeof item === "boolean") result[key] = item
    else if (typeof item === "number" && Number.isFinite(item)) {
      result[key] = boundedNumber(item)
    } else {
      const nested = boundedBooleanNumberRecord(item, depth + 1)
      if (nested !== undefined) result[key] = nested
    }
  }
  return result
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

function boundedNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : 0
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
