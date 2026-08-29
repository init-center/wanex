import { createCodingAgentHostEndpoint } from "./endpoint.js";
import {
  createCodingAgentHostClient,
  type CodingAgentHostClient,
  type CodingAgentHostClientOptions,
} from "./client.js";
import type { CodingAgentHostEndpointOptions } from "./model.js";

export interface CodingAgentHostCompositionOptions
  extends CodingAgentHostEndpointOptions,
    CodingAgentHostClientOptions {}

export interface CodingAgentHostComposition {
  readonly client: CodingAgentHostClient;
  close(): void;
}

export async function createCodingAgentHostComposition(
  options: CodingAgentHostCompositionOptions,
): Promise<CodingAgentHostComposition> {
  const endpoint = createCodingAgentHostEndpoint(options);
  const client = createCodingAgentHostClient(endpoint, options);
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
