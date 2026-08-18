import {
  handleRequest
} from "@wanex/web"
import {
  projectDesktopMainSnapshot
} from "./snapshot.js"
import {
  projectLocalModelEndpoint,
  projectLocalModelEndpoints
} from "../provider/model-read-model.js"
import type {
  LocalWebApp
} from "../model.js"
import {
  DESKTOP_MAIN_REQUEST_KIND,
  DESKTOP_MAIN_RESPONSE_KIND,
  type DesktopMainErrorResponse,
  type DesktopMainRequest,
  type DesktopMainRequestError,
  type DesktopMainResponse
} from "./model.js"

export async function handleDesktopMainRequest(
  local: LocalWebApp,
  input: unknown
): Promise<DesktopMainResponse> {
  const parsed = parseDesktopMainRequest(input)
  if (!parsed.ok) {
    return desktopHostErrorResponse(parsed.error, {
      requestId: parsed.requestId,
      operation: parsed.operation
    })
  }

  const request = parsed.request
  try {
    switch (request.operation) {
      case "snapshot":
        return {
          kind: DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          snapshot: projectDesktopMainSnapshot(
            await local.readSnapshot()
          )
        }
      case "webRequest":
        return {
          kind: DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          webResponse: await handleRequest(
            local.controller,
            request.request
          )
        }
      case "listModelEndpoints":
        return {
          kind: DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          modelEndpoints: projectLocalModelEndpoints(
            await local.modelEndpoints.listModelEndpoints()
          )
        }
      case "setActiveModelEndpoint":
        return {
          kind: DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          modelEndpoint: projectLocalModelEndpoint(
            await local.modelEndpoints.setActiveModelEndpoint(request.input)
          )
        }
    }
  } catch (error) {
    return desktopHostErrorResponse({
      code: "host_error",
      message: error instanceof Error ? error.message : String(error)
    }, {
      requestId: request.requestId,
      operation: request.operation
    })
  }
}

type DesktopMainRequestParseResult =
  | {
      readonly ok: true
      readonly request: DesktopMainRequest
    }
  | {
      readonly ok: false
      readonly requestId?: string
      readonly operation?: string
      readonly error: DesktopMainRequestError
    }

interface DesktopMainRequestContext {
  readonly requestId?: string | undefined
  readonly operation?: string | undefined
}

function parseDesktopMainRequest(
  input: unknown
): DesktopMainRequestParseResult {
  if (!isRecord(input)) {
    return parseFail({
      code: "invalid_request",
      field: "request",
      message: "desktop host request must be an object"
    })
  }
  const requestId = readOptionalString(input.requestId, "requestId")
  if (!requestId.ok) {
    return parseFail(requestId.error)
  }
  if (input.kind !== DESKTOP_MAIN_REQUEST_KIND) {
    return parseFail({
      code: "invalid_request",
      field: "kind",
      message: `desktop host request kind must be ${DESKTOP_MAIN_REQUEST_KIND}`
    }, {
      requestId: requestId.value
    })
  }
  const operation = readRequiredString(input.operation, "operation")
  if (!operation.ok) {
    return parseFail(operation.error, {
      requestId: requestId.value
    })
  }

  switch (operation.value) {
    case "snapshot":
      return parseOk({
        kind: DESKTOP_MAIN_REQUEST_KIND,
        operation: operation.value,
        ...optionalRequestId(requestId.value)
      })
    case "webRequest":
      if (!("request" in input)) {
        return parseFail({
          code: "invalid_request",
          field: "request",
          message: "webRequest requires request"
        }, {
          requestId: requestId.value,
          operation: operation.value
        })
      }
      return parseOk({
        kind: DESKTOP_MAIN_REQUEST_KIND,
        operation: operation.value,
        ...optionalRequestId(requestId.value),
        request: input.request
      })
    case "listModelEndpoints":
      return parseOk({
        kind: DESKTOP_MAIN_REQUEST_KIND,
        operation: operation.value,
        ...optionalRequestId(requestId.value)
      })
    case "setActiveModelEndpoint":
      return parseSetActiveModelEndpointRequest(input, requestId.value)
    default:
      return parseFail({
        code: "unknown_operation",
        field: "operation",
        message: `unknown desktop host operation: ${operation.value}`
      }, {
        requestId: requestId.value,
        operation: operation.value
      })
  }
}

function parseSetActiveModelEndpointRequest(
  input: Readonly<Record<string, unknown>>,
  requestId: string | undefined
): DesktopMainRequestParseResult {
  if (!isRecord(input.input)) {
    return parseFail({
      code: "invalid_request",
      field: "input",
      message: "setActiveModelEndpoint requires input"
    }, {
      requestId,
      operation: "setActiveModelEndpoint"
    })
  }
  const endpointId = readRequiredString(input.input.endpointId, "input.endpointId")
  if (!endpointId.ok) {
    return parseFail(endpointId.error, {
      requestId,
      operation: "setActiveModelEndpoint"
    })
  }
  return parseOk({
    kind: DESKTOP_MAIN_REQUEST_KIND,
    operation: "setActiveModelEndpoint",
    ...optionalRequestId(requestId),
    input: {
      endpointId: endpointId.value
    }
  })
}

function desktopHostErrorResponse(
  error: DesktopMainRequestError,
  options: DesktopMainRequestContext = {}
): DesktopMainErrorResponse {
  return {
    kind: DESKTOP_MAIN_RESPONSE_KIND,
    ok: false,
    ...optionalOperation(options.operation),
    ...optionalRequestId(options.requestId),
    error
  }
}

function parseOk(
  request: DesktopMainRequest
): DesktopMainRequestParseResult {
  return {
    ok: true,
    request
  }
}

function parseFail(
  error: DesktopMainRequestError,
  options: DesktopMainRequestContext = {}
): DesktopMainRequestParseResult {
  return {
    ok: false,
    ...optionalRequestId(options.requestId),
    ...optionalOperation(options.operation),
    error
  }
}

function readRequiredString(
  value: unknown,
  field: string
):
  | {
      readonly ok: true
      readonly value: string
    }
  | {
      readonly ok: false
      readonly error: DesktopMainRequestError
    } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        field,
        message: `${field} must be a non-empty string`
      }
    }
  }
  return {
    ok: true,
    value: value.trim()
  }
}

function readOptionalString(
  value: unknown,
  field: string
):
  | {
      readonly ok: true
      readonly value?: string
    }
  | {
      readonly ok: false
      readonly error: DesktopMainRequestError
    } {
  if (value === undefined) {
    return {
      ok: true
    }
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        field,
        message: `${field} must be a non-empty string when provided`
      }
    }
  }
  return {
    ok: true,
    value: value.trim()
  }
}

function optionalRequestId(
  requestId: string | undefined
): { readonly requestId?: string } {
  return requestId === undefined ? {} : { requestId }
}

function optionalOperation(
  operation: string | undefined
): { readonly operation?: string } {
  return operation === undefined ? {} : { operation }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
