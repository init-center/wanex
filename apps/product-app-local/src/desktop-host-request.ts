import {
  handleProductAppWebRequest
} from "@wanex/product-app-web"
import {
  projectProductAppDesktopMainSnapshot
} from "./desktop-host-snapshot.js"
import {
  projectProductAppLocalProviderProfile,
  projectProductAppLocalProviderProfiles
} from "./provider-profile-read-model.js"
import type {
  ProductAppLocalWebApp
} from "./types.js"
import {
  PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND,
  PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
  type ProductAppDesktopMainErrorResponse,
  type ProductAppDesktopMainRequest,
  type ProductAppDesktopMainRequestError,
  type ProductAppDesktopMainResponse
} from "./desktop-host-types.js"

export async function handleProductAppDesktopMainRequest(
  local: ProductAppLocalWebApp,
  input: unknown
): Promise<ProductAppDesktopMainResponse> {
  const parsed = parseProductAppDesktopMainRequest(input)
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
          kind: PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          snapshot: projectProductAppDesktopMainSnapshot(
            await local.readSnapshot()
          )
        }
      case "webRequest":
        return {
          kind: PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          webResponse: await handleProductAppWebRequest(
            local.webController,
            request.request
          )
        }
      case "listProviderProfiles":
        return {
          kind: PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          providerProfiles: projectProductAppLocalProviderProfiles(
            await local.providerProfiles.listProviderProfiles()
          )
        }
      case "setActiveProviderProfile":
        return {
          kind: PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
          ok: true,
          operation: request.operation,
          ...optionalRequestId(request.requestId),
          providerProfile: projectProductAppLocalProviderProfile(
            await local.providerProfiles.setActiveProviderProfile(request.input)
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

type ProductAppDesktopMainRequestParseResult =
  | {
      readonly ok: true
      readonly request: ProductAppDesktopMainRequest
    }
  | {
      readonly ok: false
      readonly requestId?: string
      readonly operation?: string
      readonly error: ProductAppDesktopMainRequestError
    }

interface ProductAppDesktopMainRequestContext {
  readonly requestId?: string | undefined
  readonly operation?: string | undefined
}

function parseProductAppDesktopMainRequest(
  input: unknown
): ProductAppDesktopMainRequestParseResult {
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
  if (input.kind !== PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND) {
    return parseFail({
      code: "invalid_request",
      field: "kind",
      message: `desktop host request kind must be ${PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND}`
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
        kind: PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND,
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
        kind: PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND,
        operation: operation.value,
        ...optionalRequestId(requestId.value),
        request: input.request
      })
    case "listProviderProfiles":
      return parseOk({
        kind: PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND,
        operation: operation.value,
        ...optionalRequestId(requestId.value)
      })
    case "setActiveProviderProfile":
      return parseSetActiveProviderProfileRequest(input, requestId.value)
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

function parseSetActiveProviderProfileRequest(
  input: Readonly<Record<string, unknown>>,
  requestId: string | undefined
): ProductAppDesktopMainRequestParseResult {
  if (!isRecord(input.input)) {
    return parseFail({
      code: "invalid_request",
      field: "input",
      message: "setActiveProviderProfile requires input"
    }, {
      requestId,
      operation: "setActiveProviderProfile"
    })
  }
  const profileId = readRequiredString(input.input.profileId, "input.profileId")
  if (!profileId.ok) {
    return parseFail(profileId.error, {
      requestId,
      operation: "setActiveProviderProfile"
    })
  }
  return parseOk({
    kind: PRODUCT_APP_DESKTOP_MAIN_REQUEST_KIND,
    operation: "setActiveProviderProfile",
    ...optionalRequestId(requestId),
    input: {
      profileId: profileId.value
    }
  })
}

function desktopHostErrorResponse(
  error: ProductAppDesktopMainRequestError,
  options: ProductAppDesktopMainRequestContext = {}
): ProductAppDesktopMainErrorResponse {
  return {
    kind: PRODUCT_APP_DESKTOP_MAIN_RESPONSE_KIND,
    ok: false,
    ...optionalOperation(options.operation),
    ...optionalRequestId(options.requestId),
    error
  }
}

function parseOk(
  request: ProductAppDesktopMainRequest
): ProductAppDesktopMainRequestParseResult {
  return {
    ok: true,
    request
  }
}

function parseFail(
  error: ProductAppDesktopMainRequestError,
  options: ProductAppDesktopMainRequestContext = {}
): ProductAppDesktopMainRequestParseResult {
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
      readonly error: ProductAppDesktopMainRequestError
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
      readonly error: ProductAppDesktopMainRequestError
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
