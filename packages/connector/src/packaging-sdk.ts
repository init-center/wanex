import type {
  ConnectorAdapterPackagingValidationIssue,
  ConnectorAdapterSdkDependency
} from "./packaging-types.js"

import { connectorPackagingIssue } from "./packaging-issues.js"

export function validateSdkDependency(
  dependency: ConnectorAdapterSdkDependency,
  errors: ConnectorAdapterPackagingValidationIssue[]
): void {
  if (dependency.name.length === 0) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.sdk_dependency_invalid",
      "Connector adapter SDK dependency name must not be empty."
    ))
  }
  if (
    dependency.distribution === "bundled" &&
    dependency.loading !== "lazy"
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.sdk_dependency_invalid",
      `Bundled SDK dependency must be lazy-loaded: ${dependency.name}`,
      dependency.name
    ))
  }
  if (
    dependency.distribution === "bundled" &&
    (dependency.maxPackedBytes === undefined || dependency.maxPackedBytes <= 0)
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.sdk_dependency_invalid",
      `Bundled SDK dependency must declare a positive maxPackedBytes budget: ${dependency.name}`,
      dependency.name
    ))
  }
}
