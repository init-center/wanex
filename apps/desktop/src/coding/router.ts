import type {
  CodingCommandRequest,
  CodingCommandResponse,
  CodingEventEnvelope,
  CodingProjectReadModel,
} from "@wanex/coding";
import {
  CODING_TRANSPORT_PROTOCOL,
  isCodingEventEnvelope,
} from "@wanex/coding";
import type {
  DesktopCodingProjectCapabilities,
  DesktopCodingEvent,
  DesktopCodingProjectLocation,
  DesktopCodingProjectSelection,
  DesktopCodingRemoteProjectList,
} from "../coding-bridge.js";
import type { DesktopCodingComposition } from "../coding.js";
import type { RemoteConnectionProfile } from "../remote/profile.js";
import type {
  RemoteCodingConnectionManager,
  RemoteCodingConnection,
} from "../remote/connection.js";

const LOCAL_CAPABILITIES: DesktopCodingProjectCapabilities = Object.freeze({
  proposalApply: true,
});

const REMOTE_CAPABILITIES: DesktopCodingProjectCapabilities = Object.freeze({
  proposalApply: true,
});

export interface DesktopCodingRouter {
  openLocalProject(repositoryPath: string): Promise<DesktopCodingProjectSelection>;
  listRemoteProjects(profileId: string): Promise<DesktopCodingRemoteProjectList>;
  openRemoteProject(
    profileId: string,
    projectId: string,
  ): Promise<DesktopCodingProjectSelection>;
  listRemoteProfiles(): Promise<readonly RemoteConnectionProfile[]>;
  send(request: CodingCommandRequest): Promise<unknown>;
  subscribe(listener: (event: DesktopCodingEvent) => void): () => void;
  close(): Promise<void>;
}

export interface DesktopCodingRouterOptions {
  readonly local: DesktopCodingComposition;
  readonly remoteConnections: RemoteCodingConnectionManager;
}

type ActiveProject =
  | {
      readonly location: Extract<DesktopCodingProjectLocation, { kind: "local" }>;
      readonly projectId: string;
    }
  | {
      readonly location: Extract<DesktopCodingProjectLocation, { kind: "remote" }>;
      readonly projectId: string;
      readonly connection: RemoteCodingConnection;
      readonly client: NonNullable<RemoteCodingConnection["client"]>;
    };

export function createDesktopCodingRouter(
  options: DesktopCodingRouterOptions,
): DesktopCodingRouter {
  const listeners = new Set<(event: DesktopCodingEvent) => void>();
  let active: ActiveProject | undefined;
  let unsubscribeActive: (() => void) | undefined;
  let closePromise: Promise<void> | undefined;
  let closed = false;

  const router: DesktopCodingRouter = {
    openLocalProject,
    listRemoteProfiles: async () => {
      assertOpen();
      return await options.remoteConnections.listProfiles();
    },
    listRemoteProjects,
    openRemoteProject,
    send,
    subscribe(listener) {
      assertOpen();
      listeners.add(listener);
      if (listeners.size === 1) resubscribeActive();
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribeActive?.();
          unsubscribeActive = undefined;
        }
      };
    },
    async close() {
      if (closePromise !== undefined) return await closePromise;
      closed = true;
      unsubscribeActive?.();
      unsubscribeActive = undefined;
      active = undefined;
      listeners.clear();
      closePromise = Promise.resolve();
      return await closePromise;
    },
  };

  return Object.freeze(router);

  async function openLocalProject(
    repositoryPath: string,
  ): Promise<DesktopCodingProjectSelection> {
    assertOpen();
    const project = await options.local.openProject(repositoryPath);
    setActive({
      location: { kind: "local" },
      projectId: project.projectId,
    });
    return {
      kind: "selected",
      project,
      location: { kind: "local" },
      capabilities: LOCAL_CAPABILITIES,
    };
  }

  async function listRemoteProjects(
    profileId: string,
  ): Promise<DesktopCodingRemoteProjectList> {
    assertOpen();
    const connection = await options.remoteConnections.connect(profileId);
    const client = connection.client ?? (await connection.connect());
    return { profileId, projects: await client.listProjects() };
  }

  async function openRemoteProject(
    profileId: string,
    projectId: string,
  ): Promise<DesktopCodingProjectSelection> {
    assertOpen();
    const connection = await options.remoteConnections.connect(profileId);
    const client = connection.client ?? (await connection.connect());
    const projects = await client.listProjects();
    const project = projects.find((candidate) => candidate.projectId === projectId);
    if (project === undefined) {
      throw new Error("Remote Coding project is unavailable");
    }
    setActive({
      location: { kind: "remote", profileId },
      projectId,
      connection,
      client,
    });
    return {
      kind: "selected",
      project,
      location: { kind: "remote", profileId },
      capabilities: REMOTE_CAPABILITIES,
    };
  }

  async function send(request: CodingCommandRequest): Promise<unknown> {
    assertOpen();
    const target = active;
    if (target === undefined) {
      throw new Error("Coding project has not been selected");
    }
    const requestProjectId = projectIdFor(request);
    if (requestProjectId !== undefined && requestProjectId !== target.projectId) {
      return failure(request, "project_unavailable", "Coding project is not selected");
    }
    if (!("client" in target)) {
      return await options.local.send(request);
    }
    return await sendRemote(target.client, request);
  }

  function setActive(next: ActiveProject): void {
    assertOpen();
    active = next;
    resubscribeActive();
  }

  function resubscribeActive(): void {
    unsubscribeActive?.();
    unsubscribeActive = undefined;
    if (listeners.size === 0 || active === undefined) return;
    const selected = active;
    if (!("client" in selected)) {
      unsubscribeActive = options.local.subscribe((value) => {
        if (!isCodingEventEnvelope(value)) return;
        if (value.event.projectId !== selected.projectId) return;
        publish(value);
      });
      return;
    }
    const unsubscribeClient = selected.client.subscribe((event) => {
      if (event.payload.projectId !== selected.projectId) return;
      publish({
        protocol: CODING_TRANSPORT_PROTOCOL,
        kind: "event",
        event: event.payload,
      });
    });
    const unsubscribeConnection = selected.connection.subscribe((event) => {
      if (event.kind !== "canonical-read-required") return;
      publish({
        kind: "wanex.desktop.coding.canonical-read-required",
        projectId: selected.projectId,
      });
    });
    unsubscribeActive = () => {
      unsubscribeClient();
      unsubscribeConnection();
    };
  }

  function publish(event: DesktopCodingEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // One Desktop observer cannot affect the shared project route.
      }
    }
  }

  function assertOpen(): void {
    if (closed) throw new Error("Desktop Coding router is closed");
  }
}

async function sendRemote(
  client: NonNullable<RemoteCodingConnection["client"]>,
  request: CodingCommandRequest,
): Promise<CodingCommandResponse> {
  const input = request.input as Record<string, unknown> | undefined;
  switch (request.command) {
    case "project.list":
      return success(request, await client.listProjects());
    case "project.read":
      return success(request, await client.readProject(input as never));
    case "project.close":
      return unsupported(request, "Remote Coding project close is unavailable");
    case "session.list":
      return success(request, await client.listSessions(input as never));
    case "session.read":
      return success(request, await client.readSession(input as never));
    case "transcript.read":
      return success(request, await client.readTranscript(input as never));
    case "turn.list":
      return success(request, await client.listTurns(input as never));
    case "turn.start":
      return success(request, await client.startTurn(input as never));
    case "turn.read":
      return success(request, await client.readTurn(input as never));
    case "turn.live.read":
      return success(request, await client.readLiveTurn(input as never));
    case "turn.cancel":
      return success(
        request,
        await client.cancelTurn(withIdempotency(input, request.requestId) as never),
      );
    case "turn.approval.resolve":
      return success(
        request,
        await client.resolveTurnApproval(
          withoutRequestIdWithIdempotency(input, request.requestId) as never,
        ),
      );
    case "turn.recovery.resolve":
      return success(
        request,
        await client.resolveTurnRecovery(
          withoutRequestIdWithIdempotency(input, request.requestId) as never,
        ),
      );
    case "proposal.read":
      return success(request, await client.readProposal(input as never));
    case "proposal.decide":
      return success(
        request,
        await client.decideProposal(
          withoutRequestIdWithIdempotency(input, request.requestId) as never,
        ),
      );
    case "proposal.apply.request":
      return success(
        request,
        await client.requestProposalApply(
          withoutRequestIdWithIdempotency(input, request.requestId) as never,
        ),
      );
    case "proposal.apply":
      return success(
        request,
        await client.applyProposal({
          ...(input as { readonly projectId: string; readonly proposalId: string }),
          idempotencyKey: `desktop:${request.requestId}`,
        }),
      );
    case "proposal.undo":
      return success(
        request,
        await client.undoProposal(
          withoutRequestIdWithIdempotency(input, request.requestId) as never,
        ),
      );
    case "event.read":
      return success(request, await client.readEvents(input as never));
  }
}

function projectIdFor(request: CodingCommandRequest): string | undefined {
  if (request.command === "project.list" || request.command === "event.read") {
    return undefined;
  }
  return (request.input as { readonly projectId: string }).projectId;
}

function withIdempotency(
  input: Record<string, unknown> | undefined,
  requestId: string,
): Record<string, unknown> {
  return { ...(input ?? {}), idempotencyKey: `desktop:${requestId}` };
}

function withoutRequestIdWithIdempotency(
  input: Record<string, unknown> | undefined,
  requestId: string,
): Record<string, unknown> {
  const { requestId: _requestId, ...rest } = input ?? {};
  return { ...rest, idempotencyKey: `desktop:${requestId}` };
}

function success(
  request: CodingCommandRequest,
  value: unknown,
): CodingCommandResponse {
  return {
    protocol: CODING_TRANSPORT_PROTOCOL,
    kind: "response",
    requestId: request.requestId,
    command: request.command,
    ok: true,
    value,
  } as CodingCommandResponse;
}

function unsupported(
  request: CodingCommandRequest,
  message: string,
): CodingCommandResponse {
  return failure(request, "command_failed", message);
}

function failure(
  request: CodingCommandRequest,
  code: "command_failed" | "project_unavailable",
  message: string,
): CodingCommandResponse {
  return {
    protocol: CODING_TRANSPORT_PROTOCOL,
    kind: "response",
    requestId: request.requestId,
    command: request.command,
    ok: false,
    error: {
      code,
      category: "availability",
      message,
    },
  } as CodingCommandResponse;
}
