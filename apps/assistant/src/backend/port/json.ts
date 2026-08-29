import type {
  BackendCommandPort,
  BackendCommandPortEnvelope
} from "./runtime.js"

export type BackendCommandPortJsonStatus =
  | "success"
  | "validation_error"
  | "unknown_command"
  | "command_error"

export interface BackendCommandPortJsonResult {
  readonly status: BackendCommandPortJsonStatus
  readonly body: string
  readonly envelope: BackendCommandPortEnvelope
}

export interface BackendCommandPortJsonMapper {
  dispatchJson(body: unknown): Promise<BackendCommandPortJsonResult>
}

export function createBackendCommandPortJsonMapper(
  port: BackendCommandPort
): BackendCommandPortJsonMapper {
  return {
    async dispatchJson(body) {
      return await dispatchBackendCommandPortJson(port, body)
    }
  }
}

export async function dispatchBackendCommandPortJson(
  port: BackendCommandPort,
  body: unknown
): Promise<BackendCommandPortJsonResult> {
  if (typeof body !== "string") {
    return jsonResult(
      errorEnvelope("JSON request body must be a string")
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    return jsonResult(
      errorEnvelope("JSON request body must be valid JSON")
    )
  }

  return jsonResult(await port.dispatch(parsed))
}

function jsonResult(
  envelope: BackendCommandPortEnvelope
): BackendCommandPortJsonResult {
  return {
    status: classifyJsonStatus(envelope),
    body: JSON.stringify(envelope),
    envelope
  }
}

function classifyJsonStatus(
  envelope: BackendCommandPortEnvelope
): BackendCommandPortJsonStatus {
  if (envelope.ok) {
    return "success"
  }
  if (envelope.error.code === "unknown_command") {
    return "unknown_command"
  }
  if (envelope.error.code === "validation_error") {
    return "validation_error"
  }
  return "command_error"
}

function errorEnvelope(message: string): BackendCommandPortEnvelope {
  return {
    ok: false,
    command: "unknown",
    error: {
      code: "validation_error",
      category: "validation",
      message
    }
  }
}
