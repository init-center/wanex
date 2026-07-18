import type {
  ProductAppWebController,
  ProductAppWebControllerSubmitResult,
  ProductAppWebControllerSubmitOptions,
  ProductAppWebDocument,
  ProductAppWebDocumentResponse,
  ProductAppWebPollEventsOptions,
  ProductAppWebRequest,
  ProductAppWebRequestError,
  ProductAppWebRequestErrorResponse,
  ProductAppWebRefreshRequest,
  ProductAppWebResponse,
  ProductAppWebSubmitActionInputResponse
} from "./types.js"

const MAX_POLL_LIMIT = 100

type ProductAppWebRequestParseResult =
  | {
      readonly ok: true
      readonly request: ProductAppWebRequest
    }
  | {
      readonly ok: false
      readonly requestId?: string
      readonly operation?: string
      readonly error: ProductAppWebRequestError
    }

export async function handleProductAppWebRequest(
  controller: ProductAppWebController,
  input: unknown
): Promise<ProductAppWebResponse> {
  const parsed = parseProductAppWebRequest(input)
  if (!parsed.ok) {
    return requestErrorResponse({
      requestId: parsed.requestId,
      operation: parsed.operation,
      error: parsed.error,
      document: controller.document()
    })
  }

  const request = parsed.request
  switch (request.operation) {
    case "document":
      return documentResponse({
        operation: request.operation,
        requestId: request.requestId,
        document: controller.document()
      })
    case "refresh":
      return documentResponse({
        operation: request.operation,
        requestId: request.requestId,
        document: await controller.refresh(request.homeOptions)
      })
    case "pollEvents":
      return documentResponse({
        operation: request.operation,
        requestId: request.requestId,
        document: await controller.pollEvents(request.options)
      })
    case "submitActionInput": {
      const submitResult = await controller.submitActionInput(
        request.input,
        request.options
      )
      return submitActionInputResponse({
        requestId: request.requestId,
        document: submitResult.document,
        submitResult
      })
    }
  }
}

export function parseProductAppWebRequest(
  input: unknown
): ProductAppWebRequestParseResult {
  const record = readRecord(input, "request")
  if (!record.ok) {
    return fail(record.error)
  }
  if (record.value.kind !== "product-app-web.request") {
    return fail({
      code: "invalid_request",
      field: "kind",
      message: "request.kind must be product-app-web.request"
    })
  }

  const requestId = readOptionalRequestId(record.value.requestId)
  if (!requestId.ok) {
    return fail(requestId.error)
  }
  const operation = readString(record.value.operation, "operation")
  if (!operation.ok) {
    return withRequestContext(requestId.value, undefined, operation.error)
  }

  switch (operation.value) {
    case "document":
      return ok({
        kind: "product-app-web.request",
        operation: "document",
        ...optionalRequestId(requestId.value)
      })
    case "refresh": {
      const homeOptions = readRefreshHomeOptions(record.value.input)
      if (!homeOptions.ok) {
        return withRequestContext(
          requestId.value,
          operation.value,
          homeOptions.error
        )
      }
      return ok({
        kind: "product-app-web.request",
        operation: "refresh",
        ...optionalRequestId(requestId.value),
        ...optionalHomeOptions(homeOptions.value)
      })
    }
    case "pollEvents": {
      const pollOptions = readPollOptions(record.value.input, "input")
      if (!pollOptions.ok) {
        return withRequestContext(
          requestId.value,
          operation.value,
          pollOptions.error
        )
      }
      return ok({
        kind: "product-app-web.request",
        operation: "pollEvents",
        ...optionalRequestId(requestId.value),
        ...optionalPollOptions(pollOptions.value)
      })
    }
    case "submitActionInput": {
      const options = readSubmitOptions(record.value.options)
      if (!options.ok) {
        return withRequestContext(
          requestId.value,
          operation.value,
          options.error
        )
      }
      return ok({
        kind: "product-app-web.request",
        operation: "submitActionInput",
        ...optionalRequestId(requestId.value),
        input: record.value.input,
        ...optionalSubmitOptions(options.value)
      })
    }
    default:
      return withRequestContext(requestId.value, operation.value, {
        code: "unknown_operation",
        field: "operation",
        message: `unknown Product App Web request operation: ${operation.value}`
      })
  }
}

function documentResponse(request: {
  readonly operation: ProductAppWebDocumentResponse["operation"]
  readonly requestId: string | undefined
  readonly document: ProductAppWebDocument
}): ProductAppWebDocumentResponse {
  return {
    kind: "product-app-web.response",
    ok: true,
    operation: request.operation,
    ...optionalRequestId(request.requestId),
    document: request.document
  }
}

function submitActionInputResponse(request: {
  readonly requestId: string | undefined
  readonly document: ProductAppWebDocument
  readonly submitResult: ProductAppWebControllerSubmitResult
}): ProductAppWebSubmitActionInputResponse {
  return {
    kind: "product-app-web.response",
    ok: true,
    operation: "submitActionInput",
    ...optionalRequestId(request.requestId),
    document: request.document,
    submitResult: request.submitResult
  }
}

function requestErrorResponse(request: {
  readonly requestId: string | undefined
  readonly operation: string | undefined
  readonly error: ProductAppWebRequestError
  readonly document: ProductAppWebDocument
}): ProductAppWebRequestErrorResponse {
  return {
    kind: "product-app-web.response",
    ok: false,
    ...optionalRequestId(request.requestId),
    ...optionalOperation(request.operation),
    error: request.error,
    document: request.document
  }
}

function readRefreshHomeOptions(input: unknown):
  | {
      readonly ok: true
      readonly value: ProductAppWebRefreshRequest["homeOptions"] | undefined
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (input === undefined) {
    return value(undefined)
  }
  const record = readRecord(input, "input")
  if (!record.ok) {
    return record
  }
  if (!("homeOptions" in record.value) || record.value.homeOptions === undefined) {
    return value(undefined)
  }
  const homeOptions = readRecord(record.value.homeOptions, "input.homeOptions")
  if (!homeOptions.ok) {
    return homeOptions
  }
  return value(homeOptions.value as ProductAppWebRefreshRequest["homeOptions"])
}

function readSubmitOptions(
  input: unknown
):
  | {
      readonly ok: true
      readonly value: ProductAppWebControllerSubmitOptions | undefined
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (input === undefined) {
    return value(undefined)
  }
  const record = readRecord(input, "options")
  if (!record.ok) {
    return record
  }
  if (
    !("pollAfterAction" in record.value) ||
    record.value.pollAfterAction === undefined
  ) {
    return value({})
  }
  if (record.value.pollAfterAction === false) {
    return value({
      pollAfterAction: false
    })
  }
  const pollAfterAction = readPollOptions(
    record.value.pollAfterAction,
    "options.pollAfterAction"
  )
  if (!pollAfterAction.ok) {
    return pollAfterAction
  }
  return value({
    pollAfterAction: pollAfterAction.value ?? {}
  })
}

function readPollOptions(
  input: unknown,
  label: string
):
  | {
      readonly ok: true
      readonly value: ProductAppWebPollEventsOptions | undefined
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (input === undefined) {
    return value(undefined)
  }
  const record = readRecord(input, label)
  if (!record.ok) {
    return record
  }
  if (!("limit" in record.value) || record.value.limit === undefined) {
    return value({})
  }
  const limit = record.value.limit
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_POLL_LIMIT
  ) {
    return fail({
      code: "invalid_request",
      field: `${label}.limit`,
      message: `${label}.limit must be an integer from 1 to ${MAX_POLL_LIMIT}`
    })
  }
  return value({ limit })
}

function readOptionalRequestId(input: unknown):
  | {
      readonly ok: true
      readonly value: string | undefined
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (input === undefined) {
    return value(undefined)
  }
  const requestId = readString(input, "requestId")
  if (!requestId.ok) {
    return requestId
  }
  if (requestId.value.trim().length === 0) {
    return fail({
      code: "invalid_request",
      field: "requestId",
      message: "requestId must not be empty"
    })
  }
  return value(requestId.value)
}

function readRecord(input: unknown, label: string):
  | {
      readonly ok: true
      readonly value: Readonly<Record<string, unknown>>
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (isRecord(input)) {
    return value(input)
  }
  return fail({
    code: "invalid_request",
    field: label,
    message: `${label} must be an object`
  })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(input: unknown, field: string):
  | {
      readonly ok: true
      readonly value: string
    }
  | {
      readonly ok: false
      readonly error: ProductAppWebRequestError
    } {
  if (typeof input === "string") {
    return value(input)
  }
  return fail({
    code: "invalid_request",
    field,
    message: `${field} must be a string`
  })
}

function ok(request: ProductAppWebRequest): ProductAppWebRequestParseResult {
  return {
    ok: true,
    request
  }
}

function fail(
  error: ProductAppWebRequestError
): ProductAppWebRequestParseResult & { readonly ok: false } {
  return {
    ok: false,
    error
  }
}

function value<T>(parsed: T): { readonly ok: true; readonly value: T } {
  return {
    ok: true,
    value: parsed
  }
}

function withRequestContext(
  requestId: string | undefined,
  operation: string | undefined,
  error: ProductAppWebRequestError
): ProductAppWebRequestParseResult & { readonly ok: false } {
  return {
    ok: false,
    ...optionalRequestId(requestId),
    ...optionalOperation(operation),
    error
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

function optionalHomeOptions(
  homeOptions: ProductAppWebRefreshRequest["homeOptions"] | undefined
): {
  readonly homeOptions?: NonNullable<ProductAppWebRefreshRequest["homeOptions"]>
} {
  return homeOptions === undefined ? {} : { homeOptions }
}

function optionalPollOptions(
  options: ProductAppWebPollEventsOptions | undefined
): { readonly options?: ProductAppWebPollEventsOptions } {
  return options === undefined ? {} : { options }
}

function optionalSubmitOptions(
  options: ProductAppWebControllerSubmitOptions | undefined
): { readonly options?: ProductAppWebControllerSubmitOptions } {
  return options === undefined ? {} : { options }
}
