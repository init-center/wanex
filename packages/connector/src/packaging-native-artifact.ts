import type {
  ConnectorAdapterNativeArtifact,
  ConnectorAdapterPackagingValidationIssue
} from "./packaging-types.js"

import { connectorPackagingIssue } from "./packaging-issues.js"

export function validateNativeArtifact(
  artifact: ConnectorAdapterNativeArtifact,
  errors: ConnectorAdapterPackagingValidationIssue[]
): void {
  if (artifact.id.length === 0 || artifact.platform.length === 0) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.native_artifact_invalid",
      "Connector adapter native artifact id and platform must not be empty."
    ))
  }
  if (
    artifact.maxPackedBytes !== undefined &&
    artifact.maxPackedBytes <= 0
  ) {
    errors.push(connectorPackagingIssue(
      "connector_packaging.native_artifact_invalid",
      `Connector adapter native artifact budget must be positive: ${artifact.id}`
    ))
  }
}
