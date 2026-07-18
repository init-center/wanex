import type {
  ProductAppWebProviderReadinessViewModel,
  ProductAppWebProviderRunGateViewModel
} from "./types.js"

export function projectProductAppWebProviderRunGate(
  readiness: ProductAppWebProviderReadinessViewModel
): ProductAppWebProviderRunGateViewModel {
  return {
    state: readiness.canRun ? "ready" : "blocked",
    status: readiness.status,
    reason: readiness.reason,
    activeProfileId: readiness.activeProfileId,
    canRun: readiness.canRun,
    canSubmitWorkbench: readiness.canRun,
    attentionRequired: readiness.attentionRequired,
    message: providerRunGateMessage(readiness)
  }
}

function providerRunGateMessage(
  readiness: ProductAppWebProviderReadinessViewModel
): string {
  if (readiness.canRun) {
    return "Provider ready"
  }
  if (readiness.status === "missing_required_api_key") {
    return "Host setup required"
  }
  if (readiness.status === "missing_active_profile") {
    return "No active provider"
  }
  return "Provider blocked"
}
