import type { IncomingMessage, ServerResponse } from "node:http"
import type { Controller } from "@wanex/web"
import { readJsonBody } from "../request-body.js"
import { sendJson } from "../response.js"
import type { WebNodeRequestHandlerOptions } from "../types.js"
import { isRecord, WebHostHttpError } from "../http-error.js"

export async function handleCapabilitySetup(request: {
  readonly controller: Controller
  readonly capabilitySetup?: WebNodeRequestHandlerOptions["capabilitySetup"]
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  if (request.capabilitySetup === undefined) {
    throw new WebHostHttpError(
      404,
      "not_found",
      "product capability setup is not available"
    )
  }
  const input = parseCapabilitySetupInput(
    await readJsonBody(request.request, request.maxBodyBytes)
  )
  const setup =
    await request.capabilitySetup.setupImageGenerationAndContinue(input)
  const snapshot = await request.controller.refresh()
  if (setup.kind === "local-host.capability-setup.rejected") {
    sendJson(request.response, 409, {
      ok: false,
      kind: "web.capability-setup-response",
      error: { code: setup.reason, message: setup.message },
      snapshot
    })
    return
  }
  sendJson(request.response, 200, {
    ok: true,
    kind: "web.capability-setup-response",
    setup,
    snapshot
  })
}

function parseCapabilitySetupInput(input: unknown): {
  readonly operationId: string
  readonly sessionId: string
  readonly operation: "image.generate"
  readonly imageGenerationModelId: string
} {
  if (!isRecord(input)) {
    throw invalidCapabilitySetup("capability setup request must be an object")
  }
  const allowed = new Set([
    "operationId",
    "sessionId",
    "operation",
    "imageGenerationModelId"
  ])
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw invalidCapabilitySetup(
      "capability setup request contains an unknown field"
    )
  }
  const operation = requiredBoundedString(
    input,
    "operation",
    64,
    "capability setup"
  )
  if (operation !== "image.generate") {
    throw invalidCapabilitySetup("capability setup operation is not supported")
  }
  return {
    operationId: requiredBoundedString(
      input,
      "operationId",
      512,
      "capability setup"
    ),
    sessionId: requiredBoundedString(
      input,
      "sessionId",
      512,
      "capability setup"
    ),
    operation,
    imageGenerationModelId: requiredBoundedString(
      input,
      "imageGenerationModelId",
      256,
      "capability setup"
    )
  }
}

function requiredBoundedString(
  value: Readonly<Record<string, unknown>>,
  field: string,
  maxBytes: number,
  scope: string
): string {
  const raw = value[field]
  if (typeof raw !== "string") {
    throw invalidCapabilitySetup(`${scope} ${field} must be a string`)
  }
  const normalized = raw.trim()
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > maxBytes
  ) {
    throw invalidCapabilitySetup(
      `${scope} ${field} must contain 1 to ${maxBytes} bytes`
    )
  }
  return normalized
}

function invalidCapabilitySetup(message: string): WebHostHttpError {
  return new WebHostHttpError(400, "invalid_capability_setup", message)
}
