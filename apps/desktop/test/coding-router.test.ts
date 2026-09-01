import { describe, expect, it } from "vitest";
import type { CodingAgentHostClient } from "@wanex/coding/host";
import type { CodingCommandRequest, CodingProjectReadModel } from "@wanex/coding";
import type { RemoteConnectionProfile } from "../src/remote/profile.js";
import type {
  RemoteCodingConnection,
  RemoteCodingConnectionEvent,
  RemoteCodingConnectionManager,
} from "../src/remote/connection.js";
import {
  createDesktopCodingRouter,
  type DesktopCodingRouter,
} from "../src/coding/router.js";
import type { DesktopCodingComposition } from "../src/coding.js";

describe("Desktop Coding project router", () => {
  it("routes local selections to the local composition and advertises local apply", async () => {
    const calls: unknown[] = [];
    const router = createDesktopCodingRouter({
      local: fakeLocalComposition(calls),
      remoteConnections: fakeRemoteManager(),
    });

    await expect(router.openLocalProject("/private/repository")).resolves.toMatchObject({
      kind: "selected",
      location: { kind: "local" },
      capabilities: { proposalApply: true },
    });
    await router.send(command("project.list"));

    expect(calls).toEqual(["/private/repository", "project.list"]);
    await router.close();
  });

  it("lists and selects a remote server project without exposing the remote client", async () => {
    const remoteProject = project("server-repository");
    const remoteClient = fakeRemoteClient(remoteProject);
    const connection = fakeConnection(remoteClient);
    const router = createDesktopCodingRouter({
      local: fakeLocalComposition([]),
      remoteConnections: fakeRemoteManager(connection),
    });

    await expect(router.listRemoteProfiles()).resolves.toHaveLength(1);
    await expect(router.listRemoteProjects("office")).resolves.toEqual({
      profileId: "office",
      projects: [remoteProject],
    });
    await expect(router.openRemoteProject("office", remoteProject.projectId)).resolves.toMatchObject({
      kind: "selected",
      project: remoteProject,
      location: { kind: "remote", profileId: "office" },
      capabilities: { proposalApply: true },
    });

    const response = await router.send(command("project.read", {
      projectId: remoteProject.projectId,
    }));
    expect(response).toMatchObject({ ok: true, command: "project.read" });
    expect(JSON.stringify(response)).not.toContain("remote-client");
    await router.close();
  });

  it("forwards remote proposal apply to the server-owned Coding Host", async () => {
    const remoteProject = project("remote-apply");
    const router = createDesktopCodingRouter({
      local: fakeLocalComposition([]),
      remoteConnections: fakeRemoteManager(fakeConnection(fakeRemoteClient(remoteProject))),
    });
    await router.openRemoteProject("office", remoteProject.projectId);

    await expect(router.send(command("proposal.apply", {
      projectId: remoteProject.projectId,
      proposalId: "proposal-1",
    }))).resolves.toMatchObject({ ok: true, command: "proposal.apply" });
    await router.close();
  });

  it("projects a remote stream recovery signal to the active project only", async () => {
    const remoteProject = project("remote-events");
    const connection = fakeConnection(fakeRemoteClient(remoteProject));
    const router = createDesktopCodingRouter({
      local: fakeLocalComposition([]),
      remoteConnections: fakeRemoteManager(connection),
    });
    await router.openRemoteProject("office", remoteProject.projectId);
    const events: unknown[] = [];
    router.subscribe((event) => events.push(event));

    connection.publish({ kind: "canonical-read-required", reason: "gap" });
    expect(events).toEqual([{
      kind: "wanex.desktop.coding.canonical-read-required",
      projectId: remoteProject.projectId,
    }]);
    await router.close();
  });
});

function fakeLocalComposition(calls: unknown[]): DesktopCodingComposition {
  return {
    state: "open",
    openProject: async (path) => {
      calls.push(path);
      return project("local");
    },
    send: async (request) => {
      calls.push(request.command);
      return {
        protocol: "wanex.coding/1",
        kind: "response",
        requestId: request.requestId,
        command: request.command,
        ok: true,
        value: request.command === "project.list" ? [project("local")] : null,
      } as never;
    },
    subscribe: () => () => {},
    close: async () => {},
  };
}

function fakeRemoteManager(
  connection: RemoteCodingConnection = fakeConnection(fakeRemoteClient(project("remote"))),
): RemoteCodingConnectionManager {
  const profile: RemoteConnectionProfile = {
    profileId: "office",
    name: "Office",
    endpoint: "https://office.example.test/v1/agent-host/message",
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
  };
  return {
    listProfiles: async () => [profile],
    connect: async (profileId) => {
      if (profileId !== profile.profileId) throw new Error("profile unavailable");
      return connection;
    },
    get: () => connection,
    close: async () => {},
  };
}

function fakeConnection(client: CodingAgentHostClient): RemoteCodingConnection & {
  publish(event: RemoteCodingConnectionEvent): void;
} {
  const listeners = new Set<(event: RemoteCodingConnectionEvent) => void>();
  const profile: RemoteConnectionProfile = {
    profileId: "office",
    name: "Office",
    endpoint: "https://office.example.test/v1/agent-host/message",
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
  };
  return {
    profile,
    state: "connected",
    client,
    connect: async () => client,
    reconnectEvents: async () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {},
    publish: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
}

function fakeRemoteClient(remoteProject: CodingProjectReadModel): CodingAgentHostClient {
  return {
    connect: async () => ({}) as never,
    listProjects: async () => [remoteProject],
    readProject: async () => remoteProject,
    listSessions: async () => ({ sessions: [], returnedCount: 0, hasMore: false }),
    readSession: async () => null,
    readTranscript: async () => null,
    listTurns: async () => ({ turns: [], returnedCount: 0, hasMore: false }),
    readTurn: async () => null,
    readLiveTurn: async () => null,
    readProposal: async () => null,
    readEvents: async () => ({
      streamId: "stream",
      events: [],
      firstRetainedSequence: 1,
      lastSequence: 0,
      gap: false,
      hasMore: false,
    }),
    startTurn: async () => { throw new Error("not used"); },
    cancelTurn: async () => { throw new Error("not used"); },
    resolveTurnApproval: async () => { throw new Error("not used"); },
    resolveTurnRecovery: async () => { throw new Error("not used"); },
    decideProposal: async () => { throw new Error("not used"); },
    requestProposalApply: async () => { throw new Error("not used"); },
    applyProposal: async () => ({ status: "applied" } as never),
    undoProposal: async () => { throw new Error("not used"); },
    subscribe: () => () => {},
    replay: async () => ({ outcome: "gap", gap: {} } as never),
    close: () => {},
  };
}

function command(
  commandName: CodingCommandRequest["command"],
  input?: Record<string, unknown>,
): CodingCommandRequest {
  return {
    protocol: "wanex.coding/1",
    kind: "command",
    requestId: `request-${commandName}`,
    command: commandName,
    ...(input === undefined ? {} : { input }),
  } as CodingCommandRequest;
}

function project(name: string): CodingProjectReadModel {
  return {
    projectId: `project-${name}`,
    name,
    state: "ready",
    openedAt: 1,
    recovery: {
      transactionAttention: false,
      taskAttentionCount: 0,
      taskFailureCount: 0,
      moreTasksPending: false,
    },
  };
}
