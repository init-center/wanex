import { renderTuiCommandExecution } from "../../presentation/command-execution.js"
import { renderTuiCommandPreview } from "../../presentation/command-preview.js"
import { renderTuiEvents } from "../../presentation/events.js"
import { renderTuiExecutionActivity } from "../../presentation/execution.js"
import { collectTuiCommandInput } from "../../input/guided.js"
import { writeLine } from "../output.js"
import type { TuiLineSessionState } from "../state.js"
import type { TuiLineSessionOptions } from "../../model.js"
import { selectedSessionId } from "../../selection.js"
import { expectSurfaceValue } from "./result.js"

export async function runExecutionCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly jobId: string
}): Promise<void> {
  const result =
    await options.sessionOptions.surface.client.readExecutionReference({
      kind: "job",
      id: options.jobId
    })
  const value = expectSurfaceValue(result, "readExecutionReference")
  options.state.executionCommandCount += 1
  await writeLine(
    options.sessionOptions,
    renderTuiExecutionActivity(value).text
  )
}

export async function runPreviewCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly commandId: string
  readonly input?: unknown
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { sessionOptions, state, commandId, input } = options
  const guided =
    input === undefined
      ? await guidedCommandInput({
          sessionOptions,
          commandId,
          readLine: options.readLine
        })
      : { kind: "completed" as const, input }
  if (guided.kind === "cancelled") {
    await handleGuidedCancellation(sessionOptions, state, guided)
    return
  }
  const result =
    await sessionOptions.surface.client.previewProductCommandInvocation({
      commandId,
      ...(guided.input === undefined ? {} : { input: guided.input })
    })
  state.previewCommandCount += 1
  const value = expectSurfaceValue(result, "previewProductCommandInvocation")
  await writeLine(sessionOptions, renderTuiCommandPreview(value))
}

export async function runExecuteCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
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
  const guided =
    input === undefined
      ? await guidedCommandInput({
          sessionOptions,
          commandId,
          readLine: options.readLine
        })
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
      state.activeSessionId = selectedSessionId(snapshot.status.value.state)
    }
  }
  await writeLine(
    sessionOptions,
    renderTuiCommandExecution(value).text
  )
}

async function guidedCommandInput(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly commandId: string
  readonly readLine: () => Promise<string | undefined>
}): Promise<Awaited<ReturnType<typeof collectTuiCommandInput>>> {
  const catalog = options.sessionOptions.surface.snapshot().commandCatalog
  if (!catalog.ok) return { kind: "completed", input: undefined }
  const command = catalog.value.commands.find(
    (item) => item.id === options.commandId
  )
  if (command === undefined || command.inputSchema === undefined) {
    return { kind: "completed", input: undefined }
  }
  return await collectTuiCommandInput({
    command,
    readLine: options.readLine,
    async write(text) {
      await writeLine(options.sessionOptions, text)
    }
  })
}

async function handleGuidedCancellation(
  sessionOptions: TuiLineSessionOptions,
  state: TuiLineSessionState,
  result: { readonly kind: "cancelled"; readonly quit: boolean }
): Promise<void> {
  if (result.quit) {
    state.quit = true
    await writeLine(sessionOptions, "bye")
    return
  }
  await writeLine(sessionOptions, "guided input cancelled")
}

export async function runEventsCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly limit?: number
}): Promise<void> {
  const { sessionOptions, state, limit } = options
  const result = await sessionOptions.surface.client.readSurfaceEvents(
    limit === undefined ? undefined : { limit }
  )
  state.eventsCommandCount += 1
  await writeLine(
    sessionOptions,
    renderTuiEvents({
      result,
      ...(limit === undefined ? {} : { limit })
    }).text
  )
}
