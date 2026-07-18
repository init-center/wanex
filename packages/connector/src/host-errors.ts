import type { ConnectorSessionRecord, JsonValue } from "@wanex/protocol"

export function isLiveConnectorSession(
  session: ConnectorSessionRecord
): boolean {
  return session.state === "connecting" || session.state === "connected"
}

export function normalizeHostError(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      type: "connector.host_failed",
      name: error.name,
      message: error.message
    }
  }
  return {
    type: "connector.host_failed",
    message: String(error)
  }
}
