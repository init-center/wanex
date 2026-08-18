import { randomUUID } from "node:crypto"
import { renderTuiConversationOperation } from "../../presentation/conversation.js"
import { renderTuiFrame } from "../../presentation/frame.js"
import { singleLine } from "../text.js"
import { renderTuiWorkbench } from "../../presentation/workbench.js"
import { writeLine } from "../output.js"
import type { TuiLineSessionState } from "../state.js"
import type { TuiLineSessionOptions } from "../../model.js"
import { expectSurfaceOk, expectSurfaceValue } from "./result.js"

export async function runAttachCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly path: string
}): Promise<void> {
  const host = options.sessionOptions.attachmentHost
  if (host === undefined) {
    throw new Error("attach is unavailable without a trusted TUI host")
  }
  const result = await host.attachPath({
    path: options.path,
    ...(options.state.activeSessionId === undefined
      ? {}
      : { sessionId: options.state.activeSessionId })
  })
  options.state.attachCommandCount += 1
  await options.sessionOptions.surface.refresh()
  await writeLine(
    options.sessionOptions,
    `attached:${result.resourceId}${result.label === undefined ? "" : `:${result.label}`}`
  )
}

export async function runRefreshCommand(
  sessionOptions: TuiLineSessionOptions
): Promise<void> {
  const snapshot = await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, "refreshed")
  await writeLine(
    sessionOptions,
    renderTuiFrame(snapshot).text
  )
  if (snapshot.conversation.ok) {
    await writeLine(
      sessionOptions,
      renderTuiConversationOperation(snapshot.conversation.value).text
    )
  }
}

export async function runAskCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly text: string
}): Promise<void> {
  const { sessionOptions, state, text } = options
  state.askCommandCount += 1
  const result =
    await sessionOptions.surface.client.submitConversationOperation({
      text,
      ...(state.activeSessionId === undefined
        ? {}
        : { sessionId: state.activeSessionId })
    })
  const value = expectSurfaceValue(result, "submitConversationOperation")
  if (value.kind === "product.conversation-operation.rejected") {
    state.blockedCommandCount += 1
  } else {
    state.activeSessionId = value.operation.sessionId
  }
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderTuiConversationOperation(value).text
  )
}

export async function runSteerCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly text: string
}): Promise<void> {
  const { sessionOptions, state } = options
  state.steerCommandCount += 1
  const current = expectSurfaceValue(
    await sessionOptions.surface.client.readTrackedConversationOperation(
      state.activeSessionId === undefined
        ? undefined
        : { sessionId: state.activeSessionId }
    ),
    "readTrackedConversationOperation"
  )
  if (current.kind !== "product.conversation-operation.found") {
    state.blockedCommandCount += 1
    await writeLine(
      sessionOptions,
      renderTuiConversationOperation(current).text
    )
    return
  }
  state.activeSessionId = current.operation.sessionId
  const value = expectSurfaceValue(
    await sessionOptions.surface.client.steerTrackedConversationOperation(
      {
        operationId: current.operation.operationId,
        sessionId: current.operation.sessionId,
        text: options.text
      },
      { requestId: `tui-steer-${randomUUID()}` }
    ),
    "steerTrackedConversationOperation"
  )
  if (value.kind === "product.conversation-operation.rejected") {
    state.blockedCommandCount += 1
  }
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderTuiConversationOperation(value).text
  )
}

export async function runSelectCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly sessionId: string
}): Promise<void> {
  const { sessionOptions, state, sessionId } = options
  const result = await sessionOptions.surface.client.selectSession({
    sessionId
  })
  expectSurfaceOk(result, "selectSession")
  state.selectCommandCount += 1
  state.activeSessionId = sessionId
  state.planProposalId = undefined
  state.planProposalRevision = undefined
  state.goalId = undefined
  state.goalRevision = undefined
  state.goalState = undefined
  await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, `selected:${sessionId}`)
}

export async function runWorkbenchCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result = await sessionOptions.surface.client.openWorkbench(
    sessionId === undefined ? undefined : { sessionId }
  )
  const value = expectSurfaceValue(result, "openWorkbench")
  if (
    value.kind === "product.workbench.opened" ||
    value.kind === "product.workbench.failed"
  ) {
    if (value.sessionId !== undefined) {
      state.activeSessionId = value.sessionId
    }
  }
  state.workbenchCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, renderTuiWorkbench(value).text)
}

export async function runOperationCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result =
    await sessionOptions.surface.client.readTrackedConversationOperation(
      sessionId === undefined ? undefined : { sessionId }
    )
  const value = expectSurfaceValue(result, "readTrackedConversationOperation")
  const resolvedSessionId = conversationResultSessionId(value)
  if (resolvedSessionId !== undefined) {
    state.activeSessionId = resolvedSessionId
  }
  state.operationCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderTuiConversationOperation(value).text
  )
}

export async function runCancelCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly reason?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const result =
    await sessionOptions.surface.client.cancelTrackedConversationOperation({
      reason: options.reason ?? "user requested cancellation",
      ...(state.activeSessionId === undefined
        ? {}
        : { sessionId: state.activeSessionId })
    })
  const value = expectSurfaceValue(result, "cancelTrackedConversationOperation")
  const resolvedSessionId = conversationResultSessionId(value.operation)
  if (resolvedSessionId !== undefined) {
    state.activeSessionId = resolvedSessionId
  }
  state.cancelCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderTuiConversationOperation(value).text
  )
}

export async function runRegenerateCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result =
    await sessionOptions.surface.client.regenerateTrackedConversationOperation(
      sessionId === undefined ? undefined : { sessionId }
    )
  const value = expectSurfaceValue(
    result,
    "regenerateTrackedConversationOperation"
  )
  if (value.kind === "product.conversation-operation.rejected") {
    state.blockedCommandCount += 1
  } else {
    state.activeSessionId = value.operation.sessionId
  }
  state.regenerateCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderTuiConversationOperation(value).text
  )
}

export async function runModelCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly endpointId: string
}): Promise<void> {
  const result = await options.sessionOptions.surface.client.setActiveModelEndpoint({
    endpointId: options.endpointId
  })
  const endpoint = expectSurfaceValue(result, "setActiveModelEndpoint")
  await options.sessionOptions.surface.refresh()
  await writeLine(
    options.sessionOptions,
    `model:${singleLine(endpoint.id)} | active:${endpoint.active ? "yes" : "no"}`
  )
}

export async function runApprovalDecisionCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly approvalId: string
  readonly decision: "approve_once" | "deny"
  readonly reason: string
}): Promise<void> {
  const current = expectSurfaceValue(
    await options.sessionOptions.surface.client.readTrackedConversationOperation(
      options.state.activeSessionId === undefined
        ? undefined
        : { sessionId: options.state.activeSessionId }
    ),
    "readTrackedConversationOperation"
  )
  if (current.kind !== "product.conversation-operation.found") {
    throw new Error("no tracked conversation approval is available")
  }
  const approval = current.operation.approvals?.items.find(
    (item) => item.approvalId === options.approvalId
  )
  if (approval === undefined) {
    throw new Error(`approval is not current: ${options.approvalId}`)
  }
  if (!approval.availableDecisions.includes(options.decision)) {
    throw new Error(`approval decision is not available: ${options.decision}`)
  }
  const resolved = expectSurfaceValue(
    await options.sessionOptions.surface.client.resolveTrackedConversationApproval({
      sessionId: current.operation.sessionId,
      approvalId: approval.approvalId,
      expectedApprovalRevision: approval.approvalRevision,
      decision: options.decision,
      reason: options.reason
    }),
    "resolveTrackedConversationApproval"
  )
  options.state.approvalCommandCount += 1
  if (resolved.kind === "product.conversation-operation.rejected") {
    options.state.blockedCommandCount += 1
  }
  await options.sessionOptions.surface.refresh()
  await writeLine(
    options.sessionOptions,
    resolved.kind === "product.conversation-approval.resolved"
      ? renderTuiConversationOperation(resolved.operation).text
      : renderTuiConversationOperation(resolved).text
  )
}

export async function reconcileTuiConversationInvalidation(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly operationId: string
  readonly sessionId: string
}): Promise<void> {
  if (options.state.activeSessionId !== options.sessionId) return
  const current = expectSurfaceValue(
    await options.sessionOptions.surface.client.readTrackedConversationOperation({
      sessionId: options.sessionId
    }),
    "readTrackedConversationOperation"
  )
  if (
    current.kind === "product.conversation-operation.found" &&
    current.operation.operationId !== options.operationId
  ) {
    return
  }
  await options.sessionOptions.surface.refresh()
  await writeLine(
    options.sessionOptions,
    renderTuiConversationOperation(current).text
  )
}

function conversationResultSessionId(value: {
  readonly kind: string
  readonly sessionId?: string
  readonly operation?: { readonly sessionId: string }
}): string | undefined {
  return value.operation?.sessionId ?? value.sessionId
}
