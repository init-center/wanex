import { connectorPackagingIssue } from "./packaging-issues.js"
import { validateNativeArtifact } from "./packaging-native-artifact.js"
import {
  collectDeclaredRuntimeDependencies,
  validateDeclaredRuntimeDependencyNames
} from "./packaging-runtime-dependencies.js"
import { validateSdkDependency } from "./packaging-sdk.js"
import type {
  ConnectorAdapterPackagingValidationIssue,
  ConnectorAdapterPackagingValidationOptions,
  ConnectorAdapterPackagingValidationReport
} from "./packaging-types.js"

export function validateConnectorAdapterPackaging(
  options: ConnectorAdapterPackagingValidationOptions
): ConnectorAdapterPackagingValidationReport {
  const errors: ConnectorAdapterPackagingValidationIssue[] = []
  const warnings: ConnectorAdapterPackagingValidationIssue[] = []
  const dependencies = options.packageJson.dependencies ?? {}
  const declaredRuntimeDependencies = collectDeclaredRuntimeDependencies(
    options.packageJson
  )

  if (options.packageJson.name === undefined || options.packageJson.name === "") {
    errors.push(connectorPackagingIssue(
      "connector_packaging.package_name_missing",
      "Connector adapter package name must be present."
    ))
  } else if (options.packageJson.name !== options.packaging.packageName) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.package_name_mismatch",
      "Connector adapter packaging packageName must match package.json name."
    ))
  }

  if (
    options.packageJson.version === undefined ||
    options.packageJson.version === ""
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.package_version_missing",
      "Connector adapter package version must be present."
    ))
  }

  if (options.packageJson.type !== "module") {
    warnings.push(connectorPackagingIssue(
      "connector_packaging.module_type_missing",
      "Connector adapter packages should be ESM packages."
    ))
  }

  if (options.packageJson.exports === undefined) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.exports_missing",
      "Connector adapter package must expose an exports map."
    ))
  }

  if (
    options.manifest !== undefined &&
    options.manifest.pluginId !== options.packaging.pluginId
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.plugin_id_mismatch",
      "Connector adapter packaging pluginId must match the connector manifest."
    ))
  }

  if (
    options.packaging.adapterExport === undefined ||
    options.packaging.adapterExport.length === 0
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.adapter_export_missing",
      "Connector adapter packaging must name the exported adapter factory."
    ))
  }

  if (options.packaging.requiresGateway !== false) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.gateway_required",
      "Connector adapter packages must not require a gateway process."
    ))
  }

  if (options.packaging.bundleMode === "host-app-node-modules") {
    errors.push(connectorPackagingIssue(
      "connector_packaging.host_node_modules_bundle",
      "Connector adapter packages must not require bundling host app node_modules."
    ))
  }

  for (const name of options.packaging.runtimeDependencies ?? []) {
    if (!declaredRuntimeDependencies.has(name)) {
      errors.push(connectorPackagingIssue(
        "connector_packaging.runtime_dependency_missing",
        `Runtime dependency is listed in packaging but missing from package dependencies: ${name}`,
        name
      ))
    }
  }

  validateDeclaredRuntimeDependencyNames(dependencies, errors)

  for (const dependency of options.packaging.sdkDependencies ?? []) {
    validateSdkDependency(dependency, errors)
  }

  for (const artifact of options.packaging.nativeArtifacts ?? []) {
    validateNativeArtifact(artifact, errors)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  }
}

export function assertConnectorAdapterPackaging(
  options: ConnectorAdapterPackagingValidationOptions
): ConnectorAdapterPackagingValidationReport {
  const report = validateConnectorAdapterPackaging(options)
  if (!report.ok) {
    throw new Error(
      `connector adapter packaging is invalid: ${report.errors
        .map((item) => item.code)
        .join(", ")}`
    )
  }
  return report
}
