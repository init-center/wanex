import type {
  JsonValue,
  PluginInstallRecord,
  PluginManifestRecord
} from "@wanex/protocol"
import type { PluginRuntime } from "../runtime.js"
import type {
  PluginPackageLayout,
  PluginPackageRuntimeDependency,
  PluginPackageRuntimeDependencyDistribution
} from "../types-package.js"

export interface LocalPluginPackageLimits {
  readonly maxManifestBytes: number
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
  readonly maxPathBytes: number
  readonly maxPathDepth: number
}

export interface LocalPluginPackageFileEvidence {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly executable: boolean
}

export interface LocalPluginPackageDependencyEvidence {
  readonly name: string
  readonly distribution: PluginPackageRuntimeDependencyDistribution
  readonly loading: PluginPackageRuntimeDependency["loading"]
  readonly observedBytes: number
  readonly maxPackedBytes?: number
  readonly present: boolean
}

export interface LocalPluginPackageInspection {
  readonly kind: "wanex.plugin.local-package.inspection"
  readonly sourceDir: string
  readonly manifestFile: "wanex.plugin.json"
  readonly manifestBytes: number
  readonly manifestSha256: string
  readonly artifactSha256: string
  readonly totalBytes: number
  readonly fileCount: number
  readonly layout: PluginPackageLayout
  readonly files: readonly LocalPluginPackageFileEvidence[]
  readonly dependencies: readonly LocalPluginPackageDependencyEvidence[]
  readonly review: {
    readonly sourceKind: "local"
    readonly signatureStatus: "unsigned"
    readonly decision: "review-required"
  }
}

export interface InspectLocalPluginPackageRequest {
  readonly sourceDir: string
  readonly limits?: Partial<LocalPluginPackageLimits>
}

export interface MaterializeLocalPluginPackageRequest
  extends InspectLocalPluginPackageRequest {
  readonly installBaseDir: string
  readonly expectedArtifactSha256: string
}

export interface MaterializedLocalPluginPackage {
  readonly installRootDir: string
  readonly reused: boolean
  readonly source: LocalPluginPackageInspection
  readonly installed: LocalPluginPackageInspection
}

export interface LocalPluginPackageApproval {
  readonly status: "allow"
  readonly actorId: string
  readonly reason?: string
}

export interface InstallLocalPluginPackageRequest
  extends MaterializeLocalPluginPackageRequest {
  readonly runtime: PluginRuntime
  readonly approval: LocalPluginPackageApproval
  readonly metadata?: JsonValue
  readonly now?: () => number
}

export interface InstallLocalPluginPackageResult {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
  readonly materialized: MaterializedLocalPluginPackage
}
