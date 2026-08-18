import { runWanexAppAgentTurn } from "./agent.js"
import { submitWanexAppScheduledTick } from "./schedule.js"
import { queueWanexAppGuidedFollowUp } from "./workflow-guided-follow-up.js"
import { askWanexAppSideQuery } from "./workflow-side-query.js"
import { routeWanexAppWorkflowEnvelope } from "./workflow-envelope.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppAgentCommands } from "./types-agent.js"
import type { WanexAppCommands } from "./types-app.js"
import type { WanexAppScheduleCommands } from "./types-schedule.js"
import type { WanexAppWorkflowEnvelopeCommands } from "./types-workflow-envelope.js"
import type { WanexAppWorkflowCommands } from "./types-workflow.js"

export type WanexAppAgentCommandGroup = WanexAppAgentCommands &
  WanexAppScheduleCommands &
  WanexAppWorkflowCommands &
  WanexAppWorkflowEnvelopeCommands

export function createWanexAppAgentCommands(
  context: WanexAppCommandContext,
  getCommands: () => WanexAppCommands
): WanexAppAgentCommandGroup {
  return {
    async runAgentTurn(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      const preparedAgentContext = await context.extensions.prepareAgentContext(
        context.agentContext.current()
      )
      return await runWanexAppAgentTurn(context.conversationOperations, {
        request,
        modelEndpointId,
        ...(preparedAgentContext === undefined ? {} : { preparedAgentContext })
      })
    },
    async queueGuidedFollowUp(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      return await queueWanexAppGuidedFollowUp(
        context.runtime,
        context.conversationOperations,
        {
          request,
          modelEndpointId
        }
      )
    },
    async askSideQuery(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      if (
        request.expectedModelEndpointId !== undefined &&
        request.expectedModelEndpointId !== modelEndpointId
      ) {
        throw new Error(
          `active model endpoint changed: expected ${request.expectedModelEndpointId}, found ${modelEndpointId}`
        )
      }
      return await askWanexAppSideQuery(context.runtime, {
        request,
        modelEndpointId
      })
    },
    async submitScheduledTick(request) {
      context.assertActive()
      const modelEndpointId =
        request.modelEndpointId ?? await context.refreshActiveModelEndpointId()
      return await submitWanexAppScheduledTick(context.runtime, {
        request,
        modelEndpointId,
        conversationOperations: context.conversationOperations
      })
    },
    async routeWorkflowEnvelope(request) {
      context.assertActive()
      return await routeWanexAppWorkflowEnvelope(getCommands(), request)
    }
  }
}
