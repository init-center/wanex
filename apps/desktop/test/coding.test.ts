import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type {
  CodingApplication,
  CodingApplicationEvent,
  CodingProjectReadModel,
  CodingCommandRequest,
} from "@wanex/coding";
import { isCodingCommandResponse } from "@wanex/coding";
import { startAssistantWebApp } from "@wanex/assistant-host";
import type { CodingApplicationHost } from "@wanex/coding/host";
import {
  createDesktopCodingComposition,
  createDesktopCodingProofSelectionQueue,
} from "../src/coding.js";

const compositions: Array<{ close(): Promise<void> }> = [];
const assistantApps: Array<{ close(): Promise<void> }> = [];
const tempDirs: string[] = [];
const execFileAsync = promisify(execFile);

describe("Desktop Coding proof selection boundary", () => {
  it("accepts only bounded absolute paths in proof mode", async () => {
    const first = join(process.cwd(), "coding-proof-first");
    const second = join(process.cwd(), "coding-proof-second");
    const select = createDesktopCodingProofSelectionQueue({
      proofEnabled: true,
      serializedSelections: JSON.stringify([first, second]),
    });
    if (select === undefined) throw new Error("Coding proof selection is missing");

    await expect(select()).resolves.toBe(first);
    await expect(select()).resolves.toBe(second);
    await expect(select()).rejects.toThrow("queue is exhausted");
    expect(() => createDesktopCodingProofSelectionQueue({
      proofEnabled: false,
      serializedSelections: JSON.stringify([first]),
    })).toThrow("require proof mode");
    expect(() => createDesktopCodingProofSelectionQueue({
      proofEnabled: true,
      serializedSelections: JSON.stringify(["relative/project"]),
    })).toThrow("absolute path");
  });
});

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

afterEach(async () => {
  while (compositions.length > 0) {
    await compositions.pop()?.close();
  }
  while (assistantApps.length > 0) {
    await assistantApps.pop()?.close();
  }
  await Promise.all(
    tempDirs.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("Desktop Coding composition", () => {
  it("keeps Coding lazy until a trusted project is opened", async () => {
    let starts = 0;
    const project = projectReadModel("project-lazy");
    const composition = createDesktopCodingComposition({
      storage: {
        kind: "store-dir",
        storeDir: "/private/profile-store",
        mode: "persistent",
      },
      dataDir: "/private/coding-data",
      serviceBin: "/private/wanex-system-service",
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
      start: async () => {
        starts += 1;
        return fakeHost(project);
      },
    });
    compositions.push(composition);

    expect(composition.state).toBe("idle");
    expect(starts).toBe(0);
    await expect(composition.openProject("/private/repository")).resolves.toEqual(
      project,
    );
    expect(starts).toBe(1);
    expect(composition.state).toBe("open");
  });

  it("does not allow commands before project selection", async () => {
    const composition = createDesktopCodingComposition({
      storage: {
        kind: "store-dir",
        storeDir: "/private/profile-store",
      },
      dataDir: "/private/coding-data",
      serviceBin: "/private/wanex-system-service",
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
      start: async () => fakeHost(projectReadModel("project-command")),
    });
    compositions.push(composition);

    await expect(composition.send(command("project.list"))).rejects.toThrow(
      "project has not been selected",
    );
  });

  it("removes event subscriptions and closes the Host exactly once", async () => {
    let hostCloses = 0;
    let unsubscribeCount = 0;
    let publish: ((event: CodingApplicationEvent) => void) | undefined;
    const project = projectReadModel("project-events");
    const application = fakeApplication(project, (listener) => {
      publish = listener;
      return () => {
        unsubscribeCount += 1;
        publish = undefined;
      };
    });
    const composition = createDesktopCodingComposition({
      storage: {
        kind: "store-dir",
        storeDir: "/private/profile-store",
      },
      dataDir: "/private/coding-data",
      serviceBin: "/private/wanex-system-service",
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
      start: async () => ({
        application,
        openProject: async () => project,
        close: async () => {
          hostCloses += 1;
        },
      }),
    });
    compositions.push(composition);
    const events: unknown[] = [];
    composition.subscribe((event) => events.push(event));
    await composition.openProject("/private/repository");

    publish?.({
      kind: "project_invalidated",
      projectId: project.projectId,
      reason: "project_opened",
      streamId: "coding-events",
      sequence: 1,
      occurredAt: 1,
    });
    expect(events).toHaveLength(1);

    await Promise.all([composition.close(), composition.close()]);
    expect(composition.state).toBe("closed");
    expect(unsubscribeCount).toBe(1);
    expect(hostCloses).toBe(1);
    expect(() => publish?.({
      kind: "project_invalidated",
      projectId: project.projectId,
      reason: "project_opened",
      streamId: "coding-events",
      sequence: 2,
      occurredAt: 2,
    })).not.toThrow();
    expect(events).toHaveLength(1);
  });

  it("does not start or retain resources after an explicit close", async () => {
    let starts = 0;
    const composition = createDesktopCodingComposition({
      storage: {
        kind: "store-dir",
        storeDir: "/private/profile-store",
      },
      dataDir: "/private/coding-data",
      serviceBin: "/private/wanex-system-service",
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
      start: async () => {
        starts += 1;
        return fakeHost(projectReadModel("project-closed"));
      },
    });

    await composition.close();
    await expect(composition.openProject("/private/repository")).rejects.toThrow(
      "composition is closed",
    );
    expect(starts).toBe(0);
  });

  it("does not resurrect a Host when close races with startup", async () => {
    let releaseStart!: () => void;
    let hostCloses = 0;
    const started = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const composition = createDesktopCodingComposition({
      storage: {
        kind: "store-dir",
        storeDir: "/private/profile-store",
      },
      dataDir: "/private/coding-data",
      serviceBin: "/private/wanex-system-service",
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
      start: async () => {
        await started;
        return {
          ...fakeHost(projectReadModel("project-race")),
          close: async () => {
            hostCloses += 1;
          },
        };
      },
    });

    const opening = composition.openProject("/private/repository");
    const closing = composition.close();
    releaseStart();
    await expect(opening).rejects.toThrow("composition is closing");
    await closing;
    expect(composition.state).toBe("closed");
    expect(hostCloses).toBe(1);
  });

  it("composes the real Coding Host only after project selection", async () => {
    const repositoryRoot = await createGitRepository();
    const storeDir = await temporaryDirectory("wanex-desktop-coding-store-");
    const dataDir = await temporaryDirectory("wanex-desktop-coding-data-");
    const composition = createDesktopCodingComposition({
      storage: { kind: "store-dir", storeDir, mode: "oneshot" },
      dataDir,
      serviceBin,
      secretResolver: secretResolver(),
      resolveModelEndpointId: async () => undefined,
    });
    compositions.push(composition);

    expect(composition.state).toBe("idle");
    const project = await composition.openProject(repositoryRoot);
    expect(composition.state).toBe("open");
    const request = {
      protocol: "wanex.coding/1" as const,
      kind: "command" as const,
      requestId: "real-project-list",
      command: "project.list" as const,
    };
    const response = await composition.send(request);

    expect(isCodingCommandResponse(response, request)).toBe(true);
    expect(response).toMatchObject({
      ok: true,
      value: [{ projectId: project.projectId, state: "ready" }],
    });
    expect(JSON.stringify(response)).not.toContain(repositoryRoot);
  }, 20_000);

  it("keeps Assistant and Coding on one profile Store with independent lifecycles", async () => {
    const profileRoot = await temporaryDirectory("wanex-desktop-shared-profile-");
    const codingDataDir = await temporaryDirectory("wanex-desktop-shared-coding-");
    const repositoryRoot = await createGitRepository();
    const storage = {
      kind: "profile" as const,
      rootDir: profileRoot,
      profileId: "desktop",
      mode: "oneshot" as const,
    };
    const assistant = await startAssistantWebApp({
      storage,
      serviceBin,
      web: { hostname: "127.0.0.1", port: 0 },
    });
    assistantApps.push(assistant);
    const composition = createDesktopCodingComposition({
      storage,
      dataDir: codingDataDir,
      serviceBin,
      secretResolver: assistant.secretResolver,
      resolveModelEndpointId: async () => undefined,
    });
    compositions.push(composition);

    await expect(assistant.readSnapshot()).resolves.toMatchObject({
      kind: "assistant-host.snapshot",
    });
    await expect(composition.openProject(repositoryRoot)).resolves.toMatchObject({
      state: "ready",
    });
    await composition.close();
    await expect(assistant.readSnapshot()).resolves.toMatchObject({
      kind: "assistant-host.snapshot",
    });
  }, 25_000);
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function createGitRepository(): Promise<string> {
  const repositoryRoot = await temporaryDirectory("wanex-desktop-coding-repository-");
  await mkdir(repositoryRoot, { recursive: true });
  await runGit(repositoryRoot, ["init"]);
  await runGit(repositoryRoot, ["config", "user.email", "wanex@example.local"]);
  await runGit(repositoryRoot, ["config", "user.name", "Wanex Test"]);
  await runGit(repositoryRoot, ["config", "core.autocrlf", "false"]);
  await runGit(repositoryRoot, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(repositoryRoot, "README.md"), "base\n", "utf8");
  await runGit(repositoryRoot, ["add", "README.md"]);
  await runGit(repositoryRoot, ["commit", "-m", "initial"]);
  return repositoryRoot;
}

async function runGit(repositoryRoot: string, args: readonly string[]): Promise<void> {
  await execFileAsync("git", ["-C", repositoryRoot, ...args]);
}

function fakeHost(project: CodingProjectReadModel): CodingApplicationHost {
  return {
    application: fakeApplication(project),
    openProject: async () => project,
    close: async () => {},
  };
}

function fakeApplication(
  project: CodingProjectReadModel,
  subscribe: CodingApplication["subscribe"] = () => () => {},
): CodingApplication {
  return {
    state: "open",
    listProjects: async () => [project],
    readProject: async () => project,
    closeProject: async () => {},
    listSessions: async () => ({ sessions: [], returnedCount: 0, hasMore: false }),
    readSession: async () => null,
    readTranscript: async () => null,
    listTurns: async () => ({ turns: [], returnedCount: 0, hasMore: false }),
    startTurn: async () => { throw new Error("not used"); },
    readTurn: async () => null,
    readLiveTurn: async () => null,
    cancelTurn: async () => { throw new Error("not used"); },
    resolveTurnRecovery: async () => { throw new Error("not used"); },
    resolveTurnApproval: async () => { throw new Error("not used"); },
    readProposal: async () => null,
    decideProposal: async () => { throw new Error("not used"); },
    requestProposalApply: async () => { throw new Error("not used"); },
    applyProposal: async () => { throw new Error("not used"); },
    undoProposal: async () => { throw new Error("not used"); },
    readEvents: async () => ({
      streamId: "coding-events",
      events: [],
      firstRetainedSequence: 1,
      lastSequence: 0,
      gap: false,
      hasMore: false,
    }),
    subscribe,
  };
}

function projectReadModel(projectId: string): CodingProjectReadModel {
  return {
    projectId,
    name: "repository",
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

function command(commandName: string): CodingCommandRequest {
  return {
    protocol: "wanex.coding/1",
    kind: "command",
    requestId: "request-1",
    command: commandName as CodingCommandRequest["command"],
  };
}

function secretResolver() {
  return {
    async resolve() {
      return {
        ref: "test://secret",
        provider: "test",
        disposed: false,
        reveal: () => "secret",
        dispose: () => {},
        toJSON: () => { throw new Error("secret serialization"); },
      } as never;
    },
  };
}
