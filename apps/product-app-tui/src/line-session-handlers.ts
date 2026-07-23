import {
  renderProductAppTuiConversationOperation
} from "./conversation-operation-presenter.js"
import { renderProductAppTuiEvents } from "./events-presenter.js"
import {
  renderProductAppTuiCommandPreview
} from "./command-preview-presenter.js"
import { renderProductAppTuiCommandExecution } from "./command-execution-presenter.js"
import { renderProductAppTuiExecutionActivity } from "./execution-activity-presenter.js"
import {
  renderProductAppTuiCommandCatalog
} from "./command-catalog-presenter.js"
import { writeLine } from "./line-session-output.js"
import {
  helpText,
  paletteText,
  resolvePaletteSelector
} from "./line-session-text.js"
import { renderProductAppTuiFrame } from "./presenter.js"
import { renderProductAppTuiWorkbench } from "./workbench-presenter.js"
import { collectProductAppTuiCommandInput } from "./guided-input.js"
import type {
  ProductAppTuiLineCommand
} from "./line-session-command-parser.js"
import type {
  ProductAppTuiLineSessionState
} from "./line-session-state.js"
import type {
  ProductAppTuiLineSessionOptions
} from "./types.js"

export async function executeProductAppTuiLineCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly command: Exclude<ProductAppTuiLineCommand, { readonly kind: "error" }>
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { command, sessionOptions, state } = options
  switch (command.name) {
    case "help":
      await writeLine(sessionOptions, helpText())
      break
    case "overview":
      await writeLine(
        sessionOptions,
        renderProductAppTuiFrame(
          sessionOptions.surface.snapshot(),
          sessionOptions.renderOptions
        ).text
      )
      break
    case "commands":
      state.catalogCommandCount += 1
      await writeLine(
        sessionOptions,
        renderProductAppTuiCommandCatalog(
          sessionOptions.surface.snapshot().commandCatalog
        ).text
      )
      break
    case "refresh":
      await runRefreshCommand(sessionOptions)
      break
    case "ask":
      await runAskCommand({
        sessionOptions,
        state,
        text: command.text
      })
      break
    case "attach":
      await runAttachCommand({
        sessionOptions,
        state,
        path: command.path
      })
      break
    case "select":
      await runSelectCommand({
        sessionOptions,
        state,
        sessionId: command.sessionId
      })
      break
    case "workbench":
      await runWorkbenchCommand({
        sessionOptions,
        state,
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId })
      })
      break
    case "operation":
      await runOperationCommand({
        sessionOptions,
        state,
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId })
      })
      break
    case "cancel":
      await runCancelCommand({
        sessionOptions,
        state,
        ...(command.reason === undefined ? {} : { reason: command.reason })
      })
      break
    case "regenerate":
      await runRegenerateCommand({
        sessionOptions,
        state,
        ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId })
      })
      break
    case "palette":
      await runPaletteCommand({
        sessionOptions,
        state,
        ...(command.paletteSelector === undefined
          ? {}
          : { paletteSelector: command.paletteSelector }),
        ...(command.input === undefined ? {} : { input: command.input }),
        readLine: options.readLine
      })
      break
    case "preview":
      await runPreviewCommand({
        sessionOptions,
        state,
        commandId: command.commandId,
        ...(command.input === undefined ? {} : { input: command.input }),
        readLine: options.readLine
      })
      break
    case "execute":
      await runExecuteCommand({
        sessionOptions,
        state,
        commandId: command.commandId,
        ...(command.input === undefined ? {} : { input: command.input }),
        readLine: options.readLine
      })
      break
    case "execution":
      await runExecutionCommand({
        sessionOptions,
        state,
        jobId: command.jobId
      })
      break
    case "events":
      await runEventsCommand({
        sessionOptions,
        state,
        ...(command.limit === undefined ? {} : { limit: command.limit })
      })
      break
    case "quit":
      state.quit = true
      await writeLine(sessionOptions, "bye")
      break
  }
}

async function runAttachCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
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

async function runExecutionCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly jobId: string
}): Promise<void> {
  const result = await options.sessionOptions.surface.client.readExecutionReference({
    kind: "job",
    id: options.jobId
  })
  const value = expectSurfaceValue(result, "readExecutionReference")
  options.state.executionCommandCount += 1
  await writeLine(
    options.sessionOptions,
    renderProductAppTuiExecutionActivity(value).text
  )
}

async function runRefreshCommand(
  sessionOptions: ProductAppTuiLineSessionOptions
): Promise<void> {
  const snapshot = await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, "refreshed")
  await writeLine(
    sessionOptions,
    renderProductAppTuiFrame(snapshot, sessionOptions.renderOptions).text
  )
  if (snapshot.conversation.ok) {
    await writeLine(
      sessionOptions,
      renderProductAppTuiConversationOperation(snapshot.conversation.value).text
    )
  }
}

async function runAskCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly text: string
}): Promise<void> {
  const { sessionOptions, state, text } = options
  state.askCommandCount += 1
  const result = await sessionOptions.surface.client.submitConversationOperation({
    text,
    ...(state.activeSessionId === undefined
      ? {}
      : { sessionId: state.activeSessionId })
  })
  const value = expectSurfaceValue(result, "submitConversationOperation")
  if (value.kind === "product-app.conversation-operation.rejected") {
    state.blockedCommandCount += 1
  } else {
    state.activeSessionId = value.operation.sessionId
  }
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderProductAppTuiConversationOperation(value).text
  )
}

async function runSelectCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly sessionId: string
}): Promise<void> {
  const { sessionOptions, state, sessionId } = options
  const result = await sessionOptions.surface.client.selectSession({ sessionId })
  expectSurfaceOk(result, "selectSession")
  state.selectCommandCount += 1
  state.activeSessionId = sessionId
  await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, `selected:${sessionId}`)
}

async function runWorkbenchCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result = await sessionOptions.surface.client.openWorkbench(
    sessionId === undefined ? undefined : { sessionId }
  )
  const value = expectSurfaceValue(result, "openWorkbench")
  if (
    value.kind === "product-app.workbench.opened" ||
    value.kind === "product-app.workbench.failed"
  ) {
    if (value.sessionId !== undefined) {
      state.activeSessionId = value.sessionId
    }
  }
  state.workbenchCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(sessionOptions, renderProductAppTuiWorkbench(value).text)
}

async function runOperationCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result = await sessionOptions.surface.client.readTrackedConversationOperation(
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
    renderProductAppTuiConversationOperation(value).text
  )
}

async function runCancelCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly reason?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const result = await sessionOptions.surface.client.cancelTrackedConversationOperation({
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
    renderProductAppTuiConversationOperation(value).text
  )
}

async function runRegenerateCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly sessionId?: string
}): Promise<void> {
  const { sessionOptions, state } = options
  const sessionId = options.sessionId ?? state.activeSessionId
  const result = await sessionOptions.surface.client.regenerateTrackedConversationOperation(
    sessionId === undefined ? undefined : { sessionId }
  )
  const value = expectSurfaceValue(result, "regenerateTrackedConversationOperation")
  if (value.kind === "product-app.conversation-operation.rejected") {
    state.blockedCommandCount += 1
  } else {
    state.activeSessionId = value.operation.sessionId
  }
  state.regenerateCommandCount += 1
  await sessionOptions.surface.refresh()
  await writeLine(
    sessionOptions,
    renderProductAppTuiConversationOperation(value).text
  )
}

function conversationResultSessionId(value: {
  readonly kind: string
  readonly sessionId?: string
  readonly operation?: { readonly sessionId: string }
}): string | undefined {
  return value.operation?.sessionId ?? value.sessionId
}

async function runPaletteCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly paletteSelector?: string
  readonly input?: unknown
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { sessionOptions, state, paletteSelector, input } = options
  if (paletteSelector === undefined) {
    await writeLine(sessionOptions, paletteText(sessionOptions))
    return
  }
  const id = resolvePaletteSelector(sessionOptions, paletteSelector)
  const entry = sessionOptions.surface.readModel().palette.find((item) => item.id === id)
  const guided =
    input === undefined && entry?.command.commandId !== undefined
      ? await guidedCommandInput({
          sessionOptions,
          commandId: entry.command.commandId,
          readLine: options.readLine
        })
      : { kind: "completed" as const, input }
  if (guided.kind === "cancelled") {
    if (guided.quit) {
      state.quit = true
      await writeLine(sessionOptions, "bye")
    } else {
      await writeLine(sessionOptions, "guided input cancelled")
    }
    return
  }
  const result = await sessionOptions.surface.controller.executePaletteEntry({
    id,
    ...(guided.input === undefined ? {} : { input: guided.input })
  })
  state.paletteCommandCount += 1
  if (result.status === "completed") {
    const snapshot = await sessionOptions.surface.refresh()
    if (snapshot.status.ok) {
      state.activeSessionId = snapshot.status.value.state.selectedSessionId
    }
  }
  await writeLine(sessionOptions, JSON.stringify(result, null, 2))
}

async function runPreviewCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly commandId: string
  readonly input?: unknown
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { sessionOptions, state, commandId, input } = options
  const guided = input === undefined
    ? await guidedCommandInput({ sessionOptions, commandId, readLine: options.readLine })
    : { kind: "completed" as const, input }
  if (guided.kind === "cancelled") {
    await handleGuidedCancellation(sessionOptions, state, guided)
    return
  }
  const result = await sessionOptions.surface.client.previewProductCommandInvocation({
    commandId,
    ...(guided.input === undefined ? {} : { input: guided.input })
  })
  state.previewCommandCount += 1
  const value = expectSurfaceValue(result, "previewProductCommandInvocation")
  await writeLine(sessionOptions, renderProductAppTuiCommandPreview(value))
}

async function runExecuteCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly commandId: string
  readonly input?: unknown
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { sessionOptions, state, commandId, input } = options
  const catalog = sessionOptions.surface.snapshot().commandCatalog
  if (
    catalog.ok &&
    !catalog.value.commands.some((command) => command.id === commandId)
  ) {
    throw new Error(`product command not found in catalog: ${commandId}`)
  }
  const guided = input === undefined
    ? await guidedCommandInput({ sessionOptions, commandId, readLine: options.readLine })
    : { kind: "completed" as const, input }
  if (guided.kind === "cancelled") {
    await handleGuidedCancellation(sessionOptions, state, guided)
    return
  }
  const result = await sessionOptions.surface.client.executeProductCommand({
    commandId,
    ...(guided.input === undefined ? {} : { input: guided.input })
  })
  const value = expectSurfaceValue(result, "executeProductCommand")
  state.executeCommandCount += 1
  if (value.kind === "rejected") {
    state.blockedCommandCount += 1
  } else {
    const snapshot = await sessionOptions.surface.refresh()
    if (snapshot.status.ok) {
      state.activeSessionId = snapshot.status.value.state.selectedSessionId
    }
  }
  await writeLine(sessionOptions, renderProductAppTuiCommandExecution(value).text)
}

async function guidedCommandInput(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly commandId: string
  readonly readLine: () => Promise<string | undefined>
}): Promise<Awaited<ReturnType<typeof collectProductAppTuiCommandInput>>> {
  const catalog = options.sessionOptions.surface.snapshot().commandCatalog
  if (!catalog.ok) return { kind: "completed", input: undefined }
  const command = catalog.value.commands.find((item) => item.id === options.commandId)
  if (command === undefined || command.inputSchema === undefined) {
    return { kind: "completed", input: undefined }
  }
  return await collectProductAppTuiCommandInput({
    command,
    readLine: options.readLine,
    async write(text) {
      await writeLine(options.sessionOptions, text)
    }
  })
}

async function handleGuidedCancellation(
  sessionOptions: ProductAppTuiLineSessionOptions,
  state: ProductAppTuiLineSessionState,
  result: { readonly kind: "cancelled"; readonly quit: boolean }
): Promise<void> {
  if (result.quit) {
    state.quit = true
    await writeLine(sessionOptions, "bye")
    return
  }
  await writeLine(sessionOptions, "guided input cancelled")
}

async function runEventsCommand(options: {
  readonly sessionOptions: ProductAppTuiLineSessionOptions
  readonly state: ProductAppTuiLineSessionState
  readonly limit?: number
}): Promise<void> {
  const { sessionOptions, state, limit } = options
  const result = await sessionOptions.surface.client.readSurfaceEvents(
    limit === undefined ? undefined : { limit }
  )
  state.eventsCommandCount += 1
  await writeLine(
    sessionOptions,
    renderProductAppTuiEvents({
      result,
      ...(limit === undefined ? {} : { limit })
    }).text
  )
}

function expectSurfaceValue<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly message: string } },
  command: string
): T {
  if (!result.ok) {
    throw new Error(`${command} failed: ${result.error.message}`)
  }
  return result.value
}

function expectSurfaceOk(
  result: { readonly ok: boolean; readonly error?: { readonly message: string } },
  command: string
): void {
  if (!result.ok) {
    throw new Error(`${command} failed: ${result.error?.message ?? "unknown error"}`)
  }
}
