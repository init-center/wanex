import type {
  Action,
  Controller,
  ActionResult,
  DispatchActionResponse,
  ReconcileEventsOptions,
  Request,
  RequestError,
  RequestErrorResponse,
  RefreshRequest,
  ApplicationResponse,
  Snapshot,
  SnapshotResponse,
} from "./model.js"

const MAX_RECONCILE_LIMIT = 100
const MAX_CONVERSATION_HISTORY_LIMIT = 200
const MAX_TEAM_HISTORY_LIMIT = 100

type RequestParseResult =
  | {
      readonly ok: true
      readonly request: Request
    }
  | {
      readonly ok: false
      readonly requestId?: string
      readonly operation?: string
      readonly error: RequestError
    }

export async function handleRequest(
  controller: Controller,
  input: unknown
): Promise<ApplicationResponse> {
  const parsed = parseRequest(input)
  if (!parsed.ok) {
    return requestErrorResponse({
      requestId: parsed.requestId,
      operation: parsed.operation,
      error: parsed.error,
      snapshot: controller.snapshot()
    })
  }

  const request = parsed.request
  switch (request.operation) {
    case "snapshot":
      return snapshotResponse({
        operation: request.operation,
        requestId: request.requestId,
        snapshot: controller.snapshot()
      })
    case "refresh":
      return snapshotResponse({
        operation: request.operation,
        requestId: request.requestId,
        snapshot: await controller.refresh(request.homeOptions)
      })
    case "reconcileEvents":
      return snapshotResponse({
        operation: request.operation,
        requestId: request.requestId,
        snapshot: await controller.reconcileEvents(request.options)
      })
    case "dispatchAction": {
      const actionResult = await controller.dispatchAction(
        request.action,
        request.requestId === undefined
          ? undefined
          : { requestId: request.requestId }
      )
      return dispatchActionResponse({
        requestId: request.requestId,
        actionResult
      })
    }
  }
}

export function parseRequest(
  input: unknown
): RequestParseResult {
  const record = readRecord(input, "request")
  if (!record.ok) {
    return fail(record.error)
  }
  if (record.value.kind !== "web.request") {
    return fail({
      code: "invalid_request",
      field: "kind",
      message: "request.kind must be web.request"
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
    case "snapshot":
      return ok({
        kind: "web.request",
        operation: "snapshot",
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
        kind: "web.request",
        operation: "refresh",
        ...optionalRequestId(requestId.value),
        ...optionalHomeOptions(homeOptions.value)
      })
    }
    case "reconcileEvents": {
      const reconcileOptions = readReconcileOptions(record.value.input, "input")
      if (!reconcileOptions.ok) {
        return withRequestContext(
          requestId.value,
          operation.value,
          reconcileOptions.error
        )
      }
      return ok({
        kind: "web.request",
        operation: "reconcileEvents",
        ...optionalRequestId(requestId.value),
        ...optionalReconcileOptions(reconcileOptions.value)
      })
    }
    case "dispatchAction": {
      const action = readAction(record.value.action)
      if (!action.ok) {
        return withRequestContext(
          requestId.value,
          operation.value,
          action.error
        )
      }
      return ok({
        kind: "web.request",
        operation: "dispatchAction",
        ...optionalRequestId(requestId.value),
        action: action.value
      })
    }
    default:
      return withRequestContext(requestId.value, operation.value, {
        code: "unknown_operation",
        field: "operation",
        message: `unknown web application request operation: ${operation.value}`
      })
  }
}

function snapshotResponse(request: {
  readonly operation: SnapshotResponse["operation"]
  readonly requestId: string | undefined
  readonly snapshot: Snapshot
}): SnapshotResponse {
  return {
    kind: "web.response",
    ok: true,
    operation: request.operation,
    ...optionalRequestId(request.requestId),
    snapshot: request.snapshot
  }
}

function dispatchActionResponse(request: {
  readonly requestId: string | undefined
  readonly actionResult: ActionResult
}): DispatchActionResponse {
  return {
    kind: "web.response",
    ok: true,
    operation: "dispatchAction",
    ...optionalRequestId(request.requestId),
    actionResult: request.actionResult
  }
}

function readAction(input: unknown):
  | { readonly ok: true; readonly value: Action }
  | { readonly ok: false; readonly error: RequestError } {
  const action = readRecord(input, "action")
  if (!action.ok) return action
  const type = readString(action.value.type, "action.type")
  if (!type.ok) return type
  if (!Object.hasOwn(ACTION_TYPES, type.value)) {
    return fail({
      code: "invalid_request",
      field: "action.type",
      message: `unknown web application action: ${type.value}`
    })
  }
  if (type.value === "load-earlier-history") {
    return readLoadEarlierHistoryAction(action.value)
  }
  if (type.value === "load-earlier-team-history") {
    return readLoadEarlierTeamHistoryAction(action.value)
  }
  return value(action.value as unknown as Action)
}

function readLoadEarlierHistoryAction(
  action: Readonly<Record<string, unknown>>
):
  | { readonly ok: true; readonly value: Action }
  | { readonly ok: false; readonly error: RequestError } {
  const input = readRecord(action.input, "action.input")
  if (!input.ok) return input
  const sessionId = readNonEmptyString(
    input.value.sessionId,
    "action.input.sessionId"
  )
  if (!sessionId.ok) return sessionId
  const cursor = readNonEmptyString(
    input.value.cursor,
    "action.input.cursor"
  )
  if (!cursor.ok) return cursor
  const limit = input.value.limit
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_CONVERSATION_HISTORY_LIMIT
  ) {
    return fail({
      code: "invalid_request",
      field: "action.input.limit",
      message: `action.input.limit must be an integer from 1 to ${MAX_CONVERSATION_HISTORY_LIMIT}`
    })
  }
  return value({
    type: "load-earlier-history",
    input: {
      sessionId: sessionId.value,
      cursor: cursor.value,
      limit
    }
  })
}

function readLoadEarlierTeamHistoryAction(
  action: Readonly<Record<string, unknown>>
):
  | { readonly ok: true; readonly value: Action }
  | { readonly ok: false; readonly error: RequestError } {
  const input = readRecord(action.input, "action.input")
  if (!input.ok) return input
  const conversationId = readNonEmptyString(
    input.value.conversationId,
    "action.input.conversationId"
  )
  if (!conversationId.ok) return conversationId
  const cursor = readNonEmptyString(
    input.value.cursor,
    "action.input.cursor"
  )
  if (!cursor.ok) return cursor
  const limit = input.value.limit
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_TEAM_HISTORY_LIMIT
  ) {
    return fail({
      code: "invalid_request",
      field: "action.input.limit",
      message: `action.input.limit must be an integer from 1 to ${MAX_TEAM_HISTORY_LIMIT}`
    })
  }
  return value({
    type: "load-earlier-team-history",
    input: {
      conversationId: conversationId.value,
      cursor: cursor.value,
      limit
    }
  })
}

const ACTION_TYPES = {
  "refresh": true,
  "start-new-conversation": true,
  "select-session": true,
  "rename-session": true,
  "archive-session": true,
  "restore-session": true,
  "set-layout": true,
  "set-mode": true,
  "update-preferences": true,
  "set-active-model-endpoint": true,
  "preview-command": true,
  "execute-command": true,
  "read-schedule": true,
  "create-schedule": true,
  "replace-schedule": true,
  "set-schedule-enabled": true,
  "remove-schedule": true,
  "refresh-execution": true,
  "open-workbench": true,
  "submit-conversation": true,
  "queue-guided-follow-up": true,
  "steer-current-response": true,
  "start-side-query": true,
  "cancel-side-query": true,
  "dismiss-side-query": true,
  "start-plan-generation": true,
  "cancel-plan-generation": true,
  "dismiss-plan-generation": true,
  "revise-plan-proposal": true,
  "decide-plan-proposal": true,
  "execute-plan-proposal": true,
  "start-goal": true,
  "pause-goal": true,
  "resume-goal": true,
  "cancel-goal": true,
  "remove-conversation-attachment": true,
  "refresh-conversation": true,
  "load-earlier-history": true,
  "cancel-conversation": true,
  "regenerate-conversation": true,
  "resolve-conversation-approval": true,
  "resolve-conversation-recovery": true,
  "create-team-conversation": true,
  "select-team-conversation": true,
  "close-team-conversation": true,
  "add-team-participant": true,
  "update-team-participant": true,
  "set-team-coordinator": true,
  "submit-team-round": true,
  "load-earlier-team-history": true,
  "read-plugin-management": true,
  "request-local-plugin-review": true,
  "approve-local-plugin-review": true,
  "cancel-local-plugin-review": true,
  "set-plugin-install-state": true,
  "retry-plugin-refresh": true
} satisfies Readonly<Record<Action["type"], true>>

function requestErrorResponse(request: {
  readonly requestId: string | undefined
  readonly operation: string | undefined
  readonly error: RequestError
  readonly snapshot: Snapshot
}): RequestErrorResponse {
  return {
    kind: "web.response",
    ok: false,
    ...optionalRequestId(request.requestId),
    ...optionalOperation(request.operation),
    error: request.error,
    snapshot: request.snapshot
  }
}

function readRefreshHomeOptions(input: unknown):
  | {
      readonly ok: true
      readonly value: RefreshRequest["homeOptions"] | undefined
    }
  | {
      readonly ok: false
      readonly error: RequestError
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
  return value(homeOptions.value as RefreshRequest["homeOptions"])
}

function readReconcileOptions(
  input: unknown,
  label: string
):
  | {
      readonly ok: true
      readonly value: ReconcileEventsOptions | undefined
    }
  | {
      readonly ok: false
      readonly error: RequestError
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
    limit > MAX_RECONCILE_LIMIT
  ) {
    return fail({
      code: "invalid_request",
      field: `${label}.limit`,
      message: `${label}.limit must be an integer from 1 to ${MAX_RECONCILE_LIMIT}`
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
      readonly error: RequestError
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
      readonly error: RequestError
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
      readonly error: RequestError
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

function readNonEmptyString(input: unknown, field: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: RequestError } {
  const parsed = readString(input, field)
  if (!parsed.ok) return parsed
  if (parsed.value.trim().length === 0) {
    return fail({
      code: "invalid_request",
      field,
      message: `${field} must not be empty`
    })
  }
  return parsed
}

function ok(request: Request): RequestParseResult {
  return {
    ok: true,
    request
  }
}

function fail(
  error: RequestError
): RequestParseResult & { readonly ok: false } {
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
  error: RequestError
): RequestParseResult & { readonly ok: false } {
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
  homeOptions: RefreshRequest["homeOptions"] | undefined
): {
  readonly homeOptions?: NonNullable<RefreshRequest["homeOptions"]>
} {
  return homeOptions === undefined ? {} : { homeOptions }
}

function optionalReconcileOptions(
  options: ReconcileEventsOptions | undefined
): { readonly options?: ReconcileEventsOptions } {
  return options === undefined ? {} : { options }
}
