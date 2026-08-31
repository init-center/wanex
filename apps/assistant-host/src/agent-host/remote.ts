import { randomUUID } from "node:crypto";
import type { SurfaceAdapter } from "@wanex/assistant";
import type { AgentHostDescriptor } from "@wanex/protocol";
import {
  createRemoteAgentHostHttpClientTransport,
  createRemoteAgentHostHttpHandler,
  type RemoteAgentHostHttpClientEventStreamOptions,
  type RemoteAgentHostHttpClientOptions,
  type RemoteAgentHostHttpClientEventStreamState,
  type RemoteAgentHostHttpHandler,
  type RemoteAgentHostHandlerOptions,
  type RemoteHostAuthenticatedSubject,
  type RemoteHostGrant,
} from "@wanex/runtime/host";
import {
  createAssistantAgentHostClient,
  type AssistantAgentHostClient,
} from "./client.js";
import {
  createAssistantAgentHostEndpoint,
} from "./endpoint.js";
import type { AssistantAgentHostEndpointOptions } from "./model.js";

export interface RemoteAssistantHostResolution {
  readonly surface: SurfaceAdapter;
  readonly commands: AssistantAgentHostEndpointOptions["commands"];
  readonly host: AgentHostDescriptor;
  readonly grant: RemoteHostGrant;
}

export interface RemoteAssistantAgentHostHandlerOptions
  extends Omit<RemoteAgentHostHandlerOptions, "resolveHost"> {
  readonly resolveAssistantHost: (
    subject: RemoteHostAuthenticatedSubject,
  ) =>
    | RemoteAssistantHostResolution
    | null
    | Promise<RemoteAssistantHostResolution | null>;
}

export function createRemoteAssistantAgentHostHandler(
  options: RemoteAssistantAgentHostHandlerOptions,
): RemoteAgentHostHttpHandler {
  const { resolveAssistantHost, ...handlerOptions } = options;
  return createRemoteAgentHostHttpHandler({
    ...handlerOptions,
    resolveHost: async (subject) => {
      const resolved = await resolveAssistantHost(subject);
      if (resolved === null) return null;
      return {
        host: resolved.host,
        grant: resolved.grant,
        createEndpoint: (accessToken) =>
          createAssistantAgentHostEndpoint({
            surface: resolved.surface,
            commands: resolved.commands,
            host: resolved.host,
            accessToken,
          }),
      };
    },
  });
}

export interface RemoteAssistantAgentHostCompositionOptions
  extends Pick<
    RemoteAgentHostHttpClientOptions,
    "messageUrl" | "getBearerToken" | "fetch" | "limits" | "now"
  > {
  readonly clientId: string;
  readonly createRequestId?: () => string;
}

export type RemoteAssistantEventStreamState =
  RemoteAgentHostHttpClientEventStreamState;

export interface RemoteAssistantEventStreamOptions
  extends Omit<RemoteAgentHostHttpClientEventStreamOptions, "onReset"> {
  readonly onCanonicalReadRequired?: (
    reason: "gap" | "overflow" | "stream_replaced" | "unavailable",
  ) => void;
}

export interface RemoteAssistantEventStream {
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  close(): void;
}

export interface RemoteAssistantAgentHostComposition {
  readonly client: AssistantAgentHostClient;
  startEvents(options?: RemoteAssistantEventStreamOptions): RemoteAssistantEventStream;
  close(): Promise<void>;
}

export async function createRemoteAssistantAgentHostComposition(
  options: RemoteAssistantAgentHostCompositionOptions,
): Promise<RemoteAssistantAgentHostComposition> {
  const transport = createRemoteAgentHostHttpClientTransport({
    messageUrl: options.messageUrl,
    getBearerToken: options.getBearerToken,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const client = createAssistantAgentHostClient(transport, {
    clientId: options.clientId,
    // Remote Host authenticates with the bearer header and replaces this
    // endpoint-local value during server-side session admission.
    accessToken: randomUUID(),
    ...(options.createRequestId === undefined
      ? {}
      : { createRequestId: options.createRequestId }),
  });

  try {
    await client.connect();
  } catch (error) {
    client.close();
    await transport.close();
    throw error;
  }

  let closed = false;
  return Object.freeze({
    client,
    startEvents(eventOptions: RemoteAssistantEventStreamOptions = {}) {
      if (closed) throw new Error("remote Assistant Host composition is closed");
      const stream = transport.connectEvents({
        ...eventOptions,
        onReset: (reset) =>
          eventOptions.onCanonicalReadRequired?.(reset.reason),
      });
      return {
        ready: stream.ready,
        closed: stream.closed,
        close: () => stream.close(),
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      client.close();
      await transport.close();
    },
  });
}
