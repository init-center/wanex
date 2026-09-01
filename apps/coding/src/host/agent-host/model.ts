import type { AgentHostDescriptor } from "@wanex/protocol";
import type { InProcessAgentHostEndpoint } from "@wanex/runtime/host";
import type { CodingApplication } from "../../application/model.js";

export const CODING_AGENT_HOST_OPERATIONS = {
  read: "coding.read",
  turnStart: "coding.turn.start",
  turnCancel: "coding.turn.cancel",
  turnApprovalResolve: "coding.turn.approval.resolve",
  turnRecoveryResolve: "coding.turn.recovery.resolve",
  proposalDecide: "coding.proposal.decide",
  proposalApplyRequest: "coding.proposal.apply.request",
  proposalApply: "coding.proposal.apply",
  proposalUndo: "coding.proposal.undo",
} as const;

export type CodingAgentHostOperation =
  (typeof CODING_AGENT_HOST_OPERATIONS)[keyof typeof CODING_AGENT_HOST_OPERATIONS];

export interface CodingAgentHostEndpointOptions {
  readonly application: CodingApplication;
  readonly host: AgentHostDescriptor;
  readonly accessToken: string;
}

export type CodingAgentHostEndpoint = InProcessAgentHostEndpoint;
