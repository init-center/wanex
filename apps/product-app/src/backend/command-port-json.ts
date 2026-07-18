import type {
  ProductAppBackendCommandPort,
  ProductAppBackendCommandPortEnvelope
} from "./command-port.js"

export type ProductAppBackendCommandPortJsonStatus =
  | "success"
  | "validation_error"
  | "unknown_command"
  | "command_error"

export interface ProductAppBackendCommandPortJsonResult {
  readonly status: ProductAppBackendCommandPortJsonStatus
  readonly body: string
  readonly envelope: ProductAppBackendCommandPortEnvelope
}

export interface ProductAppBackendCommandPortJsonMapper {
  dispatchJson(body: unknown): Promise<ProductAppBackendCommandPortJsonResult>
}

export function createProductAppBackendCommandPortJsonMapper(
  port: ProductAppBackendCommandPort
): ProductAppBackendCommandPortJsonMapper {
  return {
    async dispatchJson(body) {
      return await dispatchProductAppBackendCommandPortJson(port, body)
    }
  }
}

export async function dispatchProductAppBackendCommandPortJson(
  port: ProductAppBackendCommandPort,
  body: unknown
): Promise<ProductAppBackendCommandPortJsonResult> {
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
  envelope: ProductAppBackendCommandPortEnvelope
): ProductAppBackendCommandPortJsonResult {
  return {
    status: classifyJsonStatus(envelope),
    body: JSON.stringify(envelope),
    envelope
  }
}

function classifyJsonStatus(
  envelope: ProductAppBackendCommandPortEnvelope
): ProductAppBackendCommandPortJsonStatus {
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

function errorEnvelope(message: string): ProductAppBackendCommandPortEnvelope {
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
