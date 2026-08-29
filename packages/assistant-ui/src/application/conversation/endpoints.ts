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

export function conversationModelLabel(
  endpoint: Snapshot["view"]["settings"]["profile"]["endpoints"][number],
): string {
  return `${endpoint.model.id} - ${endpoint.connection.providerId}`;
}
