import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppPlanCommands } from "./types-plan.js"

export function createWanexAppPlanCommands(
  context: WanexAppCommandContext
): WanexAppPlanCommands {
  return {
    async generatePlanProposal(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      return await context.planWorkflow.generateProposal({
        ...request,
        modelEndpointId
      })
    },
    async revisePlanProposal(request) {
      context.assertActive()
      return await context.planWorkflow.reviseProposal(request)
    },
    async approvePlanProposal(request) {
      context.assertActive()
      return await context.planWorkflow.approveProposal(request)
    },
    async rejectPlanProposal(request) {
      context.assertActive()
      return await context.planWorkflow.rejectProposal(request)
    },
    async withdrawPlanProposal(request) {
      context.assertActive()
      return await context.planWorkflow.withdrawProposal(request)
    },
    async executePlanProposal(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      return await context.planWorkflow.executeProposal({
        ...request,
        modelEndpointId
      })
    },
    async readPlanProposal(request) {
      context.assertActive()
      return await context.planWorkflow.getProposal(request.proposalId)
    },
    async listPlanProposals(request = {}) {
      context.assertActive()
      return await context.planWorkflow.listProposals(request)
    },
    async readPlanProposalHistory(request) {
      context.assertActive()
      return await context.planWorkflow.getHistory(request.proposalId)
    }
  }
}
