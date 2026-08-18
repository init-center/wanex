import type {
  BackendModelEndpointListReadModel,
  BackendModelEndpointReadModel
} from "@wanex/product/backend"
import type {
  SafeError,
  ModelEndpointReadModel,
  ProviderReadinessReadModel
} from "../model.js"

export function projectProviderReadiness(
  endpointList: BackendModelEndpointListReadModel
): ProviderReadinessReadModel {
  const activeEndpoint = endpointList.endpoints.find(
    (endpoint) => endpoint.id === endpointList.activeEndpointId
  )
  if (activeEndpoint === undefined) {
    return {
      status: "missing_active_endpoint",
      reason: "active_endpoint_missing",
      ...(endpointList.activeEndpointId === undefined
        ? {}
        : { activeEndpointId: endpointList.activeEndpointId }),
      endpointCount: endpointList.endpoints.length,
      canRun: false,
      attentionRequired: true,
      requiresCredential: false,
      credentialConfigured: false
    }
  }

  const requiresCredential = providerRequiresCredential(activeEndpoint)
  if (requiresCredential && !activeEndpoint.credentialConfigured) {
    return {
      status: "missing_required_credential",
      reason: "active_endpoint_missing_credential",
      ...(endpointList.activeEndpointId === undefined
        ? {}
        : { activeEndpointId: endpointList.activeEndpointId }),
      endpointCount: endpointList.endpoints.length,
      canRun: false,
      attentionRequired: true,
      requiresCredential,
      credentialConfigured: false,
      activeEndpoint: projectModelEndpoint(activeEndpoint)
    }
  }

  return {
    status: "ready",
    reason: "active_endpoint_ready",
    ...(endpointList.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: endpointList.activeEndpointId }),
    endpointCount: endpointList.endpoints.length,
    canRun: true,
    attentionRequired: false,
    requiresCredential,
    credentialConfigured: activeEndpoint.credentialConfigured,
    activeEndpoint: projectModelEndpoint(activeEndpoint)
  }
}

export function providerNotReadyError(
  readiness: ProviderReadinessReadModel
): SafeError {
  return {
    code: "provider_not_ready",
    category: "validation",
    message: providerNotReadyMessage(readiness)
  }
}

function providerNotReadyMessage(
  readiness: ProviderReadinessReadModel
): string {
  switch (readiness.status) {
    case "ready":
      return "provider is ready"
    case "missing_active_endpoint":
      return readiness.activeEndpointId === undefined
        ? "provider is not ready: no active model endpoint is configured"
        : `provider is not ready: active model endpoint ${readiness.activeEndpointId} is missing`
    case "missing_required_credential":
      return readiness.activeEndpointId === undefined
        ? "provider is not ready: active model endpoint is missing a required credential"
        : `provider is not ready: active model endpoint ${readiness.activeEndpointId} is missing a required credential`
  }
}

function providerRequiresCredential(
  endpoint: BackendModelEndpointReadModel
): boolean {
  return endpoint.protocol.id !== "fake"
}

export function projectModelEndpoint(
  endpoint: BackendModelEndpointReadModel
): ModelEndpointReadModel {
  return {
    id: endpoint.id,
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    credentialConfigured: endpoint.credentialConfigured,
    active: endpoint.active
  }
}

export function projectModelEndpoints(
  endpointList: BackendModelEndpointListReadModel
) {
  return {
    ...(endpointList.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: endpointList.activeEndpointId }),
    endpoints: endpointList.endpoints.map(projectModelEndpoint)
  }
}
