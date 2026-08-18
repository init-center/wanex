import { pathToFileURL } from "node:url"
import { expectJsonValue } from "../internal-validation.js"
import { WANEX_PLUGIN_INSTALL_PLAN_KIND } from "../types-constants.js"
import type { PluginInstallPlan } from "../types-package.js"
import { materializeLocalPluginPackage } from "./materialize.js"
import type {
  InstallLocalPluginPackageRequest,
  InstallLocalPluginPackageResult
} from "./types.js"

export async function installLocalPluginPackage(
  request: InstallLocalPluginPackageRequest
): Promise<InstallLocalPluginPackageResult> {
  const actorId = request.approval.actorId.trim()
  if (actorId.length === 0) {
    throw new Error("local plugin package approval actorId must not be empty")
  }
  const materialized = await materializeLocalPluginPackage(request)
  const approvedAt = (request.now ?? Date.now)()
  if (!Number.isSafeInteger(approvedAt) || approvedAt < 0) {
    throw new Error("local plugin package approval time must be a non-negative safe integer")
  }
  const localPackageMetadata = {
    kind: "wanex.plugin.local-package.approval",
    artifactSha256: materialized.installed.artifactSha256,
    manifestSha256: materialized.installed.manifestSha256,
    totalBytes: materialized.installed.totalBytes,
    fileCount: materialized.installed.fileCount,
    approvedBy: actorId,
    approvedAt,
    ...(request.approval.reason === undefined
      ? {}
      : { reason: request.approval.reason })
  }
  const metadata = expectJsonValue(
    request.metadata === undefined
      ? { localPackage: localPackageMetadata }
      : { supplied: request.metadata, localPackage: localPackageMetadata },
    "local plugin package install metadata"
  )
  const plan: PluginInstallPlan = {
    kind: WANEX_PLUGIN_INSTALL_PLAN_KIND,
    layout: materialized.installed.layout,
    source: {
      kind: "local",
      uri: pathToFileURL(materialized.source.sourceDir).href
    },
    integrity: { sha256: materialized.installed.artifactSha256 },
    install: { rootDir: materialized.installRootDir },
    decision: {
      status: "allow",
      ...(request.approval.reason === undefined
        ? {}
        : { reason: request.approval.reason })
    },
    metadata
  }
  const activated = await request.runtime.activateInstallPlan({ plan })
  return {
    manifest: activated.manifest,
    install: activated.install,
    materialized
  }
}
