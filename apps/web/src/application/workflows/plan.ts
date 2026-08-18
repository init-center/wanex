import type { SurfaceClient } from "@wanex/product/surface"
import type {
  PlanSourceResult,
  PlanViewModel
} from "../model.js"

export function idlePlan(): PlanViewModel {
  return {
    kind: "web.plan",
    proposal: { kind: "product.plan-proposal.no-selection" }
  }
}

export function projectPlanFromResult(
  result: PlanSourceResult,
  previous: PlanViewModel
): PlanViewModel {
  if (result.kind === "product.plan-generation") {
    return { ...previous, generation: result }
  }
  if (result.kind === "product.plan-generation.found") {
    return { ...previous, generation: result.generation }
  }
  if (result.kind === "product.plan-generation.missing") {
    const { generation: _discarded, ...rest } = previous
    return rest
  }
  if (result.kind === "product.plan-execution.submitted") {
    return {
      ...previous,
      proposal: {
        kind: "product.plan-proposal.found",
        proposal: result.proposal
      }
    }
  }
  return { ...previous, proposal: result }
}

export async function reconcilePlan(request: {
  readonly client: SurfaceClient
  readonly previous: PlanViewModel
}): Promise<PlanViewModel> {
  let plan = request.previous
  const operationId = plan.generation?.operationId
  if (operationId !== undefined) {
    const generation = await request.client.readPlanGeneration({ operationId })
    if (generation.ok) {
      plan = projectPlanFromResult(generation.value, plan)
    }
  }
  const explicitProposalId =
    plan.generation?.state === "succeeded"
      ? plan.generation.proposalId
      : plan.proposal.kind === "product.plan-proposal.found"
        ? plan.proposal.proposal.proposalId
        : undefined
  const proposal = await request.client.readPlanProposal(
    explicitProposalId === undefined
      ? undefined
      : { proposalId: explicitProposalId }
  )
  return proposal.ok ? projectPlanFromResult(proposal.value, plan) : plan
}
