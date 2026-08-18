import type {
  PlanGenerationReadModel,
  ReadPlanProposalResult
} from "@wanex/product/surface"
import { singleLine } from "../line-session/text.js"

export function renderTuiPlanGeneration(
  generation: PlanGenerationReadModel
): string {
  return [
    "PLAN GENERATION",
    `state:${generation.state} | session:${generation.sessionId}`,
    `operation:${generation.operationId}`,
    ...(generation.proposalId === undefined
      ? []
      : [`proposal:${generation.proposalId}`]),
    ...(generation.error === undefined
      ? []
      : [`error:${singleLine(generation.error.message)}`])
  ].join("\n")
}

export function renderTuiPlanProposal(
  result: ReadPlanProposalResult
): string {
  if (result.kind === "product.plan-proposal.no-selection") {
    return "PLAN\nstate:no-selection"
  }
  if (result.kind === "product.plan-proposal.missing") {
    return `PLAN\nstate:missing | proposal:${result.proposalId}`
  }
  const proposal = result.proposal
  return [
    "PLAN",
    `state:${proposal.state} | revision:${proposal.revision}`,
    `proposal:${proposal.proposalId} | session:${proposal.source.sessionId}`,
    `title:${singleLine(proposal.title)}`,
    `summary:${singleLine(proposal.summary)}`,
    ...proposal.steps.map(
      (step, index) =>
        `${index + 1}. [${step.id}] ${singleLine(step.title)}${step.detail === undefined ? "" : ` | ${singleLine(step.detail)}`}`
    ),
    ...(proposal.execution === undefined
      ? []
      : [`execution:${proposal.execution.jobId} | ${proposal.execution.jobState}`])
  ].join("\n")
}
