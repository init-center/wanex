import type { SurfaceAdapter } from "@wanex/assistant";
import type { AgentHostDescriptor } from "@wanex/protocol";
import type { InProcessAgentHostEndpoint } from "@wanex/runtime/host";
import type { ResourceDeliveryPort } from "../resources/model.js";

export const ASSISTANT_AGENT_HOST_OPERATIONS = {
  surfaceDescriptor: "assistant.surface.descriptor",
  surfaceDispatch: "assistant.surface.dispatch",
  surfaceEventsRead: "assistant.surface.events.read",
  resourceDeliveryPrepare: "assistant.resource-delivery.prepare",
  resourceDeliveryRevoke: "assistant.resource-delivery.revoke",
} as const;

export const REMOTE_ASSISTANT_RESOURCE_DELIVERY_PATH =
  "/v1/assistant/resource" as const;
export const REMOTE_ASSISTANT_RESOURCE_GRANT_HEADER =
  "x-wanex-resource-grant" as const;
export const REMOTE_ASSISTANT_ATTACHMENT_UPLOAD_PATH =
  "/v1/assistant/attachment" as const;

export type AssistantAgentHostOperation =
  (typeof ASSISTANT_AGENT_HOST_OPERATIONS)[keyof typeof ASSISTANT_AGENT_HOST_OPERATIONS];

export interface AssistantAgentHostEndpointOptions {
  readonly surface: SurfaceAdapter;
  readonly host: AgentHostDescriptor;
  readonly accessToken: string;
  readonly resourceDeliveries?: ResourceDeliveryPort;
  readonly resourceDeliveryAudience?: string;
}

export type AssistantAgentHostEndpoint = InProcessAgentHostEndpoint;
