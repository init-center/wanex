import { randomUUID } from "node:crypto";
import {
  createRemoteAssistantAgentHostComposition,
  type AssistantAgentHostClient,
  type RemoteAssistantAgentHostComposition,
  type RemoteAssistantAgentHostCompositionOptions,
} from "@wanex/assistant-host";
import { REMOTE_AGENT_HOST_MESSAGE_PATH } from "@wanex/runtime/host/paths";
import type { DesktopServerProfile } from "./profile.js";
import type { DesktopServerProfileCatalog } from "./profile-catalog.js";

export type DesktopServerDomain = "assistant";

export type DesktopServerConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "closed";

export type DesktopServerCanonicalReadReason =
  | "gap"
  | "overflow"
  | "stream_replaced"
  | "unavailable";

export type DesktopServerConnectionEvent =
  | {
      readonly kind: "state-changed";
      readonly state: DesktopServerConnectionState;
    }
  | {
      readonly kind: "canonical-read-required";
      readonly reason: DesktopServerCanonicalReadReason;
    };

export interface DesktopServerDomainConnection<
  Domain extends DesktopServerDomain,
  Client,
> {
  readonly domain: Domain;
  readonly profile: DesktopServerProfile;
  readonly state: DesktopServerConnectionState;
  readonly client: Client | undefined;
  connect(): Promise<Client>;
  reconnectEvents(): Promise<void>;
  subscribe(listener: (event: DesktopServerConnectionEvent) => void): () => void;
  close(): Promise<void>;
}

export type DesktopServerAssistantConnection = DesktopServerDomainConnection<
  "assistant",
  AssistantAgentHostClient
>;

export interface DesktopServerConnectionManager {
  listProfiles(): Promise<readonly DesktopServerProfile[]>;
  connectAssistant(profileId: string): Promise<DesktopServerAssistantConnection>;
  getAssistant(profileId: string): DesktopServerAssistantConnection | undefined;
  closeProfile(profileId: string): Promise<void>;
  close(): Promise<void>;
}

export interface DesktopServerConnectionManagerOptions {
  readonly profiles: DesktopServerProfileCatalog;
  readonly clientId?: string;
  readonly createRequestId?: RemoteAssistantAgentHostCompositionOptions["createRequestId"];
  readonly fetch?: RemoteAssistantAgentHostCompositionOptions["fetch"];
  readonly limits?: RemoteAssistantAgentHostCompositionOptions["limits"];
  readonly now?: RemoteAssistantAgentHostCompositionOptions["now"];
  readonly createAssistantComposition?: typeof createRemoteAssistantAgentHostComposition;
}

interface DomainEventStream {
  readonly closed: Promise<void>;
  close(): void;
}

interface DomainEventOptions {
  readonly onStateChange?: (
    state: "connecting" | "open" | "reconnecting" | "closed",
  ) => void;
  readonly onCanonicalReadRequired?: (
    reason: DesktopServerCanonicalReadReason,
  ) => void;
}

interface DomainComposition<Client> {
  readonly client: Client;
  startEvents(options?: DomainEventOptions): DomainEventStream;
  close(): Promise<void>;
}

interface DomainConnectionOptions<
  Domain extends DesktopServerDomain,
  Client,
> {
  readonly domain: Domain;
  readonly profile: DesktopServerProfile;
  readonly profiles: DesktopServerProfileCatalog;
  readonly clientId: string;
  readonly createComposition: (options: {
    readonly messageUrl: string;
    readonly getBearerToken: () => Promise<string>;
    readonly clientId: string;
  }) => Promise<DomainComposition<Client>>;
}

interface DomainCollection<
  Domain extends DesktopServerDomain,
  Client,
> {
  readonly domain: Domain;
  readonly connections: Map<
    string,
    DesktopServerDomainConnection<Domain, Client>
  >;
  readonly pending: Map<
    string,
    Promise<DesktopServerDomainConnection<Domain, Client>>
  >;
  readonly createConnection: (
    profile: DesktopServerProfile,
  ) => DesktopServerDomainConnection<Domain, Client>;
}

export function createDesktopServerConnectionManager(
  options: DesktopServerConnectionManagerOptions,
): DesktopServerConnectionManager {
  const clientId = options.clientId ?? `wanex-desktop-${randomUUID()}`;
  const createAssistantComposition =
    options.createAssistantComposition ?? createRemoteAssistantAgentHostComposition;
  const assistant = collection<"assistant", AssistantAgentHostClient>({
    domain: "assistant",
    createConnection: (profile) => createDomainConnection({
      domain: "assistant",
      profile,
      profiles: options.profiles,
      clientId: `${clientId}.${profile.profileId}.assistant`,
      createComposition: async (request) =>
        await createAssistantComposition(sharedCompositionOptions(request)),
    }),
  });
  let closePromise: Promise<void> | undefined;
  let closed = false;

  const manager: DesktopServerConnectionManager = {
    listProfiles: async () => await options.profiles.list(),
    connectAssistant: async (profileId) => await connect(assistant, profileId),
    getAssistant: (profileId) => assistant.connections.get(profileId),
    async closeProfile(profileId) {
      await closeDomain(assistant, profileId);
    },
    async close() {
      if (closePromise !== undefined) return await closePromise;
      closed = true;
      closePromise = closeCollection(assistant).then(() => undefined);
      return await closePromise;
    },
  };
  return Object.freeze(manager);

  function sharedCompositionOptions(request: {
    readonly messageUrl: string;
    readonly getBearerToken: () => Promise<string>;
    readonly clientId: string;
  }): RemoteAssistantAgentHostCompositionOptions {
    return {
      ...request,
      ...(options.createRequestId === undefined
        ? {}
        : { createRequestId: options.createRequestId }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.limits === undefined ? {} : { limits: options.limits }),
      ...(options.now === undefined ? {} : { now: options.now }),
    };
  }

  async function connect<
    Domain extends DesktopServerDomain,
    Client,
  >(
    owner: DomainCollection<Domain, Client>,
    profileId: string,
  ): Promise<DesktopServerDomainConnection<Domain, Client>> {
    assertOpen();
    const current = owner.connections.get(profileId);
    if (current !== undefined) return current;
    const pending = owner.pending.get(profileId);
    if (pending !== undefined) return await pending;
    const operation = (async () => {
      const profile = await options.profiles.read(profileId);
      if (profile === null) throw new Error("server profile is unavailable");
      const connection = owner.createConnection(profile);
      try {
        await connection.connect();
        if (closed) {
          await connection.close();
          throw new Error("server connection manager is closed");
        }
        owner.connections.set(profileId, connection);
        return connection;
      } catch (error) {
        await connection.close().catch(() => {});
        throw error;
      }
    })();
    owner.pending.set(profileId, operation);
    try {
      return await operation;
    } finally {
      if (owner.pending.get(profileId) === operation) {
        owner.pending.delete(profileId);
      }
    }
  }

  async function closeDomain<
    Domain extends DesktopServerDomain,
    Client,
  >(
    owner: DomainCollection<Domain, Client>,
    profileId: string,
  ): Promise<void> {
    await owner.pending.get(profileId)?.catch(() => {});
    const connection = owner.connections.get(profileId);
    if (connection === undefined) return;
    owner.connections.delete(profileId);
    await connection.close();
  }

  async function closeCollection<
    Domain extends DesktopServerDomain,
    Client,
  >(owner: DomainCollection<Domain, Client>): Promise<void> {
    const active = [...owner.connections.values()];
    owner.connections.clear();
    const pending = [...owner.pending.values()];
    await Promise.all([
      ...active.map((connection) => connection.close()),
      ...pending.map((operation) => operation.catch(() => undefined)),
    ]);
    owner.pending.clear();
  }

  function assertOpen(): void {
    if (closed || closePromise !== undefined) {
      throw new Error("server connection manager is closed");
    }
  }
}

function collection<
  Domain extends DesktopServerDomain,
  Client,
>(options: {
  readonly domain: Domain;
  readonly createConnection: (
    profile: DesktopServerProfile,
  ) => DesktopServerDomainConnection<Domain, Client>;
}): DomainCollection<Domain, Client> {
  return {
    domain: options.domain,
    connections: new Map(),
    pending: new Map(),
    createConnection: options.createConnection,
  };
}

function createDomainConnection<
  Domain extends DesktopServerDomain,
  Client,
>(
  options: DomainConnectionOptions<Domain, Client>,
): DesktopServerDomainConnection<Domain, Client> {
  let state: DesktopServerConnectionState = "disconnected";
  let client: Client | undefined;
  let composition: DomainComposition<Client> | undefined;
  let eventStream: DomainEventStream | undefined;
  let connectPromise: Promise<Client> | undefined;
  let eventPromise: Promise<void> | undefined;
  let closePromise: Promise<void> | undefined;
  let closed = false;
  const listeners = new Set<(event: DesktopServerConnectionEvent) => void>();

  const connection: DesktopServerDomainConnection<Domain, Client> = {
    domain: options.domain,
    profile: options.profile,
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

  async function connect(): Promise<Client> {
    assertOpen();
    if (client !== undefined) return client;
    if (connectPromise !== undefined) return await connectPromise;
    setState("connecting");
    connectPromise = (async () => {
      const profile = await options.profiles.read(options.profile.profileId);
      if (profile === null) throw new Error("server profile is unavailable");
      const created = await options.createComposition({
        messageUrl: messageUrl(profile.serverUrl),
        getBearerToken: async () =>
          await readBearerToken(options.profiles, profile.profileId),
        clientId: options.clientId,
      });
      if (closed) {
        await created.close();
        throw new Error(`${options.domain} server connection is closed`);
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
      throw new Error(`${options.domain} server connection is not connected`);
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
      throw new Error(`${options.domain} server composition is unavailable`);
    }
    if (eventPromise !== undefined) return await eventPromise;
    eventPromise = Promise.resolve().then(() => {
      eventStream = composition!.startEvents({
        onStateChange: onEventStreamState,
        onCanonicalReadRequired: (reason) =>
          publish({ kind: "canonical-read-required", reason }),
      });
    });
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
      let closeError: unknown;
      await connectPromise?.catch(() => {});
      try {
        eventStream?.close();
        await eventStream?.closed.catch(() => {});
      } catch (error) {
        closeError = error;
      }
      try {
        await composition?.close();
      } catch (error) {
        closeError ??= error;
      } finally {
        eventStream = undefined;
        composition = undefined;
        client = undefined;
        listeners.clear();
      }
      if (closeError !== undefined) throw closeError;
    })();
    return await closePromise;
  }

  function onEventStreamState(
    next: "connecting" | "open" | "reconnecting" | "closed",
  ): void {
    if (closed) return;
    if (next === "open") setState("connected");
    else if (next === "reconnecting") setState("reconnecting");
    else if (next === "closed") setState("unavailable");
    else {
      setState(
        state === "disconnected" || state === "connecting"
          ? "connecting"
          : "reconnecting",
      );
    }
  }

  function assertOpen(): void {
    if (closed) throw new Error(`${options.domain} server connection is closed`);
  }

  function setState(next: DesktopServerConnectionState): void {
    if (state === next) return;
    state = next;
    publish({ kind: "state-changed", state: next });
  }

  function publish(event: DesktopServerConnectionEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // One product observer cannot affect the connection lifecycle.
      }
    }
  }
}

function messageUrl(serverUrl: string): string {
  return new URL(REMOTE_AGENT_HOST_MESSAGE_PATH, serverUrl).toString();
}

async function readBearerToken(
  profiles: DesktopServerProfileCatalog,
  profileId: string,
): Promise<string> {
  const secret = await profiles.resolveCredential(profileId);
  if (secret === null) throw new Error("server credential is unavailable");
  try {
    return secret.reveal();
  } finally {
    secret.dispose();
  }
}
