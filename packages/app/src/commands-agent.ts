import { runWanexAppShellAgentTurn } from "./agent.js"
import { submitWanexAppShellScheduledTick } from "./schedule.js"
import {
  queueWanexAppShellGuidedFollowUp
} from "./workflow-guided-follow-up.js"
import { askWanexAppShellSideQuery } from "./workflow-side-query.js"
import { routeWanexAppShellWorkflowEnvelope } from "./workflow-envelope.js"
import type { WanexAppShellCommandContext } from "./command-context.js"
import type { WanexAppShellAgentCommands } from "./types-agent.js"
import type { WanexAppShellCommands } from "./types-app.js"
import type { WanexAppShellScheduleCommands } from "./types-schedule.js"
import type { WanexAppShellWorkflowEnvelopeCommands } from "./types-workflow-envelope.js"
import type { WanexAppShellWorkflowCommands } from "./types-workflow.js"

export type WanexAppShellAgentCommandGroup =
  WanexAppShellAgentCommands &
    WanexAppShellScheduleCommands &
    WanexAppShellWorkflowCommands &
    WanexAppShellWorkflowEnvelopeCommands

export function createWanexAppShellAgentCommands(
  context: WanexAppShellCommandContext,
  getCommands: () => WanexAppShellCommands
): WanexAppShellAgentCommandGroup {
  return {
    async runAgentTurn(request) {
      context.assertActive()
      const providerProfileId = await context.refreshActiveProviderProfileId()
      const preparedAgentContext = await context.extensions.prepareAgentContext(
        context.agentContext.current()
      )
      return await runWanexAppShellAgentTurn(context.runtime, {
        request,
        providerProfileId,
        ...(preparedAgentContext === undefined
          ? {}
          : { preparedAgentContext })
      })
    },
    async queueGuidedFollowUp(request) {
      context.assertActive()
      const providerProfileId = await context.refreshActiveProviderProfileId()
      return await queueWanexAppShellGuidedFollowUp(context.runtime, {
        request,
        providerProfileId
      })
    },
    async askSideQuery(request) {
      context.assertActive()
      const providerProfileId = await context.refreshActiveProviderProfileId()
      return await askWanexAppShellSideQuery(context.runtime, {
        request,
        providerProfileId
      })
    },
    async submitScheduledTick(request) {
      context.assertActive()
      const providerProfileId = await context.refreshActiveProviderProfileId()
      return await submitWanexAppShellScheduledTick(context.runtime, {
        request,
        providerProfileId
      })
    },
    async routeWorkflowEnvelope(request) {
      context.assertActive()
      return await routeWanexAppShellWorkflowEnvelope(getCommands(), request)
    }
  }
}
