import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AllowAllToolsPolicy } from "@wanex/runtime/tools";
import { startCodingApplication } from "../src/host/index.js";
import { CodingApplicationEventLog } from "../src/application/events.js";
import * as applicationEntry from "../src/index.js";
import * as hostEntry from "../src/host/index.js";
import type {
  CodingApplication,
  CodingApplicationEvent,
  CodingTurnReadModel,
} from "../src/index.js";
import {
  ApprovalRequiredWorkspacePolicy,
  BlockingProvider,
  StreamingTextProvider,
  CodingHostTestScope,
  WorkspaceEditProvider,
  executionOptions,
  serviceBin,
} from "./support.js";

let scope: CodingHostTestScope;

beforeEach(() => {
  scope = new CodingHostTestScope();
});

afterEach(async () => {
  await scope.dispose();
});

describe("Coding application contract", () => {
  it("keeps trusted Host construction out of the package root", () => {
    expect(Object.keys(applicationEntry)).toEqual([
      "CodingApplicationError",
      "CodingClientError",
      "createCodingClient",
      "createInProcessCodingTransport",
      "createMessageCodingTransport",
      "CODING_COMMANDS",
      "CODING_TRANSPORT_PROTOCOL",
      "isCodingCommandRequest",
      "isCodingCommandResponse",
      "isCodingEventEnvelope",
      "isCodingProject",
    ]);
    expect(applicationEntry).not.toHaveProperty("startCodingApplication");
    expect(hostEntry).toHaveProperty("startCodingApplication");
    expect(hostEntry).toHaveProperty("createCodingTransportEndpoint");
    expect(hostEntry).not.toHaveProperty("startCodingHost");
  });

  it("projects an approval, Proposal, apply, and undo journey without Host authority", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const policy = new ApprovalRequiredWorkspacePolicy();
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(new WorkspaceEditProvider(), {
        toolPermissionPolicy: policy,
      }),
    });
    try {
      const events: CodingApplicationEvent[] = [];
      const unsubscribe = host.application.subscribe((event) =>
        events.push(event),
      );
      const project = await host.openProject({
        repositoryPath: repositoryRoot,
      });
      expect(project).toMatchObject({
        projectId: expect.stringMatching(/^repo_/),
        state: "ready",
        recovery: {
          transactionAttention: false,
          taskAttentionCount: 0,
          taskFailureCount: 0,
          moreTasksPending: false,
        },
      });
      expect(JSON.stringify(project)).not.toContain(repositoryRoot);
      expect("openProject" in host.application).toBe(false);
      expect("registerProject" in host.application).toBe(false);
      expect("observeHostTurn" in host.application).toBe(false);
      expect("close" in host.application).toBe(false);
      expect(Object.isFrozen(host.application)).toBe(true);

      const waitingEvent = nextEvent(
        host.application,
        (event) =>
          event.kind === "turn_invalidated" && event.reason === "turn_waiting",
      );
      const started = await host.application.startTurn({
        projectId: project.projectId,
        idempotencyKey: "application-approved",
        content: [{ type: "text", text: "create approved" }],
        proposalTitle: "Create approved",
      });
      await policy.requested;
      await waitingEvent;

      const waiting = await requireTurn(
        host.application,
        project.projectId,
        started.turnId,
      );
      expect(waiting).toMatchObject({
        state: "waiting",
        canCancel: true,
        approvals: {
          totalCount: 1,
          returnedCount: 1,
          omittedCount: 0,
          items: [
            {
              tool: { name: "workspace_apply_changeset", risk: "mutating" },
              presentation: { summary: "Review Coding changes" },
              availableDecisions: ["approve_once", "deny"],
            },
          ],
        },
      });
      const approval = waiting.approvals.items[0]!;
      const proposalReady = settledTurn(
        host.application,
        project.projectId,
        started.turnId,
        (turn) => turn.proposalId !== undefined,
      );
      await host.application.resolveTurnApproval({
        projectId: project.projectId,
        turnId: started.turnId,
        executionId: approval.executionId,
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once",
        reason: "allow isolated workspace edit",
        requestId: "approve-tool-once",
      });
      const completed = await proposalReady;
      expect(completed).toMatchObject({
        state: "succeeded",
        result: "proposal_available",
        proposalId: expect.stringMatching(/^wcp_task_/),
        canCancel: false,
      });

      const proposalId = completed.proposalId!;
      const proposal = await host.application.readProposal({
        projectId: project.projectId,
        proposalId,
      });
      expect(proposal).toMatchObject({
        state: "open",
        changeState: "submitted",
        files: [{ path: "approved.txt", kind: "create" }],
      });
      expect(proposal).not.toHaveProperty("changeSetId");
      expect(JSON.stringify(proposal)).not.toContain(repositoryRoot);

      await host.application.decideProposal({
        projectId: project.projectId,
        proposalId,
        decision: "approve",
        reason: "reviewed generated file",
        requestId: "approve-proposal",
      });
      await host.application.requestProposalApply({
        projectId: project.projectId,
        proposalId,
        reason: "apply reviewed file",
        requestId: "request-proposal-apply",
      });
      const applied = await host.application.applyProposal({
        projectId: project.projectId,
        proposalId,
      });
      expect(applied).toMatchObject({
        status: "applied",
        proposal: { state: "applied", changeState: "applied" },
        mutation: { kind: "apply", files: [{ path: "approved.txt" }] },
      });
      expect(applied.mutation).not.toHaveProperty("operationId");
      await expect(
        readFile(join(repositoryRoot, "approved.txt"), "utf8"),
      ).resolves.toBe("approved\n");

      const undone = await host.application.undoProposal({
        projectId: project.projectId,
        proposalId,
        requestId: "undo-proposal",
      });
      expect(undone).toMatchObject({
        status: "applied",
        proposal: { changeState: "undone" },
        mutation: { kind: "undo" },
      });
      await expect(
        readFile(join(repositoryRoot, "approved.txt"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });

      expect(events.map((event) => event.sequence)).toEqual(
        events.map((_, index) => index + 1),
      );
      expect(events.some((event) => event.reason === "proposal_applied")).toBe(
        true,
      );
      expect(events.some((event) => event.reason === "proposal_undone")).toBe(
        true,
      );
      expect(JSON.stringify(events)).not.toContain(repositoryRoot);
      unsubscribe();
    } finally {
      await host.close();
      await environment.dispose();
    }
  }, 20_000);

  it("projects live Provider text and clears it when canonical Turn settlement arrives", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const provider = new StreamingTextProvider();
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(provider, {
        toolPermissionPolicy: new AllowAllToolsPolicy(),
      }),
    });
    try {
      const project = await host.openProject({ repositoryPath: repositoryRoot });
      const liveEventPromise = nextEvent(
        host.application,
        (event) => event.kind === "turn_live_invalidated",
      );
      const started = await host.application.startTurn({
        projectId: project.projectId,
        idempotencyKey: "application-stream-live",
        content: [{ type: "text", text: "stream live" }],
      });
      const liveEvent = await liveEventPromise;
      expect(liveEvent).toMatchObject({
        kind: "turn_live_invalidated",
        projectId: project.projectId,
        turnId: started.turnId,
        reason: "turn_live_updated",
      });
      await expect(
        host.application.readLiveTurn({
          projectId: project.projectId,
          turnId: started.turnId,
        }),
      ).resolves.toMatchObject({
        assistantText: "streaming answer",
        phase: "responding",
      });

      const settled = settledTurn(
        host.application,
        project.projectId,
        started.turnId,
        (turn) => turn.result === "no_changes",
      );
      provider.release();
      await settled;
      await expect(
        host.application.readLiveTurn({
          projectId: project.projectId,
          turnId: started.turnId,
        }),
      ).resolves.toBeNull();
    } finally {
      provider.release();
      await host.close();
      await environment.dispose();
    }
  }, 20_000);

  it("cancels by opaque Turn identity and rejects cross-project Session reuse", async () => {
    const environment = await scope.createEnvironment();
    const firstRoot = await scope.createRepository();
    const secondRoot = await scope.createRepository();
    const provider = new BlockingProvider();
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(provider, {
        toolPermissionPolicy: new AllowAllToolsPolicy(),
      }),
    });
    try {
      const first = await host.openProject({ repositoryPath: firstRoot });
      const second = await host.openProject({ repositoryPath: secondRoot });
      const started = await host.application.startTurn({
        projectId: first.projectId,
        idempotencyKey: "application-cancel",
        content: [{ type: "text", text: "wait" }],
      });
      await provider.started;
      const cancelled = settledTurn(
        host.application,
        first.projectId,
        started.turnId,
        (turn) => turn.result === "cancelled",
      );
      await host.application.cancelTurn({
        projectId: first.projectId,
        turnId: started.turnId,
        reason: "stop requested by user",
      });
      await expect(cancelled).resolves.toMatchObject({
        state: "cancelled",
        result: "cancelled",
        canCancel: false,
      });

      const rejected = await host.application.startTurn({
        projectId: second.projectId,
        idempotencyKey: "application-cross-project",
        sessionId: started.sessionId,
        content: [{ type: "text", text: "must not reuse context" }],
      });
      const rejectedResult = await settledTurn(
        host.application,
        second.projectId,
        rejected.turnId,
        (turn) => turn.result === "failed",
      );
      expect(rejectedResult).toMatchObject({
        state: "failed",
        result: "failed",
        error: { code: "turn_execution_failed" },
      });
      expect(provider.started).toBeDefined();
    } finally {
      await host.close();
      await environment.dispose();
    }
  }, 15_000);

  it("reconstructs bounded Session, Turn, and Proposal state after Host replacement", async () => {
    const environment = await scope.createEnvironment();
    const repositoryRoot = await scope.createRepository();
    const foreignRoot = await scope.createRepository();
    const options = {
      dataDir: environment.dataDir,
      storage: { kind: "injected" as const, handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: executionOptions(new WorkspaceEditProvider(), {
        toolPermissionPolicy: new AllowAllToolsPolicy(),
      }),
    };
    const firstHost = await startCodingApplication(options);
    const firstProject = await firstHost.openProject({
      repositoryPath: repositoryRoot,
    });
    const alpha = await settleStartedTurn(firstHost.application, {
      projectId: firstProject.projectId,
      idempotencyKey: "application-alpha",
      content: [{ type: "text", text: "create alpha" }],
      title: "Alpha Session",
    });
    const beta = await settleStartedTurn(
      firstHost.application,
      {
        projectId: firstProject.projectId,
        idempotencyKey: "application-beta",
        sessionId: alpha.sessionId,
        content: [{ type: "text", text: "create beta" }],
      },
      false,
    );
    const approved = await settleStartedTurn(firstHost.application, {
      projectId: firstProject.projectId,
      idempotencyKey: "application-approved-session",
      content: [{ type: "text", text: "create approved" }],
      title: "Approved Session",
    });
    const change = await settleStartedTurn(firstHost.application, {
      projectId: firstProject.projectId,
      idempotencyKey: "application-change-session",
      content: [{ type: "text", text: "create fallback" }],
      title: "Change Session",
    });
    expect(
      [alpha, approved, change].every(
        (turn) => turn.result === "proposal_available",
      ),
    ).toBe(true);
    expect(beta.result).toBe("no_changes");
    await firstHost.close();

    const relaunched = await startCodingApplication(options);
    try {
      const project = await relaunched.openProject({
        repositoryPath: repositoryRoot,
      });
      expect(project.projectId).toBe(firstProject.projectId);
      await expect(
        relaunched.application.readTurn({
          projectId: project.projectId,
          turnId: alpha.turnId,
        }),
      ).resolves.toMatchObject({
        sessionId: alpha.sessionId,
        state: "succeeded",
        proposalId: alpha.proposalId,
      });

      const sessions = await relaunched.application.listSessions({
        projectId: project.projectId,
        limit: 2,
      });
      expect(sessions).toMatchObject({
        returnedCount: 2,
        hasMore: true,
        nextCursor: expect.any(String),
      });
      const remainingSessions = await relaunched.application.listSessions({
        projectId: project.projectId,
        limit: 2,
        cursor: sessions.nextCursor!,
      });
      expect(remainingSessions).toMatchObject({
        returnedCount: 1,
        hasMore: false,
      });
      expect(
        [...sessions.sessions, ...remainingSessions.sessions]
          .map((session) => session.sessionId)
          .sort(),
      ).toEqual([alpha.sessionId, approved.sessionId, change.sessionId].sort());
      await expect(
        relaunched.application.readSession({
          projectId: project.projectId,
          sessionId: alpha.sessionId,
        }),
      ).resolves.toMatchObject({
        title: "Alpha Session",
        status: "active",
      });

      const recentTurns = await relaunched.application.listTurns({
        projectId: project.projectId,
        sessionId: alpha.sessionId,
        limit: 1,
      });
      expect(recentTurns).toMatchObject({
        returnedCount: 1,
        hasMore: true,
        turns: [{ turnId: beta.turnId }],
        nextCursor: expect.any(String),
      });
      await expect(
        relaunched.application.listTurns({
          projectId: project.projectId,
          sessionId: alpha.sessionId,
          limit: 1,
          cursor: recentTurns.nextCursor!,
        }),
      ).resolves.toMatchObject({
        returnedCount: 1,
        hasMore: false,
        turns: [{ turnId: alpha.turnId }],
      });

      const latestTranscript = await relaunched.application.readTranscript({
        projectId: project.projectId,
        sessionId: alpha.sessionId,
        limit: 1,
      });
      expect(latestTranscript).toMatchObject({
        returnedCount: 1,
        hasMore: true,
        nextCursor: expect.any(String),
      });
      const earlierTranscript = await relaunched.application.readTranscript({
        projectId: project.projectId,
        sessionId: alpha.sessionId,
        limit: 1,
        cursor: latestTranscript!.nextCursor!,
      });
      expect(earlierTranscript?.messages[0]?.sequence).toBeLessThan(
        latestTranscript!.messages[0]!.sequence,
      );
      await expect(
        relaunched.application.readTranscript({
          projectId: project.projectId,
          sessionId: approved.sessionId,
          cursor: latestTranscript!.nextCursor!,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });

      const proposal = await relaunched.application.readProposal({
        projectId: project.projectId,
        proposalId: alpha.proposalId!,
      });
      expect(proposal).toMatchObject({
        state: "open",
        files: [{ path: "alpha.txt" }],
      });
      await relaunched.application.decideProposal({
        projectId: project.projectId,
        proposalId: alpha.proposalId!,
        decision: "approve",
        reason: "reviewed after relaunch",
        requestId: "approve-alpha-after-relaunch",
      });
      await relaunched.application.requestProposalApply({
        projectId: project.projectId,
        proposalId: alpha.proposalId!,
        reason: "apply after relaunch",
        requestId: "request-alpha-after-relaunch",
      });
      await expect(
        relaunched.application.applyProposal({
          projectId: project.projectId,
          proposalId: alpha.proposalId!,
        }),
      ).resolves.toMatchObject({ status: "applied" });

      const foreign = await relaunched.openProject({
        repositoryPath: foreignRoot,
      });
      await expect(
        relaunched.application.readTurn({
          projectId: foreign.projectId,
          turnId: alpha.turnId,
        }),
      ).resolves.toBeNull();
      await expect(
        relaunched.application.readSession({
          projectId: foreign.projectId,
          sessionId: alpha.sessionId,
        }),
      ).resolves.toBeNull();
      await expect(
        relaunched.application.readTranscript({
          projectId: foreign.projectId,
          sessionId: alpha.sessionId,
        }),
      ).resolves.toBeNull();
      await expect(
        relaunched.application.listSessions({
          projectId: foreign.projectId,
          cursor: sessions.nextCursor!,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        relaunched.application.listTurns({
          projectId: project.projectId,
          sessionId: approved.sessionId,
          cursor: recentTurns.nextCursor!,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      const sessionCursor = sessions.nextCursor!;
      const tamperedCursor = `${sessionCursor.slice(0, -1)}${sessionCursor.endsWith("x") ? "y" : "x"}`;
      expect(tamperedCursor).not.toBe(sessionCursor);
      await expect(
        relaunched.application.listSessions({
          projectId: project.projectId,
          cursor: tamperedCursor,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
      await expect(
        relaunched.application.listSessions({
          projectId: project.projectId,
          limit: 101,
        }),
      ).rejects.toMatchObject({ code: "invalid_request" });
    } finally {
      await relaunched.close();
      await environment.dispose();
    }
  }, 30_000);

  it("bounds ordered invalidation replay and reports a missed-event gap", () => {
    const log = new CodingApplicationEventLog("coding-events-bounded");
    for (let index = 0; index < 300; index += 1) {
      log.publish({
        kind: "project_invalidated",
        projectId: "repo_bounded",
        reason: "project_opened",
      });
    }
    const page = log.read({ afterSequence: 0, limit: 100 });
    expect(page).toMatchObject({
      streamId: "coding-events-bounded",
      firstRetainedSequence: 45,
      lastSequence: 300,
      gap: true,
      hasMore: true,
    });
    expect(page.events).toHaveLength(100);
    expect(page.events[0]?.sequence).toBe(45);
    expect(page.events.at(-1)?.sequence).toBe(144);
    expect(
      log.read({
        streamId: "coding-events-replaced",
        afterSequence: 300,
        limit: 100,
      }),
    ).toMatchObject({
      streamId: "coding-events-bounded",
      gap: true,
      hasMore: true,
    });
  });
});

function nextEvent(
  application: CodingApplication,
  predicate: (event: CodingApplicationEvent) => boolean,
): Promise<CodingApplicationEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Coding application event was not observed"));
    }, 5_000);
    const unsubscribe = application.subscribe((event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}

function settledTurn(
  application: CodingApplication,
  projectId: string,
  turnId: string,
  predicate: (turn: CodingTurnReadModel) => boolean,
): Promise<CodingTurnReadModel> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      unsubscribe();
      reject(new Error("Coding Turn did not reach the expected state"));
    }, 8_000);
    const inspect = (): void => {
      void application.readTurn({ projectId, turnId }).then(
        (turn) => {
          if (done || turn === null || !predicate(turn)) return;
          done = true;
          clearTimeout(timeout);
          unsubscribe();
          resolve(turn);
        },
        (error) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          unsubscribe();
          reject(error);
        },
      );
    };
    const unsubscribe = application.subscribe((event) => {
      if (event.kind !== "turn_invalidated" || event.turnId !== turnId) return;
      inspect();
    });
    inspect();
  });
}

async function requireTurn(
  application: CodingApplication,
  projectId: string,
  turnId: string,
): Promise<CodingTurnReadModel> {
  const turn = await application.readTurn({ projectId, turnId });
  if (turn === null) throw new Error("Coding Turn is missing");
  return turn;
}

async function settleStartedTurn(
  application: CodingApplication,
  request: Parameters<CodingApplication["startTurn"]>[0],
  proposalExpected = true,
): Promise<CodingTurnReadModel> {
  const started = await application.startTurn(request);
  return await settledTurn(
    application,
    request.projectId,
    started.turnId,
    (turn) =>
      proposalExpected
        ? turn.proposalId !== undefined
        : turn.result === "no_changes",
  );
}
