import type { WanexApp } from "@wanex/app"

export type BackendPlanCommands = Pick<
  WanexApp["commands"],
  | "generatePlanProposal"
  | "revisePlanProposal"
  | "approvePlanProposal"
  | "rejectPlanProposal"
  | "withdrawPlanProposal"
  | "executePlanProposal"
  | "readPlanProposal"
  | "listPlanProposals"
  | "readPlanProposalHistory"
>
