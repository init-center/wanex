import { createAssistantAgentHostEndpoint } from "./endpoint.js";
import {
  createAssistantAgentHostClient,
  type AssistantAgentHostClient,
  type AssistantAgentHostClientOptions,
} from "./client.js";
import type { AssistantAgentHostEndpointOptions } from "./model.js";

export interface AssistantAgentHostCompositionOptions
  extends AssistantAgentHostEndpointOptions,
    AssistantAgentHostClientOptions {}

export interface AssistantAgentHostComposition {
  readonly client: AssistantAgentHostClient;
  close(): void;
}

export async function createAssistantAgentHostComposition(
  options: AssistantAgentHostCompositionOptions,
): Promise<AssistantAgentHostComposition> {
  const endpoint = createAssistantAgentHostEndpoint(options);
  const client = createAssistantAgentHostClient(endpoint, options);
  try {
    await client.connect();
  } catch (error) {
    client.close();
    endpoint.close();
    throw error;
  }

  let closed = false;
  return Object.freeze({
    client,
    close() {
      if (closed) return;
      closed = true;
      client.close();
      endpoint.close();
    },
  });
}
