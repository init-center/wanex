import type { JsonValue } from "@wanex/protocol"

export type ConnectorAdapterPackageBundleMode =
  | "adapter-package-only"
  | "adapter-with-declared-runtime-deps"
  | "host-app-node-modules"

export type ConnectorAdapterSdkDistribution =
  | "peer"
  | "optional"
  | "external-artifact"
  | "bundled"

export type ConnectorAdapterSdkLoading = "lazy" | "startup"

export interface ConnectorAdapterPackagingSpec {
  readonly kind: "wanex.connector-adapter.package"
  readonly pluginId: string
  readonly packageName: string
  readonly adapterExport: string
  readonly bundleMode: ConnectorAdapterPackageBundleMode
  readonly requiresGateway: false
  readonly runtimeDependencies?: readonly string[]
  readonly sdkDependencies?: readonly ConnectorAdapterSdkDependency[]
  readonly nativeArtifacts?: readonly ConnectorAdapterNativeArtifact[]
  readonly metadata?: JsonValue
}

export interface ConnectorAdapterSdkDependency {
  readonly name: string
  readonly distribution: ConnectorAdapterSdkDistribution
  readonly loading: ConnectorAdapterSdkLoading
  readonly platforms?: readonly string[]
  readonly maxPackedBytes?: number
}

export interface ConnectorAdapterNativeArtifact {
  readonly id: string
  readonly platform: string
  readonly distribution: "external-artifact" | "optional"
  readonly maxPackedBytes?: number
}

export interface ConnectorAdapterPackageJsonLike {
  readonly name?: string
  readonly version?: string
  readonly type?: string
  readonly exports?: unknown
  readonly dependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

export interface ConnectorAdapterPackagingValidationOptions {
  readonly packageJson: ConnectorAdapterPackageJsonLike
  readonly packaging: ConnectorAdapterPackagingSpecLike
  readonly manifest?: {
    readonly pluginId: string
    readonly version: string
  }
}

export interface ConnectorAdapterPackagingSpecLike {
  readonly kind?: string
  readonly pluginId?: string
  readonly packageName?: string
  readonly adapterExport?: string
  readonly bundleMode?: string
  readonly requiresGateway?: boolean
  readonly runtimeDependencies?: readonly string[]
  readonly sdkDependencies?: readonly ConnectorAdapterSdkDependency[]
  readonly nativeArtifacts?: readonly ConnectorAdapterNativeArtifact[]
  readonly metadata?: JsonValue
}

export interface ConnectorAdapterPackagingValidationIssue {
  readonly code: ConnectorAdapterPackagingValidationIssueCode
  readonly message: string
  readonly dependency?: string
}

export type ConnectorAdapterPackagingValidationIssueCode =
  | "connector_packaging.package_name_missing"
  | "connector_packaging.package_name_mismatch"
  | "connector_packaging.package_version_missing"
  | "connector_packaging.module_type_missing"
  | "connector_packaging.exports_missing"
  | "connector_packaging.plugin_id_mismatch"
  | "connector_packaging.adapter_export_missing"
  | "connector_packaging.gateway_required"
  | "connector_packaging.host_node_modules_bundle"
  | "connector_packaging.runtime_dependency_missing"
  | "connector_packaging.forbidden_runtime_dependency"
  | "connector_packaging.sdk_dependency_invalid"
  | "connector_packaging.native_artifact_invalid"

export interface ConnectorAdapterPackagingValidationReport {
  readonly ok: boolean
  readonly errors: readonly ConnectorAdapterPackagingValidationIssue[]
  readonly warnings: readonly ConnectorAdapterPackagingValidationIssue[]
}
