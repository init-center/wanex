import type { JsonValue } from "@wanex/protocol"

export type ConnectorSdkDistribution =
  | "peer"
  | "optional"
  | "external-artifact"
  | "bundled"

export interface ConnectorSdkLoaderSpec {
  readonly packageName: string
  readonly distribution: ConnectorSdkDistribution
  readonly loading: "lazy"
  readonly adapterId: string
  readonly displayName?: string
  readonly metadata?: JsonValue
}

export interface ConnectorSdkLoaderSpecLike {
  readonly packageName?: string
  readonly distribution?: ConnectorSdkDistribution | string
  readonly loading?: string
  readonly adapterId?: string
  readonly displayName?: string
  readonly metadata?: JsonValue
}

export interface ConnectorSdkLoadOptions<TSdk> {
  readonly spec: ConnectorSdkLoaderSpec
  readonly importer: () => Promise<TSdk> | TSdk
}

export type ConnectorSdkLoadResult<TSdk> =
  | {
      readonly status: "loaded"
      readonly spec: ConnectorSdkLoaderSpec
      readonly sdk: TSdk
    }
  | {
      readonly status: "missing"
      readonly spec: ConnectorSdkLoaderSpec
      readonly error: ConnectorSdkLoadErrorSummary
    }
  | {
      readonly status: "failed"
      readonly spec: ConnectorSdkLoaderSpec
      readonly error: ConnectorSdkLoadErrorSummary
    }

export interface ConnectorSdkLoadErrorSummary {
  readonly code: "connector_sdk.missing" | "connector_sdk.load_failed"
  readonly message: string
  readonly packageName: string
  readonly name: string
}

export class ConnectorSdkUnavailableError extends Error {
  readonly code: ConnectorSdkLoadErrorSummary["code"]
  readonly packageName: string

  constructor(summary: ConnectorSdkLoadErrorSummary) {
    super(summary.message)
    this.name = "ConnectorSdkUnavailableError"
    this.code = summary.code
    this.packageName = summary.packageName
  }
}

export async function loadOptionalConnectorSdk<TSdk>(
  options: ConnectorSdkLoadOptions<TSdk>
): Promise<ConnectorSdkLoadResult<TSdk>> {
  validateConnectorSdkSpec(options.spec)
  try {
    return {
      status: "loaded",
      spec: options.spec,
      sdk: await options.importer()
    }
  } catch (error) {
    const summary = summarizeSdkLoadError(options.spec, error)
    return {
      status: summary.code === "connector_sdk.missing" ? "missing" : "failed",
      spec: options.spec,
      error: summary
    }
  }
}

export async function requireConnectorSdk<TSdk>(
  options: ConnectorSdkLoadOptions<TSdk>
): Promise<TSdk> {
  const result = await loadOptionalConnectorSdk(options)
  if (result.status === "loaded") {
    return result.sdk
  }
  throw new ConnectorSdkUnavailableError(result.error)
}

export function validateConnectorSdkSpec(spec: ConnectorSdkLoaderSpec): void {
  validateConnectorSdkSpecLike(spec)
}

export function validateConnectorSdkSpecLike(
  spec: ConnectorSdkLoaderSpecLike
): void {
  if (spec.packageName === undefined || spec.packageName.length === 0) {
    throw new Error("connector sdk packageName must not be empty")
  }
  if (spec.adapterId === undefined || spec.adapterId.length === 0) {
    throw new Error("connector sdk adapterId must not be empty")
  }
  if (spec.loading !== "lazy") {
    throw new Error("connector sdk loading must be lazy")
  }
}

function summarizeSdkLoadError(
  spec: ConnectorSdkLoaderSpec,
  error: unknown
): ConnectorSdkLoadErrorSummary {
  const normalized = error instanceof Error ? error : new Error(String(error))
  const missing = isMissingModuleError(normalized, spec.packageName)
  return {
    code: missing ? "connector_sdk.missing" : "connector_sdk.load_failed",
    packageName: spec.packageName,
    name: normalized.name,
    message: missing
      ? `Connector SDK is not installed: ${spec.packageName}`
      : `Connector SDK failed to load: ${spec.packageName}`
  }
}

function isMissingModuleError(error: Error, packageName: string): boolean {
  const withCode = error as Error & { readonly code?: unknown }
  if (withCode.code === "ERR_MODULE_NOT_FOUND" || withCode.code === "MODULE_NOT_FOUND") {
    return true
  }
  return error.message.includes(packageName) && error.message.includes("Cannot find")
}
