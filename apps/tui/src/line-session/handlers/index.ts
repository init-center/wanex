import { renderTuiCommandCatalog } from "../../presentation/command-catalog.js"
import { renderTuiFrame } from "../../presentation/frame.js"
import { writeLine } from "../output.js"
import { helpText } from "../text.js"
import type { TuiLineCommand } from "../parser/index.js"
import type { TuiLineSessionState } from "../state.js"
import type { TuiLineSessionOptions } from "../../model.js"
import {
  runEventsCommand,
  runExecuteCommand,
  runExecutionCommand,
  runPreviewCommand
} from "./commands.js"
import {
  runApprovalDecisionCommand,
  runAskCommand,
  runAttachCommand,
  runCancelCommand,
  runModelCommand,
  runOperationCommand,
  runRefreshCommand,
  runRegenerateCommand,
  runSelectCommand,
  runSteerCommand,
  runWorkbenchCommand
} from "./conversation.js"
import {
  runCancelGoalCommand,
  runCancelPlanGenerationCommand,
  runCancelSideQueryCommand,
  runChangeGoalStateCommand,
  runDismissPlanGenerationCommand,
  runDismissSideQueryCommand,
  runExecutePlanCommand,
  runPlanDecisionCommand,
  runPlanGenerationCommand,
  runReadGoalCommand,
  runShowPlanCommand,
  runSideQueryCommand,
  runStartGoalCommand
} from "./workflows.js"

export { reconcileTuiConversationInvalidation } from "./conversation.js"
export {
  reconcileTuiGoalInvalidation,
  reconcileTuiPlanInvalidation,
  reconcileTuiSideQueryInvalidation
} from "./workflows.js"

export async function executeTuiLineCommand(options: {
  readonly sessionOptions: TuiLineSessionOptions
  readonly state: TuiLineSessionState
  readonly command: Exclude<TuiLineCommand, { readonly kind: "error" }>
  readonly readLine: () => Promise<string | undefined>
}): Promise<void> {
  const { command, sessionOptions, state } = options
  switch (command.name) {
    case "help":
      await writeLine(sessionOptions, helpText())
      break
    case "overview":
      await writeLine(sessionOptions, renderTuiFrame(sessionOptions.surface.snapshot()).text)
      break
    case "commands":
      state.catalogCommandCount += 1
      await writeLine(
        sessionOptions,
        renderTuiCommandCatalog(sessionOptions.surface.snapshot().commandCatalog).text
      )
      break
    case "refresh":
      await runRefreshCommand(sessionOptions)
      break
    case "ask":
      await runAskCommand({ sessionOptions, state, text: command.text })
      break
    case "steer":
      await runSteerCommand({ sessionOptions, state, text: command.text })
      break
    case "btw":
      await runSideQueryCommand({
        sessionOptions,
        state,
        question: command.question
      })
      break
    case "btw-cancel":
      await runCancelSideQueryCommand({ sessionOptions, state })
      break
    case "btw-dismiss":
      await runDismissSideQueryCommand({ sessionOptions, state })
      break
    case "plan":
      await runPlanGenerationCommand({
        sessionOptions,
        state,
        text: command.text
      })
      break
    case "plan-show":
      await runShowPlanCommand({ sessionOptions, state })
      break
    case "plan-cancel":
      await runCancelPlanGenerationCommand({ sessionOptions, state })
      break
    case "plan-dismiss":
      await runDismissPlanGenerationCommand({ sessionOptions, state })
      break
    case "plan-approve":
      await runPlanDecisionCommand({
        sessionOptions,
        state,
        decision: "approve"
      })
      break
    case "plan-reject":
    case "plan-withdraw":
      await runPlanDecisionCommand({
        sessionOptions,
        state,
        decision: command.name === "plan-reject" ? "reject" : "withdraw",
        ...(command.reason === undefined ? {} : { reason: command.reason })
      })
      break
    case "plan-execute":
      await runExecutePlanCommand({ sessionOptions, state })
      break
    case "goal":
      await runReadGoalCommand({ sessionOptions, state })
      break
    case "goal-start":
      await runStartGoalCommand({
        sessionOptions,
        state,
        input: command.input
      })
      break
    case "goal-pause":
    case "goal-resume":
      await runChangeGoalStateCommand({
        sessionOptions,
        state,
        command: command.name,
        ...(command.reason === undefined ? {} : { reason: command.reason })
      })
      break
    case "goal-cancel":
      await runCancelGoalCommand({
        sessionOptions,
        state,
        reason: command.reason
      })
      break
    case "attach":
      await runAttachCommand({ sessionOptions, state, path: command.path })
      break
    case "select":
      await runSelectCommand({
        sessionOptions,
        state,
        sessionId: command.sessionId
      })
      break
    case "model":
      await runModelCommand({ sessionOptions, endpointId: command.endpointId })
      break
    case "workbench":
      await runWorkbenchCommand({
        sessionOptions,
        state,
        ...(command.sessionId === undefined
          ? {}
          : { sessionId: command.sessionId })
      })
      break
    case "operation":
      await runOperationCommand({
        sessionOptions,
        state,
        ...(command.sessionId === undefined
          ? {}
          : { sessionId: command.sessionId })
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
        ...(command.sessionId === undefined
          ? {}
          : { sessionId: command.sessionId })
      })
      break
    case "approval-approve":
    case "approval-deny":
      await runApprovalDecisionCommand({
        sessionOptions,
        state,
        approvalId: command.approvalId,
        decision:
          command.name === "approval-approve" ? "approve_once" : "deny",
        reason: command.reason
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
