import { renderTuiFrame } from "../presentation/frame.js"
import {
  createTuiLineSessionState,
  tuiLineSessionResult
} from "./state.js"
import { writeLine } from "./output.js"
import { parseTuiLineCommand } from "./parser/index.js"
import {
  executeTuiLineCommand,
  reconcileTuiConversationInvalidation,
  reconcileTuiGoalInvalidation,
  reconcileTuiPlanInvalidation,
  reconcileTuiSideQueryInvalidation
} from "./handlers/index.js"
import { safeErrorMessage } from "./text.js"
import type {
  TuiLineSessionOptions,
  TuiLineSessionResult
} from "../model.js"

export async function runTuiLineSession(
  options: TuiLineSessionOptions
): Promise<TuiLineSessionResult> {
  const state = createTuiLineSessionState(options.surface)
  const iterator = options.input[Symbol.asyncIterator]()
  let notificationTail = Promise.resolve()
  const unsubscribe = options.surface.client.subscribeSurfaceEvents((event) => {
    const notification =
      event.type === "product.surface.conversation.operation-invalidated" &&
      event.conversation?.kind ===
        "product.conversation.operation-invalidated"
        ? async () =>
            await reconcileTuiConversationInvalidation({
              sessionOptions: options,
              state,
              operationId: event.conversation!.operationId,
              sessionId: event.conversation!.sessionId
            })
        : event.type === "product.surface.side-query.invalidated" &&
      event.sideQuery !== undefined
        ? async () =>
            await reconcileTuiSideQueryInvalidation({
              sessionOptions: options,
              state,
              queryId: event.sideQuery!.queryId
            })
        : event.type === "product.surface.plan.invalidated" &&
            event.plan !== undefined
          ? async () =>
              await reconcileTuiPlanInvalidation({
                sessionOptions: options,
                state,
                ...(event.plan!.operationId === undefined
                  ? {}
                  : { operationId: event.plan!.operationId }),
                ...(event.plan!.proposalId === undefined
                  ? {}
                  : { proposalId: event.plan!.proposalId })
              })
          : event.type === "product.surface.goal.invalidated" &&
              event.goal !== undefined
            ? async () =>
                await reconcileTuiGoalInvalidation({
                  sessionOptions: options,
                  state,
                  goalId: event.goal!.goalId,
                  sessionId: event.goal!.sessionId
                })
            : event.type ===
                "product.surface.command-catalog.invalidated"
              ? async () => {
                  await options.surface.refresh()
                }
              : undefined
    if (notification === undefined) return
    notificationTail = notificationTail
      .then(notification)
      .catch(async (error) => {
        state.errorCount += 1
        await writeLine(options, `error: ${safeErrorMessage(error)}`)
      })
  })

  try {
    await writeLine(
      options,
      renderTuiFrame(
        options.surface.snapshot()
      ).text
    )
    await writeLine(options, "Type help for commands.")

    for (;;) {
      const next = await iterator.next()
      if (next.done) break
      const rawLine = next.value
      const line = rawLine.trim()
      if (line.length === 0) {
        continue
      }
      state.handledLineCount += 1
      const parsed = parseTuiLineCommand(line)
      if (parsed.kind === "error") {
        state.errorCount += 1
        await writeLine(options, `error: ${parsed.message}`)
        continue
      }
      state.commandCount += 1
      try {
        await executeTuiLineCommand({
          sessionOptions: options,
          state,
          command: parsed,
          readLine: async () => {
            const nextInput = await iterator.next()
            return nextInput.done ? undefined : nextInput.value
          }
        })
        if (state.quit) break
      } catch (error) {
        state.errorCount += 1
        await writeLine(options, `error: ${safeErrorMessage(error)}`)
      }
    }
  } finally {
    unsubscribe()
    await notificationTail
  }

  return tuiLineSessionResult(state)
}
