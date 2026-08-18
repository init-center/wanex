import { createHash } from "node:crypto"
import { inspectLocalPluginPackageClosure } from "./closure.js"
import { resolveLocalPluginPackageLimits } from "./limits.js"
import { readLocalPluginManifest } from "./manifest.js"
import type {
  InspectLocalPluginPackageRequest,
  LocalPluginPackageInspection
} from "./types.js"

export async function inspectLocalPluginPackage(
  request: InspectLocalPluginPackageRequest
): Promise<LocalPluginPackageInspection> {
  if (request.sourceDir.trim().length === 0) {
    throw new Error("local plugin package sourceDir must not be empty")
  }
  const limits = resolveLocalPluginPackageLimits(request.limits)
  const manifest = await readLocalPluginManifest(request.sourceDir, limits)
  const closure = await inspectLocalPluginPackageClosure(
    manifest.sourceDir,
    manifest.layout,
    limits
  )
  const totalBytes = manifest.bytes.byteLength + closure.totalFileBytes
  if (totalBytes > limits.maxTotalBytes) {
    throw new Error(
      `local plugin package exceeds ${limits.maxTotalBytes} total bytes`
    )
  }
  const artifact = createHash("sha256")
  artifact.update("wanex.plugin.local-package\0")
  artifact.update(manifest.sha256)
  artifact.update("\0")
  for (const file of closure.files) {
    artifact.update(file.path)
    artifact.update("\0")
    artifact.update(String(file.bytes))
    artifact.update("\0")
    artifact.update(file.sha256)
    artifact.update("\0")
    artifact.update(file.executable ? "1" : "0")
  }
  return {
    kind: "wanex.plugin.local-package.inspection",
    sourceDir: manifest.sourceDir,
    manifestFile: "wanex.plugin.json",
    manifestBytes: manifest.bytes.byteLength,
    manifestSha256: manifest.sha256,
    artifactSha256: artifact.digest("hex"),
    totalBytes,
    fileCount: closure.files.length,
    layout: manifest.layout,
    files: closure.files,
    dependencies: closure.dependencies,
    review: {
      sourceKind: "local",
      signatureStatus: "unsigned",
      decision: "review-required"
    }
  }
}
