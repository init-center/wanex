import type { Snapshot } from "../model.js";

export function conversationModelEndpoints(
  snapshot: Snapshot,
  readyOnly: boolean,
): Snapshot["view"]["settings"]["profile"]["endpoints"] {
  return snapshot.view.settings.profile.endpoints.filter(
    (endpoint) =>
      endpoint.model.operations.includes("conversation") &&
      endpoint.model.inputModalities.includes("text") &&
      endpoint.model.outputModalities.includes("text") &&
      (!readyOnly ||
        endpoint.protocol.id === "fake" ||
        endpoint.credentialConfigured),
  );
}

type Endpoint = Snapshot["view"]["settings"]["profile"]["endpoints"][number];

/**
 * Labels for a set of endpoints: just the model name, plus the connection only
 * where two endpoints would otherwise read the same.
 */
export function conversationModelLabels(endpoints: readonly Endpoint[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const endpoint of endpoints) counts.set(endpoint.model.id, (counts.get(endpoint.model.id) ?? 0) + 1);
  return new Map(endpoints.map((endpoint) => [
    endpoint.id,
    (counts.get(endpoint.model.id) ?? 0) > 1
      ? `${endpoint.model.id} \u00b7 ${endpoint.connection.providerId}`
      : endpoint.model.id,
  ]));
}
