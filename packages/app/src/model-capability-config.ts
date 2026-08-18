import type { JsonValue } from "@wanex/protocol";
import type { CoreStore } from "@wanex/storage";
import type { WanexAppRoutableModelOperation } from "./types-model-capability.js";

export const APP_MODEL_CAPABILITY_ROUTES_KEY =
  "wanex-app.modelCapability.routes";

export type WanexAppModelCapabilityRouteMap = Partial<
  Record<WanexAppRoutableModelOperation, string>
>;

export async function readWanexAppModelCapabilityRouteMap(
  storage: CoreStore,
): Promise<WanexAppModelCapabilityRouteMap> {
  const value = await storage.getConfig(APP_MODEL_CAPABILITY_ROUTES_KEY);
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("model capability route map must be an object");
  }
  const routes: WanexAppModelCapabilityRouteMap = {};
  for (const [operation, endpointId] of Object.entries(value)) {
    routes[normalizeWanexAppRoutableOperation(operation)] = requireNonEmpty(
      endpointId,
      `model capability route ${operation}`,
    );
  }
  return routes;
}

export async function writeWanexAppModelCapabilityRouteMap(
  storage: CoreStore,
  routes: WanexAppModelCapabilityRouteMap,
): Promise<void> {
  await storage.putConfig(
    APP_MODEL_CAPABILITY_ROUTES_KEY,
    wanexAppModelCapabilityRouteMapToJson(routes),
  );
}

export function wanexAppModelCapabilityRouteMapToJson(
  routes: WanexAppModelCapabilityRouteMap,
): JsonValue {
  return Object.fromEntries(
    Object.entries(routes).sort(([left], [right]) => left.localeCompare(right)),
  ) as JsonValue;
}

export function normalizeWanexAppRoutableOperation(
  operation: string,
): WanexAppRoutableModelOperation {
  if (
    operation !== "image.generate" &&
    operation !== "image.edit" &&
    operation !== "video.generate" &&
    operation !== "audio.transcribe" &&
    operation !== "audio.synthesize"
  ) {
    throw new Error(`model capability operation is not routable: ${operation}`);
  }
  return operation;
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return value.trim();
}
