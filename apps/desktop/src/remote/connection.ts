import { randomUUID } from "node:crypto";
import {
  createRemoteCodingAgentHostComposition,
  type CodingAgentHostClient,
  type RemoteCodingAgentHostComposition,
  type RemoteCodingAgentHostCompositionOptions,
  type RemoteCodingEventStream,
  type RemoteCodingEventStreamOptions,
  type RemoteCodingEventStreamState,
} from "@wanex/coding/host";
import type { RemoteConnectionProfile } from "./profile.js";
import type { RemoteConnectionProfileCatalog } from "./profiles.js";

export type RemoteCodingConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "closed";

export type RemoteCodingCanonicalReadReason =
  | "gap"
  | "overflow"
  | "stream_replaced"
  | "unavailable";

export type RemoteCodingConnectionEvent =
  | {
      readonly kind: "state-changed";
      readonly state: RemoteCodingConnectionState;
    }
  | {
      readonly kind: "canonical-read-required";
      readonly reason: RemoteCodingCanonicalReadReason;
    };

export interface RemoteCodingConnection {
  readonly profile: RemoteConnectionProfile;
  readonly state: RemoteCodingConnectionState;
  readonly client: CodingAgentHostClient | undefined;
  connect(): Promise<CodingAgentHostClient>;
  reconnectEvents(): Promise<void>;
  subscribe(listener: (event: RemoteCodingConnectionEvent) => void): () => void;
  close(): Promise<void>;
}

export interface RemoteCodingConnectionOptions {
  readonly profile: RemoteConnectionProfile;
  readonly profiles: RemoteConnectionProfileCatalog;
  readonly clientId?: string;
  readonly createRequestId?: RemoteCodingAgentHostCompositionOptions["createRequestId"];
  readonly fetch?: RemoteCodingAgentHostCompositionOptions["fetch"];
  readonly limits?: RemoteCodingAgentHostCompositionOptions["limits"];
  readonly now?: RemoteCodingAgentHostCompositionOptions["now"];
  readonly createComposition?: typeof createRemoteCodingAgentHostComposition;
}

export interface RemoteCodingConnectionManager {
  connect(profileId: string): Promise<RemoteCodingConnection>;
  get(profileId: string): RemoteCodingConnection | undefined;
  close(profileId?: string): Promise<void>;
}

export interface RemoteCodingConnectionManagerOptions {
  readonly profiles: RemoteConnectionProfileCatalog;
  readonly clientId?: string;
  readonly createRequestId?: RemoteCodingAgentHostCompositionOptions["createRequestId"];
  readonly fetch?: RemoteCodingAgentHostCompositionOptions["fetch"];
  readonly limits?: RemoteCodingAgentHostCompositionOptions["limits"];
  readonly now?: RemoteCodingAgentHostCompositionOptions["now"];
  readonly createComposition?: typeof createRemoteCodingAgentHostComposition;
}

export function createRemoteCodingConnection(
  options: RemoteCodingConnectionOptions,
): RemoteCodingConnection {
  const createComposition =
    options.createComposition ?? createRemoteCodingAgentHostComposition;
  const clientId = options.clientId ?? `wanex-desktop-${randomUUID()}`;
  let state: RemoteCodingConnectionState = "disconnected";
  let client: CodingAgentHostClient | undefined;
  let composition: RemoteCodingAgentHostComposition | undefined;
  let eventStream: RemoteCodingEventStream | undefined;
  let connectPromise: Promise<CodingAgentHostClient> | undefined;
  let eventPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let closed = false;
  const listeners = new Set<(event: RemoteCodingConnectionEvent) => void>();

  const connection: RemoteCodingConnection = {
    get profile() {
      return options.profile;
    },
    get state() {
      return state;
    },
    get client() {
      return client;
    },
    connect,
    reconnectEvents,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close,
  };

  return Object.freeze(connection);

  async function connect(): Promise<CodingAgentHostClient> {
    assertOpen();
    if (client !== undefined) return client;
    if (connectPromise !== undefined) return await connectPromise;
    setState("connecting");
    connectPromise = (async () => {
      const profile = await options.profiles.read(options.profile.profileId);
      if (profile === null) {
        throw new Error("remote Coding connection profile is unavailable");
      }
      const created = await createComposition({
        messageUrl: profile.endpoint,
        getBearerToken: async () => await readBearerToken(profile.profileId),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(options.limits === undefined ? {} : { limits: options.limits }),
        ...(options.now === undefined ? {} : { now: options.now }),
        clientId,
        ...(options.createRequestId === undefined
          ? {}
          : { createRequestId: options.createRequestId }),
      });
      if (closed) {
        await created.close();
        throw new Error("remote Coding connection is closed");
      }
      composition = created;
      client = created.client;
      try {
        await startEventStream();
        return client;
      } catch (error) {
        client = undefined;
        composition = undefined;
        await created.close().catch(() => {});
        throw error;
      }
    })();
    try {
      return await connectPromise;
    } catch (error) {
      if (!closed) setState("unavailable");
      throw error;
    } finally {
      connectPromise = undefined;
    }
  }

  async function reconnectEvents(): Promise<void> {
    assertOpen();
    if (composition === undefined) {
      throw new Error("remote Coding connection is not connected");
    }
    if (eventStream !== undefined) {
      eventStream.close();
      await eventStream.closed;
    }
    assertOpen();
    await startEventStream();
  }

  async function startEventStream(): Promise<void> {
    if (composition === undefined) {
      throw new Error("remote Coding connection composition is unavailable");
    }
    if (eventPromise !== undefined) return await eventPromise;
    eventPromise = (async () => {
      const stream = composition!.startEvents(eventStreamOptions());
      eventStream = stream;
    })();
    try {
      await eventPromise;
    } finally {
      eventPromise = undefined;
    }
  }

  async function close(): Promise<void> {
    if (closePromise !== undefined) return await closePromise;
    closed = true;
    setState("closed");
    closePromise = (async () => {
      await connectPromise?.catch(() => {});
      eventStream?.close();
      await eventStream?.closed.catch(() => {});
      await composition?.close();
      eventStream = undefined;
      composition = undefined;
      client = undefined;
      listeners.clear();
    })();
    return await closePromise;
  }

  function eventStreamOptions(): RemoteCodingEventStreamOptions {
    return {
      onStateChange: (next) => onEventStreamState(next),
      onCanonicalReadRequired: (reason) => {
        publish({ kind: "canonical-read-required", reason });
      },
    };
  }

  function onEventStreamState(next: RemoteCodingEventStreamState): void {
    if (closed) return;
    if (next === "open") {
      setState("connected");
    } else if (next === "reconnecting") {
      setState("reconnecting");
    } else if (next === "closed") {
      setState("unavailable");
    } else {
      setState(
        state === "disconnected" || state === "connecting"
          ? "connecting"
          : "reconnecting",
      );
    }
  }

  async function readBearerToken(profileId: string): Promise<string> {
    const secret = await options.profiles.resolveCredential(profileId);
    if (secret === null) {
      throw new Error("remote Coding connection credential is unavailable");
    }
    try {
      return secret.reveal();
    } finally {
      secret.dispose();
    }
  }

  function assertOpen(): void {
    if (closed) throw new Error("remote Coding connection is closed");
  }

  function setState(next: RemoteCodingConnectionState): void {
    if (state === next) return;
    state = next;
    publish({ kind: "state-changed", state: next });
  }

  function publish(event: RemoteCodingConnectionEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // One product observer cannot affect the connection lifecycle.
      }
    }
  }
}

export function createRemoteCodingConnectionManager(
  options: RemoteCodingConnectionManagerOptions,
): RemoteCodingConnectionManager {
  const connections = new Map<string, RemoteCodingConnection>();
  const pendingConnections = new Map<string, Promise<RemoteCodingConnection>>();
  let closePromise: Promise<void> | undefined;
  let closed = false;

  const manager: RemoteCodingConnectionManager = {
    async connect(profileId: string) {
      if (closed || closePromise !== undefined) {
        throw new Error("remote Coding connection manager is closed");
      }
      const current = connections.get(profileId);
      if (current !== undefined) return current;
      const pending = pendingConnections.get(profileId);
      if (pending !== undefined) return await pending;
      const operation = (async () => {
        const profile = await options.profiles.read(profileId);
        if (profile === null) {
          throw new Error("remote Coding connection profile is unavailable");
        }
        const connection = createRemoteCodingConnection({
          profile,
          profiles: options.profiles,
          ...(options.clientId === undefined
            ? {}
            : { clientId: `${options.clientId}.${profileId}` }),
          ...(options.createRequestId === undefined
            ? {}
            : { createRequestId: options.createRequestId }),
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
          ...(options.limits === undefined ? {} : { limits: options.limits }),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(options.createComposition === undefined
            ? {}
            : { createComposition: options.createComposition }),
        });
        try {
          await connection.connect();
          if (closed) {
            await connection.close();
            throw new Error("remote Coding connection manager is closed");
          }
          connections.set(profileId, connection);
          return connection;
        } catch (error) {
          await connection.close().catch(() => {});
          throw error;
        }
      })();
      pendingConnections.set(profileId, operation);
      try {
        return await operation;
      } finally {
        if (pendingConnections.get(profileId) === operation) {
          pendingConnections.delete(profileId);
        }
      }
    },
    get(profileId) {
      return connections.get(profileId);
    },
    async close(profileId?: string) {
      if (profileId !== undefined) {
        await pendingConnections.get(profileId)?.catch(() => {});
        const connection = connections.get(profileId);
        if (connection === undefined) return;
        connections.delete(profileId);
        await connection.close();
        return;
      }
      if (closePromise !== undefined) return await closePromise;
      closed = true;
      closePromise = (async () => {
        const active = [...connections.values()];
        connections.clear();
        const pending = [...pendingConnections.values()];
        await Promise.all([
          ...active.map((connection) => connection.close()),
          ...pending.map((operation) => operation.catch(() => undefined)),
        ]);
        pendingConnections.clear();
      })();
      return await closePromise;
    },
  };
  return Object.freeze(manager);
}
