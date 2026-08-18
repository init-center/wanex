import type {
  ProviderReadinessViewModel,
  ProviderRunGateViewModel
} from "../model.js"

export function projectProviderRunGate(
  readiness: ProviderReadinessViewModel
): ProviderRunGateViewModel {
  return {
    state: readiness.canRun ? "ready" : "blocked",
    status: readiness.status,
    reason: readiness.reason,
    ...(readiness.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: readiness.activeEndpointId }),
    canRun: readiness.canRun,
    canSubmitConversation: readiness.canRun,
    attentionRequired: readiness.attentionRequired,
    message: providerRunGateMessage(readiness)
  }
}

function providerRunGateMessage(
  readiness: ProviderReadinessViewModel
): string {
  if (readiness.canRun) {
    return "Provider ready"
  }
  if (readiness.status === "missing_required_credential") {
    return "Host setup required"
  }
  if (readiness.status === "missing_active_endpoint") {
    return "No active provider"
  }
  return "Provider blocked"
}
