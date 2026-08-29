import type { SurfaceAdapter } from "@wanex/assistant";
import type { Shell } from "@wanex/assistant";
import type { AgentHostDescriptor } from "@wanex/protocol";
import type { InProcessAgentHostEndpoint } from "@wanex/runtime/host";

export const ASSISTANT_AGENT_HOST_OPERATIONS = {
  surfaceRead: "assistant.surface.read",
  conversationSubmit: "assistant.conversation.submit",
  conversationCancel: "assistant.conversation.cancel",
  conversationSteer: "assistant.conversation.steer",
  conversationApprovalResolve: "assistant.conversation.approval.resolve",
  conversationRecoveryResolve: "assistant.conversation.recovery.resolve",
} as const;

export type AssistantAgentHostOperation =
  (typeof ASSISTANT_AGENT_HOST_OPERATIONS)[keyof typeof ASSISTANT_AGENT_HOST_OPERATIONS];

export interface AssistantAgentHostEndpointOptions {
  readonly surface: SurfaceAdapter;
  readonly commands: Pick<
    Shell,
    | "submitConversationOperation"
    | "cancelTrackedConversationOperation"
    | "steerTrackedConversationOperation"
    | "resolveTrackedConversationApproval"
    | "resolveTrackedConversationRecovery"
  >;
  readonly host: AgentHostDescriptor;
  readonly accessToken: string;
}

export type AssistantAgentHostEndpoint = InProcessAgentHostEndpoint;
