import { describe, expect, it } from "vitest";
import type {
  CodingApplicationEvent,
  CodingProjectReadModel,
  CodingSessionReadModel,
  CodingSessionPage,
  CodingTranscriptPage,
  CodingTurnReadModel,
} from "@wanex/coding";
import {
  CodingWorkbenchController,
  type CodingWorkbenchClient,
} from "../src/renderer/coding/controller.js";

describe("Desktop Coding Renderer controller", () => {
  it("keeps a newer canonical read when an older read settles later", async () => {
    const reads: Array<Deferred<CodingProjectReadModel | null>> = [];
    const stale = project("stale");
    const fresh = project("fresh");
    const controller = new CodingWorkbenchController(
      fakeClient({
        selectProject: async () => ({
          kind: "selected",
          project: project("selected"),
        }),
        readProject: async () => {
          const read = deferred<CodingProjectReadModel | null>();
          reads.push(read);
          return await read.promise;
        },
      }),
    );

    const opening = controller.openProject();
    await Promise.resolve();
    expect(reads).toHaveLength(1);

    const newerRefresh = controller.refresh();
    expect(reads).toHaveLength(2);
    reads[1]?.resolve(fresh);
    await newerRefresh;

    reads[0]?.resolve(stale);
    await opening;

    expect(controller.state.status).toBe("ready");
    expect(controller.state.project?.name).toBe("fresh");
    controller.dispose();
  });

  it("rereads canonical state after an event for the selected project", async () => {
    let publish: ((event: CodingApplicationEvent) => void) | undefined;
    let projectReads = 0;
    const controller = new CodingWorkbenchController(
      fakeClient({
        subscribe: (listener) => {
          publish = listener;
          return () => {
            publish = undefined;
          };
        },
        readProject: async () => {
          projectReads += 1;
          return project("repository");
        },
      }),
    );

    controller.start();
    await controller.openProject();
    expect(projectReads).toBe(1);

    publish?.({
      kind: "project_invalidated",
      projectId: "other-project",
      reason: "project_opened",
      streamId: "coding-events",
      sequence: 1,
      occurredAt: 1,
    });
    await settleEventRefresh();
    expect(projectReads).toBe(1);

    publish?.({
      kind: "project_invalidated",
      projectId: "project-repository",
      reason: "turn_progress",
      streamId: "coding-events",
      sequence: 2,
      occurredAt: 2,
    });
    await settleEventRefresh();
    expect(projectReads).toBe(2);
    expect(controller.state.project?.name).toBe("repository");

    controller.dispose();
  });

  it("keeps the current project when switching projects is cancelled", async () => {
    let selectCount = 0;
    const current = project("current");
    const controller = new CodingWorkbenchController(
      fakeClient({
        selectProject: async () => {
          selectCount += 1;
          return selectCount === 1
            ? { kind: "selected", project: current }
            : { kind: "cancelled" };
        },
        readProject: async () => current,
      }),
    );

    await controller.openProject();
    const beforeCancel = controller.state;
    await controller.openProject();

    expect(controller.state).toBe(beforeCancel);
    expect(controller.state.project?.projectId).toBe(current.projectId);
    expect(controller.state.status).toBe("ready");
    controller.dispose();
  });

  it("ignores a project selection that finishes after disposal", async () => {
    const selection = deferred<
      Awaited<ReturnType<CodingWorkbenchClient["selectProject"]>>
    >();
    const controller = new CodingWorkbenchController(
      fakeClient({ selectProject: async () => await selection.promise }),
    );
    const opening = controller.openProject();
    await Promise.resolve();

    controller.dispose();
    selection.resolve({ kind: "selected", project: project("late") });
    await opening;

    expect(controller.state.project).toBeUndefined();
    expect(controller.state.status).toBe("loading");
  });

  it("reuses a failed Turn admission key for the same draft", async () => {
    const projectRead = project("admission-retry");
    const session = sessionReadModel(projectRead.projectId);
    const requests: Array<{ readonly idempotencyKey: string }> = [];
    let attempts = 0;
    const admittedTurn = turnReadModel(projectRead.projectId, session.sessionId, false);
    const controller = new CodingWorkbenchController(
      fakeClient({
        readProject: async () => projectRead,
        listSessions: async () => ({ sessions: [session], returnedCount: 1, hasMore: false }),
        readSession: async () => session,
        readTranscript: async () => transcript(projectRead.projectId, session.sessionId),
        listTurns: async () => ({ turns: [], returnedCount: 0, hasMore: false }),
        startTurn: async (request) => {
          requests.push({ idempotencyKey: request.idempotencyKey });
          attempts += 1;
          if (attempts === 1) throw new Error("connection lost after admission");
          return admittedTurn;
        },
      }),
    );

    await controller.openProject();
    await expect(controller.startTurn("same logical task")).resolves.toBe(false);
    await expect(controller.startTurn("same logical task")).resolves.toBe(true);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.idempotencyKey).toBe(requests[1]?.idempotencyKey);
    controller.dispose();
  });

  it("sends a digested verified result and refreshes after recovery resolution", async () => {
    const projectRead = project("recovery");
    const session = sessionReadModel(projectRead.projectId);
    const recoveryTurn = turnReadModel(projectRead.projectId, session.sessionId, true);
    const settledTurn = turnReadModel(projectRead.projectId, session.sessionId, false);
    let settled = false;
    let recoveryRequest: unknown;
    const controller = new CodingWorkbenchController(
      fakeClient({
        readProject: async () => projectRead,
        listSessions: async () => ({ sessions: [session], returnedCount: 1, hasMore: false }),
        readSession: async () => session,
        readTranscript: async () => transcript(projectRead.projectId, session.sessionId),
        listTurns: async () => settled
          ? { turns: [settledTurn], returnedCount: 1, hasMore: false }
          : { turns: [recoveryTurn], returnedCount: 1, hasMore: false },
        resolveTurnRecovery: async (request) => {
          recoveryRequest = request;
          settled = true;
          return settledTurn;
        },
      }),
    );

    await controller.openProject();
    const item = recoveryTurn.recovery.items[0];
    if (item === undefined) throw new Error("recovery fixture item is missing");
    await controller.resolveRecovery(item, "confirm_succeeded", "verified by operator");

    expect(recoveryRequest).toMatchObject({
      projectId: projectRead.projectId,
      turnId: recoveryTurn.turnId,
      executionId: item.executionId,
      expectedRecoveryRevision: item.recoveryRevision,
      decision: "confirm_succeeded",
      content: [{ type: "text", text: "verified by operator" }],
    });
    const request = recoveryRequest as { readonly contentDigest: string };
    expect(request.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(controller.state.turn?.recovery.totalCount).toBe(0);
    controller.dispose();
  });

  it("does not attach result data to retry or abandon decisions", async () => {
    const projectRead = project("recovery-actions");
    const session = sessionReadModel(projectRead.projectId);
    const recoveryTurn = turnReadModel(projectRead.projectId, session.sessionId, true);
    const requests: unknown[] = [];
    const controller = new CodingWorkbenchController(
      fakeClient({
        readProject: async () => projectRead,
        listSessions: async () => ({ sessions: [session], returnedCount: 1, hasMore: false }),
        readSession: async () => session,
        readTranscript: async () => transcript(projectRead.projectId, session.sessionId),
        listTurns: async () => ({ turns: [recoveryTurn], returnedCount: 1, hasMore: false }),
        resolveTurnRecovery: async (request) => {
          requests.push(request);
          return recoveryTurn;
        },
      }),
    );

    await controller.openProject();
    const item = recoveryTurn.recovery.items[0];
    if (item === undefined) throw new Error("recovery fixture item is missing");
    await controller.resolveRecovery(item, "retry");
    await controller.resolveRecovery(item, "abandon_turn");

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ decision: "retry" });
    expect(requests[1]).toMatchObject({ decision: "abandon_turn" });
    expect(requests[0]).not.toHaveProperty("content");
    expect(requests[0]).not.toHaveProperty("contentDigest");
    expect(requests[1]).not.toHaveProperty("content");
    expect(requests[1]).not.toHaveProperty("contentDigest");
    controller.dispose();
  });
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function fakeClient(options: {
  readonly selectProject?: CodingWorkbenchClient["selectProject"];
  readonly readProject?: CodingWorkbenchClient["readProject"];
  readonly listSessions?: CodingWorkbenchClient["listSessions"];
  readonly readSession?: CodingWorkbenchClient["readSession"];
  readonly readTranscript?: CodingWorkbenchClient["readTranscript"];
  readonly listTurns?: CodingWorkbenchClient["listTurns"];
  readonly startTurn?: CodingWorkbenchClient["startTurn"];
  readonly resolveTurnRecovery?: CodingWorkbenchClient["resolveTurnRecovery"];
  readonly subscribe?: CodingWorkbenchClient["subscribe"];
} = {}): CodingWorkbenchClient {
  const sessions: CodingSessionPage = {
    sessions: [],
    returnedCount: 0,
    hasMore: false,
  };
  return {
    selectProject: options.selectProject ?? (async () => ({
      kind: "selected",
      project: project("repository"),
    })),
    readProject: options.readProject ?? (async () => project("repository")),
    listSessions: options.listSessions ?? (async () => sessions),
    readSession: options.readSession ?? (async () => null),
    readTranscript: options.readTranscript ?? (async () => null),
    listTurns: options.listTurns ?? (async () => ({ turns: [], returnedCount: 0, hasMore: false })),
    readLiveTurn: async () => null,
    startTurn: options.startTurn ?? (async () => { throw new Error("not used"); }),
    readProposal: async () => null,
    resolveTurnRecovery: options.resolveTurnRecovery ?? (async () => { throw new Error("not used"); }),
    subscribe: options.subscribe ?? (() => () => {}),
  } as unknown as CodingWorkbenchClient;
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

function sessionReadModel(projectId: string): CodingSessionReadModel {
  return {
    projectId,
    sessionId: "session-recovery",
    title: "Recovery session",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  };
}

function transcript(projectId: string, sessionId: string): CodingTranscriptPage {
  return {
    projectId,
    sessionId,
    messages: [],
    returnedCount: 0,
    hasMore: false,
    contentTruncated: false,
    omittedPartCount: 0,
  };
}

function turnReadModel(
  projectId: string,
  sessionId: string,
  pending: boolean,
): CodingTurnReadModel {
  return {
    projectId,
    sessionId,
    turnId: pending ? "turn-recovery" : "turn-settled",
    state: pending ? "recovery_required" : "succeeded",
    createdAt: 1,
    updatedAt: 1,
    ...(pending ? {} : { finishedAt: 2 }),
    canCancel: false,
    result: pending ? "attention" : "no_changes",
    approvals: { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] },
    recovery: pending
      ? {
          totalCount: 1,
          returnedCount: 1,
          omittedCount: 0,
          items: [{
            executionId: "execution-recovery",
            recoveryRevision: 1,
            tool: {
              name: "remote_operation",
              title: "Remote operation",
              risk: "external",
              idempotent: true,
              resultMode: "immediate",
            },
            evidence: {
              message: "Remote operation result was not observed",
              messageTruncated: false,
              reconciliationRef: "remote-1",
            },
            attemptCount: 1,
            attempts: [{
              attemptNumber: 1,
              state: "recovery_required",
              startedAt: 1,
              updatedAt: 1,
              finishedAt: 1,
            }],
            attemptsTruncated: false,
            createdAt: 1,
            updatedAt: 1,
            availableDecisions: [
              "confirm_succeeded",
              "confirm_failed",
              "retry",
              "abandon_turn",
            ],
          }],
        }
      : { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] },
  };
}

async function settleEventRefresh(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}
