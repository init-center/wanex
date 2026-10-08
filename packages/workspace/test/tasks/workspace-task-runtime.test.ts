import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { WanexSessionCore } from "@wanex/runtime/sessions";
import { WanexWorker } from "@wanex/runtime/jobs";
import {
  NativeChildSupervisor,
  type BindExecutionScopeRequest,
  type ChildSupervisor,
  type ChildTerminalEvidence,
  type ExecutionEnvironment,
  type ExecutionEnvironmentBinding,
  type ExecutionPolicySnapshot,
  type ExecutionResult,
  type ExecutionScope,
} from "@wanex/runtime/execution";
import {
  createStorageTestStore,
  type StorageTestStore,
} from "@wanex/storage/testing";
import { WorkspaceGitRuntime } from "../../src/git/index.js";
import { LocalRepositoryLocator } from "../../src/index.js";
import {
  FixedWorkspaceIsolationAdapter,
  GitWorktreeIsolationAdapter,
  type WorkspaceIsolationAdapter,
  type WorkspaceIsolationDurableIdentity,
  type WorkspaceIsolationLease,
  type WorkspaceIsolationRequest,
} from "../../src/isolation/index.js";
import { ProcessWorkspaceSnapshotClient } from "../../src/snapshot/index.js";
import {
  createWorkspaceTaskExecutionPolicy,
  registerWorkspaceTaskJobHandler,
  submitWorkspaceTaskJob,
  WorkspaceTaskAttentionError,
  WorkspaceTaskRuntime,
} from "../../src/tasks/index.js";
import {
  createWorkspaceTestExecution,
  disposeWorkspaceTestExecution,
} from "../execution.js";

const execFileAsync = promisify(execFile);
const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);
const tempDirs: string[] = [];

afterEach(async () => {
  await disposeWorkspaceTestExecution();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@wanex/workspace/tasks", () => {
  it("recovers a lost create response using the exact existing worktree", async () => {
    const environment = await createRuntime();
    let preparedRoot = "";
    environment.writableIsolation.losePrepareResponse = true;
    environment.writableIsolation.onPrepared = async (lease) => { preparedRoot = lease.rootDir; };
    let calls = 0;
    const first = await environment.runtime.runTask({
      id: "task_lost_create", access: "writable", strategy: "git_worktree", input: null,
      handler: () => { calls++; return {}; },
    });
    expect(first.status).toBe("failed");
    expect(calls).toBe(0);
    const originalRoot = preparedRoot;
    await writeFile(join(originalRoot, "preserved.txt"), "preserved\n");
    const resumed = await environment.runtime.resumeTask({
      runId: first.taskId, input: null,
      handler: async (context) => {
        expect(context.rootDir).toBe(originalRoot);
        expect(await readFile(join(context.rootDir, "preserved.txt"), "utf8")).toBe("preserved\n");
        return {};
      },
    });
    expect(resumed.status).toBe("succeeded");
    expect(environment.writableIsolation.preparedIds[0]).toBe(environment.writableIsolation.preparedIds[1]);
    await expect(stat(originalRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(environment.readOnlyRoot, "preserved.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not publish cancellation until prepare settles and isolation is released", async () => {
    const environment = await createRuntime();
    const controller = new AbortController();
    const prepared = deferred();
    const releasePrepare = deferred();
    let root = "";
    environment.writableIsolation.onPrepared = async (lease) => {
      root = lease.rootDir;
      prepared.resolve();
      await releasePrepare.promise;
    };
    let called = false;
    const task = environment.runtime.runTask({
      id: "task_cancel_prepare", access: "writable", strategy: "git_worktree", input: null,
      signal: controller.signal, handler: () => { called = true; return {}; },
    });
    await prepared.promise;
    controller.abort();
    expect((await environment.storage.getWorkspaceTaskRun({ runId: "task_cancel_prepare" }))?.run.state).toBe("preparing");
    expect((await stat(root)).isDirectory()).toBe(true);
    releasePrepare.resolve();
    expect((await task).status).toBe("failed");
    expect(called).toBe(false);
    expect((await environment.storage.getWorkspaceTaskRun({ runId: "task_cancel_prepare" }))?.run).toMatchObject({ state: "released", executionOutcome: "cancelled", outcome: "cancelled" });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers release response loss without recreating or deleting unrelated files", async () => {
    const environment = await createRuntime({ leaseMs: 1_000 });
    environment.writableIsolation.loseReleaseResponse = true;
    const first = await environment.runtime.runTask({
      id: "task_lost_release", access: "writable", strategy: "git_worktree", input: null,
      handler: () => ({}),
    });
    expect(first.status).toBe("failed");
    expect((await environment.storage.getWorkspaceTaskRun({ runId: first.taskId }))?.run.state).toBe("releasing");
    await waitForLeaseExpiry(environment.storage, first.taskId);
    expect((await environment.runtime.recoverTask({ runId: first.taskId })).status).toBe("succeeded");
    expect(environment.writableIsolation.preparedIds).toHaveLength(1);
    expect((await environment.storage.getWorkspaceTaskRun({ runId: first.taskId }))?.run.state).toBe("released");
    expect((await stat(environment.readOnlyRoot)).isDirectory()).toBe(true);
  });

  it("cancels a real running child and proves cleanup before releasing its worktree", async () => {
    const environment = await createRuntime({ childSupervisor: new NativeChildSupervisor({ serviceBin }) });
    const controller = new AbortController();
    const started = deferred();
    let terminal: ExecutionResult | undefined;
    let root = "";
    const task = environment.runtime.runTask({
      id: "task_cancel_child", access: "writable", strategy: "git_worktree", input: null, signal: controller.signal,
      handler: async (context) => {
        root = context.rootDir;
        const child = await context.executionScope.process.start({
          program: process.execPath, args: ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"],
          cwd: context.rootDir,
        });
        for await (const event of child.events) {
          if (event.type === "stdout") started.resolve();
        }
        terminal = await child.wait();
        return {};
      },
    });
    await started.promise;
    controller.abort();
    expect((await task).status).toBe("failed");
    expect(terminal).toMatchObject({ termination: "cancelled", cleanup: "completed" });
    expect((await environment.storage.getWorkspaceTaskRun({ runId: "task_cancel_child" }))?.run).toMatchObject({ state: "released", executionOutcome: "cancelled" });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("filters foreign Host and generation records before applying recovery limits", async () => {
    const environment = await createRuntime();
    for (const [index, changed] of [
      { hostId: "other_host" }, { generationKey: "other_generation" }, { rootId: "other_root" }, {},
    ].entries()) {
      await environment.storage.beginWorkspaceTaskRun({
        id: `task_scoped_${index}`, workspaceId: "workspace_task_test", principalId: "principal_task_test",
        strategy: "direct", access: "read_only", rootIdentity: { ...environment.rootIdentity, ...changed },
        isolationIdentity: { id: `isolation_scoped_${index}`, kind: "fixed" },
        executionEnvironment: taskExecutionBinding(environment.executionEnvironment, "read_only"),
        attemptId: `attempt_scoped_${index}`, ownerId: "lost_owner",
        claimToken: "scope-test-token-abcdefghijklmnopqrstuvwxyz", leaseMs: 10,
      });
    }
    await waitForLeaseExpiry(environment.storage, "task_scoped_3");
    const result = await environment.runtime.recoverExpiredTasks({ maxRuns: 1, budgetMs: 5_000 });
    expect(result).toMatchObject({ attempted: 1, attention: 1, failed: 0, remaining: false });
    expect(result.entries[0]?.runId).toBe("task_scoped_3");
    for (const index of [0, 1, 2]) {
      expect((await environment.storage.getWorkspaceTaskRun({ runId: `task_scoped_${index}` }))?.run.state).toBe("preparing");
    }
  });

  it("keeps a failed root independent from another root sharing the same store", async () => {
    const first = await createRuntime();
    const second = await createRuntime();
    first.writableIsolation.losePrepareResponse = true;
    const failure = await first.runtime.runTask({
      id: "task_first_root", access: "writable", strategy: "git_worktree", input: null, handler: () => ({}),
    });
    expect(failure.status).toBe("failed");
    const other = new WorkspaceTaskRuntime({
      storage: first.storage, rootIdentity: { ...second.rootIdentity, rootId: "independent_root" },
      directIsolation: second.readOnlyIsolation, executionEnvironment: second.executionEnvironment,
      workspaceId: "workspace_task_test",
    });
    expect((await other.runTask({
      id: "task_second_root", access: "read_only", strategy: "direct", input: null, handler: () => ({}),
    })).status).toBe("succeeded");
    expect((await first.storage.getWorkspaceTaskRun({ runId: failure.taskId }))?.run.state).toBe("attention");
    expect(first.writableIsolation.releasedIds).toEqual([]);
    expect((await stat(second.readOnlyRoot)).isDirectory()).toBe(true);
  });

  it("stops a real child when renewal fails and preserves attention instead of releasing", async () => {
    const environment = await createRuntime({ childSupervisor: new NativeChildSupervisor({ serviceBin }) });
    let childStarted = false;
    const storage = new Proxy(environment.storage, {
      get(target, key, receiver) {
        if (key === "renewWorkspaceTaskRun") return async (request: Parameters<typeof target.renewWorkspaceTaskRun>[0]) => {
          if (childStarted) throw new Error("renewal ownership lost");
          return await target.renewWorkspaceTaskRun(request);
        };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const runtime = new WorkspaceTaskRuntime({
      storage, rootIdentity: environment.rootIdentity, directIsolation: environment.readOnlyIsolation,
      executionEnvironment: environment.executionEnvironment, leaseMs: 3_000,
    });
    let terminal: ExecutionResult | undefined;
    const result = await runtime.runTask({
      id: "task_lost_renewal", access: "read_only", strategy: "direct", input: null,
      handler: async (context) => {
        const child = await context.executionScope.process.start({
          program: process.execPath, args: ["-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"], cwd: context.rootDir,
        });
        for await (const event of child.events) if (event.type === "stdout") childStarted = true;
        terminal = await child.wait();
        return {};
      },
    });
    expect(result.status).toBe("failed");
    expect(terminal).toMatchObject({ termination: "cancelled", cleanup: "completed" });
    expect(environment.readOnlyIsolation.releasedIds).toEqual([]);
    expect((await environment.storage.getWorkspaceTaskRun({ runId: result.taskId }))?.run.state).toBe("attention");
  });

  it("runs direct read-only tasks without configuring any Git capability", async () => {
    const environment = await createRuntime();
    const runtime = new WorkspaceTaskRuntime({
      storage: environment.storage,
      rootIdentity: environment.rootIdentity,
      directIsolation: environment.readOnlyIsolation,
      executionEnvironment: environment.executionEnvironment,
    });
    const receipt = await runtime.runTask({
      id: "task_without_git",
      access: "read_only",
      strategy: "direct",
      input: null,
      handler: (context) => {
        expect(context.strategy).toBe("direct");
        return { summary: "read only" };
      },
    });
    expect(receipt.status).toBe("succeeded");
    expect(environment.writableIsolation.preparedIds).toEqual([]);
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: receipt.taskId,
    });
    expect(snapshot?.run).toMatchObject({
      strategy: "direct",
      rootIdentity: environment.rootIdentity,
      isolationIdentity: { kind: "fixed" },
    });
    expect(snapshot?.run.isolationIdentity.repositoryId).toBeUndefined();
    for (const strategy of ["direct", "git_worktree"] as const) {
      await expect(
        runtime.runTask({
          id: "task_disallowed",
          access: "writable",
          strategy,
          input: null,
          handler: () => {
            throw new Error("must not execute");
          },
        }),
      ).rejects.toThrow();
      expect(
        await environment.storage.getWorkspaceTaskRun({
          runId: "task_disallowed",
        }),
      ).toBeNull();
    }
  });

  it("rejects replay and continuation under a changed root generation", async () => {
    const environment = await createRuntime();
    const request = {
      id: "task_frozen_root",
      access: "read_only" as const,
      strategy: "direct" as const,
      input: null,
      handler: () => {
        throw new WorkspaceTaskAttentionError({ message: "needs attention" });
      },
    };
    await environment.runtime.runTask(request);
    const runtime = new WorkspaceTaskRuntime({
      storage: environment.storage,
      directIsolation: environment.readOnlyIsolation,
      rootIdentity: {
        ...environment.rootIdentity,
        generationKey: "different_generation",
      },
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      executionEnvironment: environment.executionEnvironment,
    });
    await expect(runtime.runTask(request)).rejects.toThrow(
      "different identity",
    );
    await expect(
      runtime.resumeTask({
        runId: request.id,
        input: null,
        handler: () => ({}),
      }),
    ).rejects.toThrow("different root identity");
    await expect(runtime.recoverTask({ runId: request.id })).rejects.toThrow(
      "different root identity",
    );
    expect(
      await environment.storage.listWorkspaceTaskAttempts({
        runId: request.id,
      }),
    ).toHaveLength(1);
  });

  it("projects writable task edits into one proposal without exposing its lease", async () => {
    const environment = await createRuntime();
    let executionRoot = "";
    const receipt = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_success",
      access: "writable",
      input: { prompt: "create src/app.ts" },
      jobId: "job_success",
      agentId: "agent_success",
      handler: async (context) => {
        executionRoot = context.rootDir;
        expect(context.access).toBe("writable");
        expect(context.input).toEqual({ prompt: "create src/app.ts" });
        expect(context.executionScope).not.toHaveProperty("close");
        await mkdir(join(context.rootDir, "src"), { recursive: true });
        await writeFile(join(context.rootDir, "src/app.ts"), "after\n", "utf8");
        return {
          artifacts: [
            {
              kindOfOutput: "inline_bytes",
              bytes: new TextEncoder().encode("task log\n"),
              mediaType: "text/plain",
              kind: "log",
              origin: "tool_output",
              label: "task log",
            },
          ],
          summary: "  created app  ",
        };
      },
    });

    expect(receipt).toMatchObject({
      taskId: "wtsk_success",
      status: "succeeded",
      access: "writable",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      summary: "created app",
      changeSet: { currentState: "submitted" },
      proposal: { state: "open", summary: "created app" },
    });
    expect(receipt.proposal?.changeSetId).toBe(receipt.changeSet?.id);
    expect(receipt).not.toHaveProperty("lease");
    expect(receipt).not.toHaveProperty("released");
    expect(JSON.stringify(receipt)).not.toContain(executionRoot);
    expect(receipt.resources).toHaveLength(1);
    let replayHandlerCalls = 0;
    const replay = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_success",
      access: "writable",
      input: { prompt: "create src/app.ts" },
      jobId: "job_success",
      agentId: "agent_success",
      handler: () => {
        replayHandlerCalls += 1;
        return {};
      },
    });
    expect(replay).toMatchObject({
      taskId: "wtsk_success",
      status: "succeeded",
      proposal: { id: receipt.proposal?.id },
    });
    expect(replayHandlerCalls).toBe(0);
    await expect(
      readFile(
        join(
          environment.storage.storeDir,
          "files",
          receipt.resources[0]!.logicalPath,
        ),
        "utf8",
      ),
    ).resolves.toBe("task log\n");
    expect(environment.writableIsolation.releasedIds).toHaveLength(1);
    await expect(stat(executionRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      environment.storage.getWorkspaceChangeSet({
        changeSetId: receipt.changeSet!.id,
      }),
    ).resolves.toMatchObject({ currentState: "submitted" });
    await expect(
      environment.storage.getWorkspaceChangeProposal({
        proposalId: receipt.proposal!.id,
      }),
    ).resolves.toMatchObject({ state: "open" });
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: receipt.taskId,
    });
    expect(snapshot).toMatchObject({
      run: {
        jobId: "job_success",
        agentId: "agent_success",
        executionEnvironment: taskExecutionBinding(
          environment.executionEnvironment,
          "writable",
        ),
      },
    });
  });

  it("replays an attention task without creating another execution attempt", async () => {
    const environment = await createRuntime();
    let handlerCalls = 0;
    const first = await environment.runtime.runTask({
      strategy: "direct",
      id: "wtsk_attention_replay",
      access: "read_only",
      input: { prompt: "requires recovery" },
      jobId: "job_attention_replay",
      agentId: "agent_attention_replay",
      handler: () => {
        handlerCalls += 1;
        throw new WorkspaceTaskAttentionError({
          name: "TestAttention",
          message: "execution result is ambiguous",
        });
      },
    });
    const second = await environment.runtime.runTask({
      strategy: "direct",
      id: "wtsk_attention_replay",
      access: "read_only",
      input: { prompt: "requires recovery" },
      jobId: "job_attention_replay",
      agentId: "agent_attention_replay",
      handler: () => {
        handlerCalls += 1;
        return {};
      },
    });

    expect(first).toMatchObject({
      status: "failed",
      error: { message: "execution result is ambiguous" },
    });
    expect(second).toEqual(first);
    expect(handlerCalls).toBe(1);
    await expect(
      environment.storage.listWorkspaceTaskAttempts({
        runId: "wtsk_attention_replay",
      }),
    ).resolves.toHaveLength(1);
  });

  it("rejects unsupported execution policy before durable admission or isolation", async () => {
    const environment = await createRuntime();
    const unsupported = new TestExecutionEnvironment(
      environment.executionEnvironment,
      {
        resolve() {
          throw new Error("test execution policy is unsupported");
        },
      },
    );
    const runtime = runtimeWithExecutionEnvironment(environment, unsupported);
    let handlerCalls = 0;

    await expect(
      runtime.runTask({
        strategy: "direct",
        id: "wtsk_unsupported_environment",
        access: "read_only",
        input: null,
        handler: () => {
          handlerCalls += 1;
          return {};
        },
      }),
    ).rejects.toThrow("test execution policy is unsupported");

    expect(handlerCalls).toBe(0);
    expect(unsupported.bindCalls).toBe(0);
    expect(environment.readOnlyIsolation.preparedIds).toEqual([]);
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_unsupported_environment",
      }),
    ).resolves.toBeNull();
  });

  it("closes a drifted execution Scope and blocks the task handler", async () => {
    const environment = await createRuntime();
    const drifted = new TestExecutionEnvironment(
      environment.executionEnvironment,
      {
        bind: (binding) => ({
          ...binding,
          providerRevision: `${binding.providerRevision}.drifted`,
        }),
      },
    );
    const runtime = runtimeWithExecutionEnvironment(environment, drifted);
    let handlerCalls = 0;

    const receipt = await runtime.runTask({
      strategy: "direct",
      id: "wtsk_scope_binding_drift",
      access: "read_only",
      input: null,
      handler: () => {
        handlerCalls += 1;
        return {};
      },
    });

    expect(receipt).toMatchObject({
      status: "failed",
      error: {
        message:
          "workspace task bound execution environment changed after admission",
      },
    });
    expect(handlerCalls).toBe(0);
    expect(drifted.bindCalls).toBe(1);
    expect(drifted.closedScopeCount).toBe(1);
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1);
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_scope_binding_drift",
      }),
    ).resolves.toMatchObject({ run: { state: "attention" } });
  });

  it("preserves prepared worktree identity after execution binding fails until explicit continuation", async () => {
    const environment = await createRuntime();
    const drifted = new TestExecutionEnvironment(environment.executionEnvironment, {
      bind: (binding) => ({ ...binding, providerRevision: `${binding.providerRevision}.drifted` }),
    });
    let preparedRoot = "";
    environment.writableIsolation.onPrepared = async (lease) => { preparedRoot = lease.rootDir; };
    let handlerCalls = 0;
    const receipt = await runtimeWithExecutionEnvironment(environment, drifted).runTask({
      id: "task_prepared_binding_failure", access: "writable", strategy: "git_worktree", input: null,
      handler: () => { handlerCalls++; return {}; },
    });
    expect(receipt.status).toBe("failed");
    expect(handlerCalls).toBe(0);
    expect(drifted.closedScopeCount).toBe(1);
    expect(environment.writableIsolation.releasedIds).toEqual([]);
    const original = preparedRoot;
    expect((await stat(original)).isDirectory()).toBe(true);
    const before = await environment.storage.getWorkspaceTaskRun({ runId: receipt.taskId });
    expect(before?.run.state).toBe("attention");
    expect(before?.run.isolationIdentity.baseRevision).toBeTruthy();
    const resumed = await environment.runtime.resumeTask({
      runId: receipt.taskId, input: null,
      handler: (context) => { expect(context.rootDir).toBe(original); return {}; },
    });
    expect(resumed.status).toBe("succeeded");
    expect((await environment.storage.getWorkspaceTaskRun({ runId: receipt.taskId }))?.run.isolationIdentity)
      .toEqual(before?.run.isolationIdentity);
    await expect(stat(original)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("releases read-only isolation when its handler fails", async () => {
    const environment = await createRuntime();
    const receipt = await environment.runtime.runTask({
      strategy: "direct",
      id: "wtsk_failure",
      access: "read_only",
      input: null,
      handler: () => {
        throw new Error("handler failed");
      },
    });

    expect(receipt).toMatchObject({
      status: "failed",
      access: "read_only",
      resources: [],
      error: { message: "handler failed", name: "Error" },
    });
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1);
    expect(receipt).not.toHaveProperty("lease");
  });

  it("binds supervised child execution to the exact durable task attempt", async () => {
    const environment = await createRuntime({
      childSupervisor: new NativeChildSupervisor({ serviceBin }),
    });
    let executionResult: ExecutionResult | undefined;
    const receipt = await environment.runtime.runTask({
      strategy: "direct",
      id: "wtsk_supervised_child",
      access: "read_only",
      input: null,
      handler: async (context) => {
        executionResult = await context.executionScope.process.execute({
          program: process.execPath,
          args: ["-e", "process.stdout.write('supervised')"],
          cwd: context.rootDir,
          output: { stdoutBytes: 64 },
        });
        return {};
      },
    });

    expect(receipt.status).toBe("succeeded");
    expect(executionResult).toMatchObject({
      termination: "exited",
      cleanup: "completed",
      stdout: { text: "supervised" },
    });
    const attempts = await environment.storage.listWorkspaceTaskAttempts({
      runId: "wtsk_supervised_child",
    });
    expect(attempts).toHaveLength(1);
    expect(JSON.stringify(attempts)).not.toContain("claimToken");
  });

  it("moves a writable task to attention when child cleanup is ambiguous", async () => {
    const environment = await createRuntime({
      childSupervisor: ambiguousChildSupervisor(),
    });
    let executionRoot = "";
    const receipt = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_ambiguous_cleanup",
      access: "writable",
      input: null,
      handler: async (context) => {
        executionRoot = context.rootDir;
        try {
          await context.executionScope.process.execute({
            program: process.execPath,
            args: ["-e", "process.exit(0)"],
            cwd: context.rootDir,
          });
        } catch {
          // A handler cannot downgrade an unproven process-tree cleanup.
        }
        await writeFile(
          join(context.rootDir, "must-not-collect.txt"),
          "unsafe\n",
        );
        return { summary: "must not settle" };
      },
    });

    expect(receipt).toMatchObject({
      status: "failed",
      error: { message: "execution process tree cleanup could not be proven" },
    });
    expect(receipt.changeSet).toBeUndefined();
    expect(receipt.proposal).toBeUndefined();
    expect(environment.writableIsolation.releasedIds).toHaveLength(0);
    await expect(stat(executionRoot)).resolves.toBeDefined();
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_ambiguous_cleanup",
    });
    expect(snapshot).toMatchObject({ run: { state: "attention" } });
    expect(snapshot?.activeAttempt).toBeUndefined();
  });

  it("does not rerun an expired active task and requires attention", async () => {
    const environment = await createRuntime({ leaseMs: 1_000 });
    await environment.storage.beginWorkspaceTaskRun({
      strategy: "direct",
      rootIdentity: environment.rootIdentity,
      isolationIdentity: { id: "wiso_expired_active", kind: "fixed" },
      id: "wtsk_expired_active",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      access: "read_only",
      executionEnvironment: taskExecutionBinding(
        environment.executionEnvironment,
        "read_only",
      ),
      attemptId: "wtat_expired_active",
      ownerId: "owner_expired_active",
      claimToken: "expired-active-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 1_000,
    });
    await environment.storage.markWorkspaceTaskActive({
      runId: "wtsk_expired_active",
      attemptId: "wtat_expired_active",
      claimToken: "expired-active-token-abcdefghijklmnopqrstuvwxyz",
    });
    await waitForLeaseExpiry(environment.storage, "wtsk_expired_active");

    const recovered = await environment.runtime.recoverTask({
      runId: "wtsk_expired_active",
    });

    expect(recovered).toMatchObject({
      status: "failed",
      error: {
        message:
          "workspace task owner was lost before execution settlement could be proven",
      },
    });
    const attempts = await environment.storage.listWorkspaceTaskAttempts({
      runId: "wtsk_expired_active",
    });
    expect(attempts).toHaveLength(2);
    expect(attempts.filter((attempt) => attempt.kind === "execution")).toMatchObject([
      { id: "wtat_expired_active", state: "expired" },
    ]);
    expect(attempts.filter((attempt) => attempt.kind === "recovery")).toHaveLength(1);
    expect(environment.readOnlyIsolation.preparedIds).toEqual([]);
    await environment.runtime.recoverTask({ runId: "wtsk_expired_active" });
    expect(await environment.storage.listWorkspaceTaskAttempts({
      runId: "wtsk_expired_active",
    })).toEqual(attempts);
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_expired_active",
    });
    expect(snapshot).toMatchObject({ run: { state: "attention" } });
    expect(snapshot?.activeAttempt).toBeUndefined();
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(0);
  });

  it("admits expired runs with a bounded recovery scan", async () => {
    const environment = await createRuntime({
      leaseMs: 1_000,
      writableReleaseError: true,
    });
    const first = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_admission_release",
      access: "writable",
      input: null,
      handler: async (context) => {
        await writeFile(join(context.rootDir, "admission.txt"), "release\n");
        return {};
      },
    });
    expect(first.proposal).toBeDefined();

    await waitForLeaseExpiry(environment.storage, "wtsk_admission_release");
    const admission = await environment.runtime.recoverExpiredTasks({
      maxRuns: 1,
      budgetMs: 5_000,
    });

    expect(admission).toMatchObject({
      attempted: 1,
      released: 1,
      attention: 0,
      skipped: 0,
      failed: 0,
      remaining: false,
      entries: [
        {
          runId: "wtsk_admission_release",
          previousState: "releasing",
          outcome: "released",
        },
      ],
    });
    expect(admission.diagnostics).toEqual([]);
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_admission_release",
      }),
    ).resolves.toMatchObject({ run: { state: "released" } });
  });

  it("keeps an expired execution run in attention without rerunning it", async () => {
    const environment = await createRuntime({ leaseMs: 1_000 });
    await environment.storage.beginWorkspaceTaskRun({
      strategy: "direct",
      rootIdentity: environment.rootIdentity,
      isolationIdentity: { id: "wiso_admission_attention", kind: "fixed" },
      id: "wtsk_admission_attention",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      access: "read_only",
      executionEnvironment: taskExecutionBinding(
        environment.executionEnvironment,
        "read_only",
      ),
      attemptId: "wtat_admission_attention",
      ownerId: "owner_admission_attention",
      claimToken: "admission-attention-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 1_000,
    });
    await environment.storage.markWorkspaceTaskActive({
      runId: "wtsk_admission_attention",
      attemptId: "wtat_admission_attention",
      claimToken: "admission-attention-token-abcdefghijklmnopqrstuvwxyz",
    });
    await waitForLeaseExpiry(environment.storage, "wtsk_admission_attention");

    const admission = await environment.runtime.recoverExpiredTasks({
      maxRuns: 1,
      budgetMs: 5_000,
    });

    expect(admission).toMatchObject({
      attempted: 1,
      released: 0,
      attention: 1,
      skipped: 0,
      failed: 0,
      remaining: false,
      entries: [
        {
          runId: "wtsk_admission_attention",
          previousState: "active",
          outcome: "attention",
        },
      ],
    });
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_admission_attention",
      }),
    ).resolves.toMatchObject({ run: { state: "attention" } });
  });

  it("does not claim a task whose owner lease is still healthy", async () => {
    const environment = await createRuntime();
    await environment.storage.beginWorkspaceTaskRun({
      strategy: "direct",
      rootIdentity: environment.rootIdentity,
      isolationIdentity: { id: "wiso_admission_healthy", kind: "fixed" },
      id: "wtsk_admission_healthy",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      access: "read_only",
      executionEnvironment: taskExecutionBinding(
        environment.executionEnvironment,
        "read_only",
      ),
      attemptId: "wtat_admission_healthy",
      ownerId: "owner_admission_healthy",
      claimToken: "admission-healthy-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 60_000,
    });

    const admission = await environment.runtime.recoverExpiredTasks({
      maxRuns: 1,
      budgetMs: 5_000,
    });

    expect(admission).toEqual({
      attempted: 0,
      released: 0,
      attention: 0,
      skipped: 0,
      failed: 0,
      remaining: false,
      entries: [],
      diagnostics: [],
    });
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_admission_healthy",
      }),
    ).resolves.toMatchObject({
      run: { state: "preparing" },
      activeAttempt: { id: "wtat_admission_healthy", state: "active" },
    });
  });

  it("reports a bounded backlog instead of scanning every expired run", async () => {
    const environment = await createRuntime({ leaseMs: 1_000 });
    for (const suffix of ["first", "second"]) {
      await environment.storage.beginWorkspaceTaskRun({
        strategy: "direct",
        rootIdentity: environment.rootIdentity,
        isolationIdentity: { id: `wiso_admission_${suffix}`, kind: "fixed" },
        id: `wtsk_admission_${suffix}`,
        workspaceId: "workspace_task_test",
        principalId: "principal_task_test",
        access: "read_only",
        executionEnvironment: taskExecutionBinding(
          environment.executionEnvironment,
          "read_only",
        ),
        attemptId: `wtat_admission_${suffix}`,
        ownerId: `owner_admission_${suffix}`,
        claimToken: `admission-${suffix}-token-abcdefghijklmnopqrstuvwxyz`,
        leaseMs: 1_000,
      });
    }
    await waitForLeaseExpiry(
      environment.storage,
      "wtsk_admission_first",
      "wtsk_admission_second",
    );

    const admission = await environment.runtime.recoverExpiredTasks({
      maxRuns: 1,
      budgetMs: 5_000,
    });

    expect(admission).toMatchObject({
      attempted: 1,
      attention: 1,
      remaining: true,
      diagnostics: [{ code: "limit_reached" }],
    });
    const snapshots = await Promise.all(
      ["first", "second"].map(
        async (suffix) =>
          await environment.storage.getWorkspaceTaskRun({
            runId: `wtsk_admission_${suffix}`,
          }),
      ),
    );
    expect(
      snapshots.filter((snapshot) => snapshot?.run.state === "attention"),
    ).toHaveLength(1);
    expect(
      snapshots.filter((snapshot) => snapshot?.run.state === "preparing"),
    ).toHaveLength(1);
  });

  it("recovers only durable release after a proposal has settled", async () => {
    const environment = await createRuntime({
      leaseMs: 1_000,
      writableReleaseError: true,
    });
    let handlerCalls = 0;
    const first = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_release_recovery",
      access: "writable",
      input: null,
      handler: async (context) => {
        handlerCalls += 1;
        await writeFile(join(context.rootDir, "recovery.txt"), "durable\n");
        return { summary: "recover release" };
      },
    });

    expect(first.status).toBe("failed");
    expect(first.proposal).toBeDefined();
    const beforeRecovery = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_release_recovery",
    });
    expect(beforeRecovery).toMatchObject({
      run: { state: "releasing", outcome: "proposed" },
      activeAttempt: { state: "active" },
    });
    await waitForLeaseExpiry(environment.storage, "wtsk_release_recovery");

    const recovered = await environment.runtime.recoverTask({
      runId: "wtsk_release_recovery",
    });

    if (recovered.status !== "succeeded") {
      throw new Error(
        `workspace task recovery returned ${JSON.stringify(recovered)}`,
      );
    }
    expect(handlerCalls).toBe(1);
    expect(environment.writableIsolation.durableReleasedIds).toHaveLength(1);
    expect(environment.writableIsolation.durableReleasedIds[0]).toMatch(
      /^wiso_[A-Za-z0-9_.:-]+$/,
    );
    const afterRecovery = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_release_recovery",
    });
    expect(afterRecovery).toMatchObject({
      run: { state: "released", outcome: "proposed" },
    });
    expect(afterRecovery?.activeAttempt).toBeUndefined();
  });

  it("moves provider, capability, and policy drift to attention without durable release", async () => {
    const drifts: readonly [
      string,
      (binding: ExecutionEnvironmentBinding) => ExecutionEnvironmentBinding,
    ][] = [
      [
        "provider",
        (binding) => ({
          ...binding,
          providerRevision: `${binding.providerRevision}.changed`,
        }),
      ],
      [
        "capability",
        (binding) => {
          const capabilities = {
            ...binding.capabilities,
            network: { enforcement: "os" as const },
          };
          return {
            ...binding,
            capabilities,
            capabilityDigest: digestJson(capabilities),
          };
        },
      ],
      [
        "policy",
        (binding) => {
          const policy = {
            ...binding.policy,
            filesystem: {
              ...binding.policy.filesystem,
              maxReadBytes: binding.policy.filesystem.maxReadBytes + 1,
            },
          };
          return { ...binding, policy, policyDigest: digestJson(policy) };
        },
      ],
    ];

    for (const [label, drift] of drifts) {
      const environment = await createRuntime({
        leaseMs: 1_000,
        writableReleaseError: true,
      });
      const taskId = `wtsk_recovery_${label}_drift`;
      const initial = await environment.runtime.runTask({
        strategy: "git_worktree",
        id: taskId,
        access: "writable",
        input: null,
        handler: async (context) => {
          await writeFile(join(context.rootDir, `${label}.txt`), "drift\n");
          return {};
        },
      });
      expect(initial.status).toBe("failed");
      await waitForLeaseExpiry(environment.storage, taskId);

      const changed = new TestExecutionEnvironment(
        environment.executionEnvironment,
        { resolve: drift },
      );
      const recovered = await runtimeWithExecutionEnvironment(
        environment,
        changed,
      ).recoverTask({ runId: taskId });

      expect(recovered).toMatchObject({
        status: "failed",
        error: {
          message:
            "workspace task recovery execution environment changed after admission",
        },
      });
      expect(environment.writableIsolation.durableReleasedIds).toEqual([]);
      await expect(
        environment.storage.getWorkspaceTaskRun({ runId: taskId }),
      ).resolves.toMatchObject({ run: { state: "attention" } });
    }
  });

  it("rejects a writable task before execution when Host policy is not a worktree", async () => {
    const environment = await createRuntime();
    let called = false;
    const runtime = new WorkspaceTaskRuntime({
      rootIdentity: environment.rootIdentity,
      directIsolation: environment.readOnlyIsolation,
      gitWorktree: {
        repositoryId: "repo_task_test",
        isolation: environment.readOnlyIsolation,
        collection: environment.projection,
      },
      storage: environment.storage,
      executionEnvironment: environment.executionEnvironment,
    });
    const receipt = await runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_fixed_write",
      access: "writable",
      input: {},
      handler: () => {
        called = true;
        return {};
      },
    });

    expect(called).toBe(false);
    expect(receipt.status).toBe("failed");
    expect(receipt.error?.message).toContain(
      "isolation does not match its explicit strategy",
    );
    expect(environment.readOnlyIsolation.releasedIds).toEqual([]);
    expect(environment.writableIsolation.preparedIds).toEqual([]);
    expect((await environment.storage.getWorkspaceTaskRun({ runId: receipt.taskId }))?.run.state)
      .toBe("attention");
    expect(await readFile(join(environment.readOnlyRoot, "README.md"), "utf8")).toBe("base\n");
  });

  it("redacts the isolation path from cleanup failures", async () => {
    const environment = await createRuntime({ readOnlyReleaseError: true });
    const receipt = await environment.runtime.runTask({
      strategy: "direct",
      id: "wtsk_release_failure",
      access: "read_only",
      input: {},
      handler: () => ({}),
    });

    expect(receipt.status).toBe("failed");
    expect(receipt.error).toMatchObject({
      message: "cleanup failed at <workspace>",
      name: "Error",
    });
    expect(JSON.stringify(receipt)).not.toContain(environment.readOnlyRoot);
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_release_failure",
      }),
    ).resolves.toMatchObject({
      run: { state: "releasing", outcome: "read_only_completed" },
      activeAttempt: { state: "active" },
    });
  });

  it("stores only opaque references for a durable writable task", async () => {
    const environment = await createRuntime();
    const session = new WanexSessionCore({ storage: environment.storage });
    let executionRoot = "";
    await submitWorkspaceTaskJob(environment.storage, {
      strategy: "git_worktree",
      id: "job_workspace_task_success",
      handlerId: "create-file",
      principalId: "principal_task_test",
      access: "writable",
      input: { prompt: "create src/job.ts" },
      taskId: "wtsk_job_success",
      workspaceId: "workspace_task_test",
      agentId: "agent_job",
    });
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_success",
      leaseMs: 60_000,
      kinds: ["workspace.task"],
    });
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {
        "create-file": async (context) => {
          executionRoot = context.rootDir;
          expect(context.input).toEqual({ prompt: "create src/job.ts" });
          await mkdir(join(context.rootDir, "src"), { recursive: true });
          await writeFile(join(context.rootDir, "src/job.ts"), "job\n", "utf8");
          return {
            artifacts: [
              {
                kindOfOutput: "inline_bytes",
                bytes: new TextEncoder().encode("durable task log\n"),
                mediaType: "text/plain",
                kind: "log",
                origin: "tool_output",
                label: "durable task log",
              },
            ],
            summary: "durable handler completed",
          };
        },
      },
    });

    const result = await worker.runOnce();

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("expected completed workspace.task job");
    }
    expect(result.job.result).toMatchObject({
      taskId: "wtsk_job_success",
      status: "succeeded",
      access: "writable",
      workspaceId: "workspace_task_test",
      principalId: "principal_task_test",
      summary: "durable handler completed",
    });
    expect(result.job.result).not.toHaveProperty("lease");
    expect(result.job.result).not.toHaveProperty("released");
    expect(result.job.result).not.toHaveProperty("metadata");
    expect(JSON.stringify(result.job.result)).not.toContain(executionRoot);
    const jobResult = result.job.result as {
      readonly resourceIds: readonly string[];
      readonly changeSetId: string;
      readonly proposalId: string;
    };
    expect(jobResult.resourceIds).toHaveLength(1);
    await expect(
      environment.storage.getWorkspaceChangeSet({
        changeSetId: jobResult.changeSetId,
      }),
    ).resolves.toMatchObject({ currentState: "submitted" });
    await expect(
      environment.storage.getWorkspaceChangeProposal({
        proposalId: jobResult.proposalId,
      }),
    ).resolves.toMatchObject({ changeSetId: jobResult.changeSetId });
    await expect(stat(executionRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails a durable read-only task with a compact error result", async () => {
    const environment = await createRuntime();
    const session = new WanexSessionCore({ storage: environment.storage });
    await submitWorkspaceTaskJob(environment.storage, {
      strategy: "direct",
      id: "job_workspace_task_failure",
      handlerId: "fail-task",
      principalId: "principal_task_test",
      access: "read_only",
      input: { prompt: "inspect" },
      taskId: "wtsk_job_failure",
    });
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_failure",
      leaseMs: 60_000,
      kinds: ["workspace.task"],
    });
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {
        "fail-task": () => {
          throw new Error("durable handler failed");
        },
      },
    });

    const result = await worker.runOnce();

    expect(result.status).toBe("failed");
    if (result.status !== "failed") {
      throw new Error("expected failed workspace.task job");
    }
    expect(result.job?.lastError).toMatchObject({
      name: "WorkspaceTaskJobFailedError",
      result: {
        taskId: "wtsk_job_failure",
        status: "failed",
        access: "read_only",
        resourceIds: [],
        error: { message: "durable handler failed", name: "Error" },
      },
    });
    expect(result.job?.lastError).not.toHaveProperty("result.lease");
    expect(environment.readOnlyIsolation.releasedIds).toHaveLength(1);
  });

  it("fails a durable task when no handler is registered", async () => {
    const environment = await createRuntime();
    const session = new WanexSessionCore({ storage: environment.storage });
    await submitWorkspaceTaskJob(environment.storage, {
      strategy: "direct",
      id: "job_workspace_task_missing_handler",
      handlerId: "missing",
      principalId: "principal_task_test",
      access: "read_only",
      input: null,
    });
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_missing_handler",
      leaseMs: 60_000,
      kinds: ["workspace.task"],
    });
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: {},
    });

    const result = await worker.runOnce();

    expect(result.status).toBe("failed");
    if (result.status !== "failed") {
      throw new Error("expected failed workspace.task job");
    }
    expect(result.job?.lastError).toMatchObject({
      message: "workspace.task handler not registered: missing",
    });
  });

  it("rejects incomplete and legacy durable payloads", async () => {
    const environment = await createRuntime();
    const session = new WanexSessionCore({ storage: environment.storage });
    const worker = new WanexWorker({
      session,
      workerId: "worker_workspace_task_invalid_payload",
      leaseMs: 60_000,
      kinds: ["workspace.task"],
    });
    registerWorkspaceTaskJobHandler(worker, {
      runtime: environment.runtime,
      handlers: { unused: () => ({}) },
    });
    await environment.storage.enqueueJob({
      id: "job_workspace_task_invalid_payload",
      kind: "workspace.task",
      principalId: "principal_task_test",
      payload: { taskId: "wtsk_invalid_payload" },
    });

    const incomplete = await worker.runOnce();
    expect(incomplete.status).toBe("failed");
    if (incomplete.status !== "failed") {
      throw new Error("expected invalid workspace.task payload to fail");
    }
    expect(incomplete.job?.lastError).toMatchObject({
      message: "workspace.task.handlerId must be a string",
    });

    await environment.storage.enqueueJob({
      id: "job_workspace_task_legacy_payload",
      kind: "workspace.task",
      principalId: "principal_task_test",
      payload: {
        handlerId: "unused",
        access: "read_only",
        input: null,
        keepLease: true,
      },
    });
    const legacy = await worker.runOnce();
    expect(legacy.status).toBe("failed");
    if (legacy.status !== "failed") {
      throw new Error("expected legacy workspace.task payload to fail");
    }
    expect(legacy.job?.lastError).toMatchObject({
      message: "workspace.task payload contains unsupported field: keepLease",
    });
  });

  it("does not create an empty proposal when a writable task changes nothing", async () => {
    const environment = await createRuntime();
    const receipt = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_no_changes",
      access: "writable",
      input: {},
      handler: () => ({ summary: "inspected repository" }),
    });

    expect(receipt).toMatchObject({
      status: "succeeded",
      access: "writable",
      summary: "inspected repository",
    });
    expect(receipt.changeSet).toBeUndefined();
    expect(receipt.proposal).toBeUndefined();
    expect(environment.writableIsolation.releasedIds).toHaveLength(1);
  });

  it("keeps a writable task in attention when projection finds an unsupported file", async () => {
    const environment = await createRuntime();
    let executionRoot = "";
    const receipt = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_projection_attention",
      access: "writable",
      input: { prompt: "create image" },
      handler: async (context) => {
        executionRoot = context.rootDir;
        await writeFile(
          join(context.rootDir, "image.bin"),
          Buffer.from([0, 1, 2, 3]),
        );
        return { summary: "created image" };
      },
    });

    expect(receipt).toMatchObject({
      taskId: "wtsk_projection_attention",
      status: "failed",
      error: {
        name: "WorkspaceProjectionAttention",
        details: {
          attention: [{ code: "binary", path: "image.bin" }],
        },
      },
    });
    expect(receipt.changeSet).toBeUndefined();
    expect(receipt.proposal).toBeUndefined();
    expect(environment.writableIsolation.releasedIds).toHaveLength(0);
    await expect(stat(executionRoot)).resolves.toBeDefined();
    await expect(
      environment.storage.getWorkspaceTaskRun({
        runId: "wtsk_projection_attention",
      }),
    ).resolves.toMatchObject({
      run: {
        state: "attention",
        failure: {
          details: {
            attention: [{ code: "binary", path: "image.bin" }],
          },
        },
      },
    });
  });

  it("resumes an attention task in the original worktree with a continuation attempt", async () => {
    const environment = await createRuntime();
    let originalRoot = "";
    const initial = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_resume_attention",
      access: "writable",
      input: { prompt: "prepare an uncertain edit" },
      handler: async (context) => {
        originalRoot = context.rootDir;
        await writeFile(
          join(context.rootDir, "image.bin"),
          Buffer.from([0, 1, 2, 3]),
        );
        return { summary: "waiting for recovery" };
      },
    });

    expect(initial.error?.name).toBe("WorkspaceProjectionAttention");
    expect(environment.writableIsolation.preparedIds).toEqual([
      "wiso_" +
        createHash("sha256")
          .update(JSON.stringify([
            environment.rootIdentity.hostId, environment.rootIdentity.generationKey,
            environment.rootIdentity.rootId, environment.rootIdentity.device,
            environment.rootIdentity.inode, "wtsk_resume_attention", "git_worktree",
          ]))
          .digest("hex")
          .slice(0, 32),
    ]);

    let resumedRoot = "";
    const resumed = await environment.runtime.resumeTask({
      runId: "wtsk_resume_attention",
      input: { prompt: "continue after reviewing the uncertain edit" },
      handler: async (context) => {
        resumedRoot = context.rootDir;
        await rm(join(context.rootDir, "image.bin"));
        await writeFile(
          join(context.rootDir, "resumed.txt"),
          "continued\n",
          "utf8",
        );
        return { summary: "continued safely" };
      },
    });

    expect(resumed).toMatchObject({
      status: "succeeded",
      taskId: "wtsk_resume_attention",
      summary: "continued safely",
      changeSet: { currentState: "submitted" },
      proposal: { state: "open", summary: "continued safely" },
    });
    expect(resumedRoot).toBe(originalRoot);
    expect(environment.writableIsolation.preparedIds).toHaveLength(2);
    expect(environment.writableIsolation.preparedIds[1]).toBe(
      environment.writableIsolation.preparedIds[0],
    );
    expect(environment.writableIsolation.releasedIds).toEqual([
      environment.writableIsolation.preparedIds[0],
    ]);
    await expect(stat(originalRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      environment.storage.listWorkspaceTaskAttempts({
        runId: "wtsk_resume_attention",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ kind: "execution", state: "failed" }),
      expect.objectContaining({ kind: "continuation", state: "completed" }),
    ]);
  });

  it("parks an explicitly recoverable handler failure before collection or release", async () => {
    const environment = await createRuntime();
    let executionRoot = "";
    const parked = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_explicit_attention",
      access: "writable",
      input: { prompt: "run an uncertain tool" },
      handler: async (context) => {
        executionRoot = context.rootDir;
        await writeFile(
          join(context.rootDir, "uncertain.txt"),
          "written\n",
          "utf8",
        );
        throw new WorkspaceTaskAttentionError({
          name: "ToolOutcomeUnknown",
          message: "tool outcome could not be proven",
          details: { toolCallId: "tool_call_explicit_attention" },
        });
      },
    });

    expect(parked).toMatchObject({
      status: "failed",
      error: {
        name: "ToolOutcomeUnknown",
        message: "tool outcome could not be proven",
      },
    });
    expect(environment.writableIsolation.releasedIds).toHaveLength(0);
    await expect(stat(executionRoot)).resolves.toBeDefined();
    const parkedSnapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_explicit_attention",
    });
    expect(parkedSnapshot).toMatchObject({
      run: {
        state: "attention",
        failure: {
          type: "workspace_task.recovery_required",
          name: "ToolOutcomeUnknown",
          details: { toolCallId: "tool_call_explicit_attention" },
        },
      },
    });
    expect(parkedSnapshot?.activeAttempt).toBeUndefined();

    const resumed = await environment.runtime.resumeTask({
      runId: "wtsk_explicit_attention",
      input: { prompt: "continue after deciding the tool was successful" },
      handler: async (context) => {
        await expect(
          readFile(join(context.rootDir, "uncertain.txt"), "utf8"),
        ).resolves.toBe("written\n");
        await writeFile(
          join(context.rootDir, "confirmed.txt"),
          "confirmed\n",
          "utf8",
        );
        return { summary: "continued after explicit recovery" };
      },
    });

    expect(resumed).toMatchObject({
      status: "succeeded",
      changeSet: { currentState: "submitted" },
      proposal: { state: "open" },
    });
    expect(environment.writableIsolation.releasedIds).toHaveLength(1);
  });

  it("preserves classifiable partial edits when writable execution fails", async () => {
    const environment = await createRuntime();
    const receipt = await environment.runtime.runTask({
      strategy: "git_worktree",
      id: "wtsk_partial_failure",
      access: "writable",
      input: { prompt: "edit then fail" },
      handler: async (context) => {
        await writeFile(
          join(context.rootDir, "README.md"),
          "partial\n",
          "utf8",
        );
        throw new Error("execution stopped");
      },
    });

    expect(receipt).toMatchObject({
      status: "failed",
      error: { message: "execution stopped" },
      changeSet: { currentState: "submitted" },
      proposal: {
        state: "open",
        metadata: { executionOutcome: "failed", incomplete: true },
      },
    });
    const snapshot = await environment.storage.getWorkspaceTaskRun({
      runId: "wtsk_partial_failure",
    });
    expect(snapshot).toMatchObject({
      run: {
        state: "released",
        executionOutcome: "failed",
        outcome: "proposed",
      },
    });
  });
});

async function createRuntime(
  options: {
    readonly readOnlyReleaseError?: boolean;
    readonly writableReleaseError?: boolean;
    readonly leaseMs?: number;
    readonly childSupervisor?: ChildSupervisor;
  } = {},
): Promise<{
  readonly storage: StorageTestStore;
  readonly runtime: WorkspaceTaskRuntime;
  readonly projection: WorkspaceGitRuntime;
  readonly rootIdentity: import("@wanex/protocol").WorkspaceTaskRootIdentity;
  readonly readOnlyRoot: string;
  readonly readOnlyIsolation: RecordingIsolationAdapter;
  readonly writableIsolation: RecordingIsolationAdapter;
  readonly executionEnvironment: import("@wanex/runtime/execution").ExecutionEnvironment;
}> {
  const storeDir = await tempDir("wanex-workspace-task-store-");
  const repoDir = await createRepo();
  const worktreeParentDir = await tempDir("wanex-workspace-task-worktrees-");
  const readOnlyRoot = repoDir;
  const metadata = await stat(repoDir, { bigint: true });
  const rootIdentity = {
    hostId: "host_task_test",
    generationKey: "generation_task_test",
    rootId: "root_task_test",
    device: String(metadata.dev),
    inode: String(metadata.ino),
  };
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin,
  });
  const execution = await createWorkspaceTestExecution({
    rootDir: repoDir,
    additionalRootDirs: [worktreeParentDir],
    managedProcess: options.childSupervisor !== undefined,
    ...(options.childSupervisor === undefined
      ? {}
      : { childSupervisor: options.childSupervisor }),
  });
  const readOnlyIsolation = new RecordingIsolationAdapter(
    new FixedWorkspaceIsolationAdapter({
      rootDir: readOnlyRoot,
      fileSystem: execution.scope.fileSystem,
    }),
    options.readOnlyReleaseError === true,
  );
  const locator = new LocalRepositoryLocator({
    repositories: [
      {
        repositoryId: "repo_task_test",
        repositoryRoot: repoDir,
        worktreeParent: worktreeParentDir,
        serviceBin,
        fileSystem: execution.scope.fileSystem,
      },
    ],
  });
  const repository = await locator.locate("repo_task_test");
  const writableIsolation = new RecordingIsolationAdapter(
    new GitWorktreeIsolationAdapter({
      rootIdentity,
      repositoryId: "repo_task_test",
      locator,
      snapshot: new ProcessWorkspaceSnapshotClient(),
      executionScope: execution.scope,
    }),
    options.writableReleaseError === true,
  );
  const projection = new WorkspaceGitRuntime({
    repositoryId: "repo_task_test",
    worktreeParent: repository.worktreeParent,
    executionScope: execution.scope,
  });
  const runtime = new WorkspaceTaskRuntime({
    rootIdentity: rootIdentity,
    directIsolation: readOnlyIsolation,
    gitWorktree: {
      repositoryId: "repo_task_test",
      isolation: writableIsolation,
      collection: projection,
    },
    storage,
    workspaceId: "workspace_task_test",
    principalId: "principal_task_test",
    executionEnvironment: execution.environment,
    ...(options.leaseMs === undefined ? {} : { leaseMs: options.leaseMs }),
  });
  return {
    storage,
    runtime,
    projection,
    rootIdentity,
    readOnlyRoot,
    readOnlyIsolation,
    writableIsolation,
    executionEnvironment: execution.environment,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ready) => { resolve = ready; });
  return { promise, resolve };
}

function taskExecutionBinding(
  environment: import("@wanex/runtime/execution").ExecutionEnvironment,
  access: "read_only" | "writable",
) {
  return environment.resolveBinding({
    policy: createWorkspaceTaskExecutionPolicy(
      access,
      environment.capabilities.process.cleanup,
      environment.capabilities.isolation.enforcement,
    ),
  });
}

class RecordingIsolationAdapter implements WorkspaceIsolationAdapter {
  losePrepareResponse = false;
  loseReleaseResponse = false;
  onPrepared?: (lease: WorkspaceIsolationLease) => Promise<void>;
  readonly preparedIds: string[] = [];
  readonly releasedIds: string[] = [];
  readonly durableReleasedIds: string[] = [];
  private releaseFailurePending: boolean;

  constructor(
    private readonly delegate: WorkspaceIsolationAdapter,
    private readonly failRelease = false,
  ) {
    this.releaseFailurePending = failRelease;
  }

  async prepare(
    request: WorkspaceIsolationRequest = {},
  ): Promise<WorkspaceIsolationLease> {
    if (request.isolationId !== undefined) {
      this.preparedIds.push(request.isolationId);
    }
    const lease = await this.delegate.prepare(request);
    await this.onPrepared?.(lease);
    if (this.losePrepareResponse) {
      this.losePrepareResponse = false;
      throw new Error("prepare response lost");
    }
    return lease;
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    this.releasedIds.push(lease.id);
    if (this.releaseFailurePending) {
      this.releaseFailurePending = false;
      throw new Error(`cleanup failed at ${lease.rootDir}`);
    }
    await this.delegate.release(lease);
    if (this.loseReleaseResponse) {
      this.loseReleaseResponse = false;
      throw new Error("release response lost");
    }
  }

  async releaseDurable(
    identity: WorkspaceIsolationDurableIdentity,
  ): Promise<void> {
    this.durableReleasedIds.push(identity.id);
    await this.delegate.releaseDurable(identity);
  }
}

class TestExecutionEnvironment implements ExecutionEnvironment {
  readonly descriptor;
  readonly capabilities;
  bindCalls = 0;
  closedScopeCount = 0;

  constructor(
    private readonly delegate: ExecutionEnvironment,
    private readonly drift: {
      readonly resolve?: (
        binding: ExecutionEnvironmentBinding,
      ) => ExecutionEnvironmentBinding;
      readonly bind?: (
        binding: ExecutionEnvironmentBinding,
      ) => ExecutionEnvironmentBinding;
    },
  ) {
    this.descriptor = delegate.descriptor;
    this.capabilities = delegate.capabilities;
  }

  resolveBinding(request: {
    readonly policy: ExecutionPolicySnapshot;
  }): ExecutionEnvironmentBinding {
    const binding = this.delegate.resolveBinding(request);
    return this.drift.resolve?.(binding) ?? binding;
  }

  async bind(request: BindExecutionScopeRequest): Promise<ExecutionScope> {
    this.bindCalls += 1;
    const scope = await this.delegate.bind(request);
    let closed = false;
    return {
      binding: this.drift.bind?.(scope.binding) ?? scope.binding,
      fileSystem: scope.fileSystem,
      process: scope.process,
      close: async () => {
        if (!closed) {
          closed = true;
          this.closedScopeCount += 1;
        }
        await scope.close();
      },
    };
  }

  async close(): Promise<void> {}
}

function runtimeWithExecutionEnvironment(
  environment: Awaited<ReturnType<typeof createRuntime>>,
  executionEnvironment: ExecutionEnvironment,
): WorkspaceTaskRuntime {
  return new WorkspaceTaskRuntime({
    rootIdentity: environment.rootIdentity,
    directIsolation: environment.readOnlyIsolation,
    gitWorktree: {
      repositoryId: "repo_task_test",
      isolation: environment.writableIsolation,
      collection: environment.projection,
    },
    storage: environment.storage,
    workspaceId: "workspace_task_test",
    principalId: "principal_task_test",
    leaseMs: 1_000,
    executionEnvironment,
  });
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function ambiguousChildSupervisor(): ChildSupervisor {
  const native = new NativeChildSupervisor({ serviceBin });
  return {
    async start(request) {
      if (request.program !== process.execPath) {
        return await native.start(request);
      }
      return {
        async wait() {
          return {
            exitCode: 0,
            signal: null,
            termination: "exited",
            cleanup: "ambiguous",
            cleanupError: "test-only ambiguous cleanup",
            stdout: emptyOutput(),
            stderr: emptyOutput(),
          };
        },
        async terminate() {},
      };
    },
    async startManaged() {
      throw new Error("managed supervisor is not used in this test");
    },
  };
}

function emptyOutput() {
  return {
    bytes: new Uint8Array(),
    text: "",
    observedBytes: 0,
    retainedBytes: 0,
    truncated: false,
  };
}

async function createRepo(): Promise<string> {
  const repoDir = await tempDir("wanex-workspace-task-repo-");
  await git(repoDir, ["init"]);
  await git(repoDir, ["config", "user.email", "wanex@example.local"]);
  await git(repoDir, ["config", "user.name", "Wanex Test"]);
  await git(repoDir, ["config", "core.autocrlf", "false"]);
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8");
  await git(repoDir, ["add", "README.md"]);
  await git(repoDir, ["commit", "-m", "initial"]);
  return repoDir;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForLeaseExpiry(
  storage: StorageTestStore,
  ...runIds: readonly string[]
): Promise<void> {
  if (runIds.length === 0) {
    throw new Error("workspace task test requires at least one active lease");
  }
  const leaseExpirations = await Promise.all(
    runIds.map(async (runId) => {
      const snapshot = await storage.getWorkspaceTaskRun({ runId });
      const leaseExpiresAt = snapshot?.activeAttempt?.leaseExpiresAt;
      if (leaseExpiresAt === undefined) {
        throw new Error(`workspace task test has no active lease: ${runId}`);
      }
      return leaseExpiresAt;
    }),
  );
  const latestLeaseExpiration = Math.max(...leaseExpirations);
  while (Date.now() <= latestLeaseExpiration) {
    await wait(latestLeaseExpiration - Date.now() + 1);
  }
}

async function git(repoDir: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}
