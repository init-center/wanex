import { randomUUID } from "node:crypto";
import type { AgentHostDescriptor } from "@wanex/protocol";
import {
  createRemoteAgentHostHttpClientTransport,
  createRemoteAgentHostHttpHandler,
  type RemoteAgentHostHttpClientEventStreamOptions,
  type RemoteAgentHostHttpClientEventStreamState,
  type RemoteAgentHostHttpClientOptions,
  type RemoteAgentHostHttpHandler,
  type RemoteAgentHostHandshakeContext,
  type RemoteAgentHostHandlerOptions,
  type RemoteHostAuthenticatedSubject,
  type RemoteHostGrant,
} from "@wanex/runtime/host";
import type { CodingApplication } from "../../application/model.js";
import {
  createCodingAgentHostClient,
  type CodingAgentHostClient,
} from "./client.js";
import {
  createCodingAgentHostEndpoint,
} from "./endpoint.js";
import type { CodingAgentHostEndpointOptions } from "./model.js";

export interface RemoteCodingHostResolution {
  readonly application: CodingApplication;
  readonly host: AgentHostDescriptor;
  readonly grant: RemoteHostGrant;
}

export interface RemoteCodingAgentHostHandlerOptions
  extends Omit<RemoteAgentHostHandlerOptions, "resolveHost"> {
  readonly resolveCodingHost: (
    subject: RemoteHostAuthenticatedSubject,
    context: RemoteAgentHostHandshakeContext,
  ) =>
    | RemoteCodingHostResolution
    | null
    | Promise<RemoteCodingHostResolution | null>;
}

export function createRemoteCodingAgentHostHandler(
  options: RemoteCodingAgentHostHandlerOptions,
): RemoteAgentHostHttpHandler {
  const { resolveCodingHost, ...handlerOptions } = options;
  return createRemoteAgentHostHttpHandler({
    ...handlerOptions,
    resolveHost: async (subject, context) => {
      if (!isExactCodingDomain(context)) return null;
      const resolved = await resolveCodingHost(subject, context);
      if (resolved === null) return null;
      const endpointOptions: Omit<CodingAgentHostEndpointOptions, "accessToken"> = {
        application: resolved.application,
        host: resolved.host,
      };
      return {
        host: resolved.host,
        grant: resolved.grant,
        createEndpoint: (accessToken) =>
          createCodingAgentHostEndpoint({
            ...endpointOptions,
            accessToken,
          }),
      };
    },
  });
}

function isExactCodingDomain(
  context: RemoteAgentHostHandshakeContext,
): boolean {
  return context.requestedDomains.length === 1 &&
    context.requestedDomains[0] === "coding";
}

export interface RemoteCodingAgentHostCompositionOptions
  extends Pick<
    RemoteAgentHostHttpClientOptions,
    "messageUrl" | "getBearerToken" | "fetch" | "limits" | "now"
  > {
  readonly clientId: string;
  readonly createRequestId?: () => string;
}

export type RemoteCodingEventStreamState =
  RemoteAgentHostHttpClientEventStreamState;

export interface RemoteCodingEventStreamOptions
  extends Omit<RemoteAgentHostHttpClientEventStreamOptions, "onReset"> {
  readonly onCanonicalReadRequired?: (
    reason: "gap" | "overflow" | "stream_replaced" | "unavailable",
  ) => void;
}

export interface RemoteCodingEventStream {
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  close(): void;
}

export interface RemoteCodingAgentHostComposition {
  readonly client: CodingAgentHostClient;
  startEvents(options?: RemoteCodingEventStreamOptions): RemoteCodingEventStream;
  close(): Promise<void>;
}

export async function createRemoteCodingAgentHostComposition(
  options: RemoteCodingAgentHostCompositionOptions,
): Promise<RemoteCodingAgentHostComposition> {
  const transport = createRemoteAgentHostHttpClientTransport({
    messageUrl: options.messageUrl,
    getBearerToken: options.getBearerToken,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const client = createCodingAgentHostClient(transport, {
    clientId: options.clientId,
    // The remote transport authenticates with the bearer header. This value
    // is replaced by the server-side endpoint secret during admission.
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
    startEvents(eventOptions: RemoteCodingEventStreamOptions = {}) {
      if (closed) throw new Error("remote Coding Host composition is closed");
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
