import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  reviewedNativeLaunchEnvironment,
  type ChildSupervisor,
  type ExecutionEnvironment,
  type ExecutionPolicySnapshot,
  type ExecutionProcess,
  type ExecutionScope,
  type ManagedExecutionEvent,
  type NativeExecutionEnvironmentOptions,
} from "../src/execution/index.js";
import { terminateProcessTree } from "../src/execution/process-tree.js";

const tempDirs: string[] = [];
const environments = new Set<ExecutionEnvironment>();
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);

afterEach(async () => {
  await Promise.allSettled(
    [...environments].map(async (environment) => await environment.close()),
  );
  environments.clear();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@wanex/runtime/execution", () => {
  it("projects only reviewed native launch variables", () => {
    expect(
      reviewedNativeLaunchEnvironment({
        PATH: "/reviewed/bin",
        HOME: "/reviewed/home",
        WANEX_PRIVATE_TOKEN: "must-not-leak",
      }),
    ).toEqual({
      PATH: "/reviewed/bin",
      HOME: "/reviewed/home",
    });
    expect(() =>
      reviewedNativeLaunchEnvironment(
        {},
        {
          WANEX_PRIVATE_TOKEN: "must-not-leak",
        },
      ),
    ).toThrow("native launch environment variable is not reviewed");
  });

  it("does not inherit an ambient Host credential", async () => {
    const cwd = await tempDir();
    const previous = process.env.WANEX_PRIVATE_TOKEN;
    process.env.WANEX_PRIVATE_TOKEN = "ambient-secret";
    try {
      const result = await (
        await directExecutionProcess(cwd)
      ).execute({
        program: process.execPath,
        args: [
          "-e",
          "process.stdout.write(process.env.WANEX_PRIVATE_TOKEN ?? 'absent')",
        ],
        cwd,
      });
      expect(result.stdout.text).toBe("absent");
    } finally {
      if (previous === undefined) delete process.env.WANEX_PRIVATE_TOKEN;
      else process.env.WANEX_PRIVATE_TOKEN = previous;
    }
  });

  it("fails closed when native policy requests unavailable capabilities", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_unsupported_policy",
        strategy: { kind: "direct" },
      }),
    );
    let bindSequence = 0;
    const bind = async (
      policy: ExecutionPolicySnapshot,
    ): Promise<ExecutionScope> =>
      await environment.bind({
        scopeId: `scope_unsupported_${++bindSequence}`,
        policy,
        fileSystemRoots: [{ id: "workspace", path: cwd }],
      });

    await expect(
      bind(executionPolicy({ isolation: "os" })),
    ).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "isolation.os",
    });
    await expect(
      bind(executionPolicy({ network: "denied" })),
    ).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "network.denied",
    });
    await expect(bind(executionPolicy({ pty: true }))).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "pty",
    });
    await expect(
      bind(
        executionPolicy({
          process: { managed: true },
        }),
      ),
    ).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "process.managed",
    });
    await expect(
      bind(
        executionPolicy({
          process: { cleanup: "durable_supervisor" },
        }),
      ),
    ).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "process.durable_supervisor",
    });
  });

  it("requires process working directories to belong to the bound filesystem roots", async () => {
    const root = await tempDir();
    const outside = await tempDir();
    const scope = await directExecutionScope(root);

    await expect(
      scope.process.execute({
        program: process.execPath,
        args: ["-e", "process.stdout.write('unexpected')"],
        cwd: outside,
      }),
    ).rejects.toThrow("outside admitted roots");
  });

  it.runIf(process.platform !== "win32")(
    "rejects filesystem traversal and symlinks that leave admitted roots",
    async () => {
      const root = await tempDir();
      const outside = await tempDir();
      const secret = join(outside, "secret.txt");
      const link = join(root, "outside-link.txt");
      await writeFile(secret, "secret", "utf8");
      await symlink(secret, link);
      const scope = await directExecutionScope(root);

      await expect(scope.fileSystem.read(secret)).rejects.toThrow(
        "outside admitted roots",
      );
      await expect(scope.fileSystem.read(link)).rejects.toThrow(
        "outside admitted roots",
      );
      await expect(scope.fileSystem.metadata(link)).rejects.toThrow(
        "outside admitted roots",
      );
    },
  );

  it("reads only an admitted bounded file range", async () => {
    const root = await tempDir();
    const path = join(root, "range.txt");
    await writeFile(path, "0123456789", "utf8");
    const scope = await directExecutionScope(root);

    await expect(
      scope.fileSystem.readRange(path, {
        offset: 3,
        length: 4,
      }),
    ).resolves.toEqual(Uint8Array.from(Buffer.from("3456")));
    await expect(
      scope.fileSystem.readRange(path, {
        offset: 8,
        length: 8,
      }),
    ).resolves.toEqual(Uint8Array.from(Buffer.from("89")));
    await expect(
      scope.fileSystem.readRange(path, {
        offset: -1,
        length: 1,
      }),
    ).rejects.toThrow("offset must be a non-negative safe integer");
  });

  it("enforces one-shot and managed process policy at the process port", async () => {
    const cwd = await tempDir();
    const scope = await directExecutionScope(cwd, {
      oneShot: false,
      managed: true,
      managedProcess: true,
    });

    await expect(
      scope.process.execute({
        program: process.execPath,
        cwd,
      }),
    ).rejects.toMatchObject({
      name: "UnsupportedExecutionCapabilityError",
      capability: "process.oneShot",
    });
  });

  it("streams a bounded managed process and settles EOF", async () => {
    const cwd = await tempDir();
    const scope = await directExecutionScope(cwd, {
      oneShot: false,
      managed: true,
      managedProcess: true,
      maxStdinBytes: 8,
    });
    const managed = await scope.process.start({
      program: process.execPath,
      args: [
        "-e",
        "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{process.stdout.write('reply:'+s);process.stderr.write('warn')})",
      ],
      cwd,
      output: { stdoutBytes: 64, stderrBytes: 16 },
    });

    await managed.write("hello");
    await expect(managed.write("123456789")).rejects.toThrow(
      "managed process stdin exceeds limit",
    );
    await managed.write("!");
    await managed.closeInput();
    const result = await managed.wait();
    const events = await collectManagedEvents(managed.events);

    expect(result).toMatchObject({
      termination: "exited",
      exitCode: 0,
      cleanup: "not_required",
      stdout: { text: "reply:hello!" },
      stderr: { text: "warn" },
    });
    expect(
      Buffer.concat(
        events
          .filter((event) => event.type === "stdout")
          .map((event) => Buffer.from(event.bytes)),
      ).toString("utf8"),
    ).toBe("reply:hello!");
    expect(events.at(-1)?.type).toBe("terminal");
  });

  it("streams a supervised managed process with durable cleanup evidence", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_supervised_managed",
        strategy: {
          kind: "supervised",
          childSupervisor: new NativeChildSupervisor({ serviceBin }),
        },
        managedProcess: true,
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000,
      }),
    );
    const scope = await environment.bind({
      scopeId: "scope_supervised_managed",
      policy: executionPolicy({
        process: {
          oneShot: false,
          managed: true,
          cleanup: "durable_supervisor",
        },
      }),
      fileSystemRoots: [{ id: "workspace", path: cwd }],
      supervisorClaim: {
        runId: "run_supervised_managed",
        attemptId: "attempt_supervised_managed",
        claimToken: "c".repeat(64),
      },
    });
    const managed = await scope.process.start({
      program: process.execPath,
      args: [
        "-e",
        "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{process.stdout.write('reply:'+s);process.stderr.write('warn')})",
      ],
      cwd,
      output: { stdoutBytes: 64, stderrBytes: 16 },
    });

    await managed.write("hello");
    await managed.write("!");
    await managed.closeInput();
    const result = await managed.wait();
    const events = await collectManagedEvents(managed.events);

    expect(result).toMatchObject({
      termination: "exited",
      exitCode: 0,
      cleanup: "completed",
      stdout: { text: "reply:hello!" },
      stderr: { text: "warn" },
    });
    expect(
      Buffer.concat(
        events
          .filter((event) => event.type === "stdout")
          .map((event) => Buffer.from(event.bytes)),
      ).toString("utf8"),
    ).toBe("reply:hello!");
    expect(events.at(-1)?.type).toBe("terminal");
  });

  it.runIf(process.platform !== "win32")(
    "runs an interactive process through a supervised PTY", async () => {
      const cwd = await tempDir();
      const environment = registerEnvironment(
        new NativeExecutionEnvironment({
          environmentId: "native_supervised_pty",
          strategy: {
            kind: "supervised",
            childSupervisor: new NativeChildSupervisor({ serviceBin }),
          },
          managedProcess: true,
          terminationGraceMs: 30,
          cleanupTimeoutMs: 1_000,
        }),
      );
      const scope = await environment.bind({
        scopeId: "scope_supervised_pty",
        policy: executionPolicy({
          pty: true,
          process: {
            oneShot: false,
            managed: true,
            cleanup: "durable_supervisor",
          },
        }),
        fileSystemRoots: [{ id: "workspace", path: cwd }],
        supervisorClaim: {
          runId: "run_supervised_pty",
          attemptId: "attempt_supervised_pty",
          claimToken: "p".repeat(64),
        },
      });

      expect(environment.capabilities.pty.supported).toBe(true);
      expect(scope.terminal).toBeDefined();
      const terminal = await scope.terminal!.start({
        program: process.execPath,
        args: [
          "-e",
          "process.stdout.write('tty:'+String(Boolean(process.stdin.isTTY))+':'+String(Boolean(process.stdout.isTTY))+'\\n');process.stdin.on('data',data=>{process.stdout.write('echo:'+data.toString());if(data.toString().includes('finish'))process.exit(0)})",
        ],
        cwd,
        size: { columns: 80, rows: 24 },
        outputBytes: 4_096,
      });
      const eventsPromise = collectTerminalEvents(terminal.events);

      await terminal.write("hello\n");
      await terminal.resize({ columns: 100, rows: 40 });
      await terminal.write("finish\n");
      const result = await terminal.wait();
      const events = await eventsPromise;

      expect(result).toMatchObject({
        termination: "exited",
        exitCode: 0,
        cleanup: "completed",
        output: { truncated: false },
      });
      expect(result.output.text).toContain("tty:true:true");
      expect(result.output.text).toContain("echo:hello");
      expect(result.output.text).toContain("echo:finish");
      expect(events.at(-1)?.type).toBe("terminal");
      await scope.close();
    },
  );

  it.runIf(process.platform !== "win32")(
    "closes an active PTY when its execution scope closes", async () => {
      const cwd = await tempDir();
      const environment = registerEnvironment(
        new NativeExecutionEnvironment({
          environmentId: "native_supervised_pty_close",
          strategy: {
            kind: "supervised",
            childSupervisor: new NativeChildSupervisor({ serviceBin }),
          },
          managedProcess: true,
          terminationGraceMs: 30,
          cleanupTimeoutMs: 1_000,
        }),
      );
      const scope = await environment.bind({
        scopeId: "scope_supervised_pty_close",
        policy: executionPolicy({
          pty: true,
          process: {
            oneShot: false,
            managed: true,
            cleanup: "durable_supervisor",
          },
        }),
        fileSystemRoots: [{ id: "workspace", path: cwd }],
        supervisorClaim: {
          runId: "run_supervised_pty_close",
          attemptId: "attempt_supervised_pty_close",
          claimToken: "q".repeat(64),
        },
      });
      const terminal = await scope.terminal!.start({
        program: process.execPath,
        args: ["-e", "process.stdin.on('data',()=>{});setInterval(()=>{},1000)"],
        cwd,
        size: { columns: 80, rows: 24 },
        outputBytes: 1_024,
      });

      await scope.close();

      await expect(terminal.wait()).resolves.toMatchObject({
        termination: "cancelled",
        cleanup: "completed",
      });
    },
  );

  it("bounds queued managed output even when events are consumed after exit", async () => {
    const cwd = await tempDir();
    const scope = await directExecutionScope(cwd, {
      managed: true,
      managedProcess: true,
    });
    const managed = await scope.process.start({
      program: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(10000))"],
      cwd,
      output: { stdoutBytes: 32, stderrBytes: 0 },
    });

    const result = await managed.wait();
    const events = await collectManagedEvents(managed.events);
    const streamedBytes = events
      .filter((event) => event.type === "stdout")
      .reduce((sum, event) => sum + event.bytes.byteLength, 0);

    expect(streamedBytes).toBe(32);
    expect(result.stdout).toMatchObject({
      observedBytes: 10_000,
      retainedBytes: 32,
      truncated: true,
    });
  });

  it("rejects an already aborted managed request before spawning", async () => {
    const cwd = await tempDir();
    const marker = join(cwd, "managed-spawned.txt");
    const scope = await directExecutionScope(cwd, {
      managed: true,
      managedProcess: true,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      scope.process.start({
        program: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1],'spawned')",
          marker,
        ],
        cwd,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "ExecutionAbortedError" });
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("closes active scope processes before revoking every scope port", async () => {
    const cwd = await tempDir();
    const pidFile = join(cwd, "scope-close.pid");
    const scope = await directExecutionScope(cwd);
    const execution = scope.process.execute({
      program: process.execPath,
      args: [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        pidFile,
      ],
      cwd,
    });
    const pid = await waitForPositivePidFile(pidFile);

    await scope.close();
    await expect(execution).resolves.toMatchObject({
      termination: "cancelled",
      cleanup: "completed",
    });
    await expectProcessGone(pid);
    await expect(scope.fileSystem.metadata(cwd)).rejects.toMatchObject({
      name: "ExecutionScopeClosedError",
    });
    await expect(
      scope.process.execute({
        program: process.execPath,
        cwd,
      }),
    ).rejects.toMatchObject({ name: "ExecutionScopeClosedError" });
  });

  it("closing an environment closes borrowed scopes and rejects future binds", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_environment_close",
        strategy: { kind: "direct" },
      }),
    );
    const scope = await environment.bind({
      scopeId: "scope_environment_close",
      policy: executionPolicy(),
      fileSystemRoots: [{ id: "workspace", path: cwd }],
    });

    await environment.close();
    await expect(scope.fileSystem.metadata(cwd)).rejects.toMatchObject({
      name: "ExecutionScopeClosedError",
    });
    await expect(
      environment.bind({
        scopeId: "scope_after_environment_close",
        policy: executionPolicy(),
        fileSystemRoots: [{ id: "workspace", path: cwd }],
      }),
    ).rejects.toMatchObject({ name: "ExecutionEnvironmentClosedError" });
  });

  it("reserves active scope identities until their scope closes", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_scope_identity",
        strategy: { kind: "direct" },
      }),
    );
    const request = {
      scopeId: "scope_unique",
      policy: executionPolicy(),
      fileSystemRoots: [{ id: "workspace", path: cwd }],
    } as const;
    const first = await environment.bind(request);

    await expect(environment.bind(request)).rejects.toThrow(
      "execution scopeId is already active",
    );
    await first.close();
    const reused = await environment.bind(request);
    await reused.close();
  });

  it("rejects overlapping physical roots instead of resolving effects by order", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_overlapping_roots",
        strategy: { kind: "direct" },
      }),
    );
    const policy = executionPolicy();

    await expect(
      environment.bind({
        scopeId: "scope_overlapping_roots",
        policy: {
          ...policy,
          filesystem: {
            ...policy.filesystem,
            roots: [
              { id: "first", effects: ["read"] },
              { id: "second", effects: ["write"] },
            ],
          },
        },
        fileSystemRoots: [
          { id: "first", path: cwd },
          { id: "second", path: cwd },
        ],
      }),
    ).rejects.toThrow("execution filesystem roots overlap: first, second");
  });

  it("drains an in-flight bind before environment close settles", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_pending_bind",
        strategy: { kind: "direct" },
      }),
    );
    const binding = environment.bind({
      scopeId: "scope_pending_bind",
      policy: executionPolicy(),
      fileSystemRoots: [{ id: "workspace", path: cwd }],
    });
    const closing = environment.close();

    await expect(binding).rejects.toMatchObject({
      name: "ExecutionEnvironmentClosedError",
    });
    await expect(closing).resolves.toBeUndefined();
  });

  it("does not report an ordinary bind admission failure as a close failure", async () => {
    const cwd = await tempDir();
    const environment = registerEnvironment(
      new NativeExecutionEnvironment({
        environmentId: "native_failed_pending_bind",
        strategy: { kind: "direct" },
      }),
    );
    const binding = environment.bind({
      scopeId: "scope_failed_pending_bind",
      policy: executionPolicy(),
      fileSystemRoots: [{ id: "workspace", path: join(cwd, "missing") }],
    });
    const closing = environment.close();

    await expect(binding).rejects.toMatchObject({ code: "ENOENT" });
    await expect(closing).resolves.toBeUndefined();
  });

  it("executes argv without a shell and uses explicit stdin and environment", async () => {
    const cwd = await tempDir();
    const host = await directExecutionProcess(cwd, {
      terminationGraceMs: 20,
      cleanupTimeoutMs: 500,
      environmentVariables: ["WANEX_MARK"],
    });
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(process.env.WANEX_MARK+':'+s))",
      ],
      cwd,
      environment: { WANEX_MARK: "explicit" },
      stdin: "payload",
    });

    expect(result).toMatchObject({
      exitCode: 0,
      termination: "exited",
      cleanup: "not_required",
    });
    expect(result.stdout).toMatchObject({
      text: "explicit:payload",
      truncated: false,
    });
  });

  it("retains bounded head and tail output with truthful byte counts", async () => {
    const cwd = await tempDir();
    const host = await directExecutionProcess(cwd);
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "process.stdout.write('A'.repeat(100));process.stdout.write('B'.repeat(100));process.stderr.write('E'.repeat(80))",
      ],
      cwd,
      output: { stdoutBytes: 64, stderrBytes: 20 },
    });

    expect(result.stdout).toMatchObject({
      text: `${"A".repeat(32)}${"B".repeat(32)}`,
      observedBytes: 200,
      retainedBytes: 64,
      truncated: true,
    });
    expect(result.stderr).toMatchObject({
      text: "E".repeat(20),
      observedBytes: 80,
      retainedBytes: 20,
      truncated: true,
    });
  });

  it.runIf(process.platform !== "win32")(
    "kills the process group including a grandchild on timeout",
    async () => {
      const cwd = await tempDir();
      const host = await directExecutionProcess(cwd, {
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000,
      });
      const result = await host.execute({
        program: process.execPath,
        args: ["-e", processTreeFixture],
        cwd,
        timeoutMs: 1_000,
        output: { stdoutBytes: 256 },
      });

      expect(result, result.cleanupError).toMatchObject({
        termination: "timed_out",
        cleanup: "completed",
      });
      const pids = processTreePids(result.stdout.text);
      await expectProcessGone(pids.root);
      await expectProcessGone(pids.grandchild);
    },
  );

  it.runIf(process.platform !== "win32")(
    "uses final process-group evidence after a transient signal error",
    async () => {
      const cwd = await tempDir();
      const pidFile = join(cwd, "transient-signal-process-tree.json");
      const controller = new AbortController();
      const host = await directExecutionProcess(cwd, {
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000,
      });
      const execution = host.execute({
        program: process.execPath,
        args: ["-e", stubbornProcessTreeFixture, pidFile],
        cwd,
        signal: controller.signal,
        output: { stdoutBytes: 256 },
      });
      let pids: { readonly root: number; readonly grandchild: number };
      try {
        pids = await waitForProcessTreePidFile(pidFile);
      } catch (error) {
        controller.abort();
        await execution.catch(() => undefined);
        throw error;
      }
      const kill = process.kill.bind(process);
      let injected = false;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((pid: number, signal?: string | number) => {
          const result = kill(pid, signal);
          if (!injected && pid < 0 && signal === "SIGTERM") {
            injected = true;
            throw Object.assign(new Error("injected transient signal error"), {
              code: "EPERM",
            });
          }
          return result;
        });
      let result;
      try {
        controller.abort();
        result = await execution;
      } finally {
        killSpy.mockRestore();
      }

      expect(injected).toBe(true);
      expect(result, result.cleanupError).toMatchObject({
        termination: "cancelled",
        cleanup: "completed",
      });
      await expectProcessGone(pids.root);
      await expectProcessGone(pids.grandchild);
    },
  );

  it.runIf(process.platform !== "win32")(
    "accepts process-group cleanup proof before root close notification",
    async () => {
      const cwd = await tempDir();
      const child = spawn(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        {
          cwd,
          detached: true,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const pid = child.pid;
      if (pid === undefined) {
        throw new Error("process-group cleanup fixture has no pid");
      }

      try {
        await terminateProcessTree({
          child,
          platform: process.platform,
          graceMs: 30,
          cleanupTimeoutMs: 1_000,
          async waitForClose() {
            return false;
          },
          windowsTreeTerminator: {
            async terminate() {
              throw new Error("unexpected Windows process terminator");
            },
          },
        });

        await expectProcessGone(pid);
      } finally {
        killProcessGroupBestEffort(pid);
        await waitForChildClose(child);
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "cleans remaining process-group members after the root exits",
    async () => {
      const cwd = await tempDir();
      const pidFile = join(cwd, "exited-root-process-tree.json");
      const child = spawn(
        process.execPath,
        ["-e", exitingRootProcessTreeFixture, pidFile],
        {
          cwd,
          detached: true,
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const pids = await waitForProcessTreePidFile(pidFile);
      await waitForChildClose(child);

      try {
        expect(isProcessAlive(pids.grandchild)).toBe(true);
        await terminateProcessTree({
          child,
          platform: process.platform,
          graceMs: 30,
          cleanupTimeoutMs: 1_000,
          async waitForClose() {
            return true;
          },
          windowsTreeTerminator: {
            async terminate() {
              throw new Error("unexpected Windows process terminator");
            },
          },
        });
        await expectProcessGone(pids.grandchild);
      } finally {
        killProcessGroupBestEffort(pids.root);
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "kills the Windows process tree including a grandchild on timeout",
    async () => {
      const cwd = await tempDir();
      const host = await directExecutionProcess(cwd, {
        terminationGraceMs: 30,
        cleanupTimeoutMs: 5_000,
      });
      const result = await host.execute({
        program: process.execPath,
        args: ["-e", processTreeFixture],
        cwd,
        timeoutMs: 1_000,
        output: { stdoutBytes: 256 },
      });

      expect(result).toMatchObject({
        termination: "timed_out",
        cleanup: "completed",
      });
      const pids = processTreePids(result.stdout.text);
      await expectProcessGone(pids.root);
      await expectProcessGone(pids.grandchild);
    },
  );

  it("cancels an active process before returning", async () => {
    const cwd = await tempDir();
    const pidFile = join(cwd, "active-process.pid");
    const controller = new AbortController();
    const host = await directExecutionProcess(cwd, {
      terminationGraceMs: 250,
      cleanupTimeoutMs: 2_000,
    });
    const execution = host.execute({
      program: process.execPath,
      args: [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)",
        pidFile,
      ],
      cwd,
      signal: controller.signal,
    });
    let pid: number;
    try {
      pid = await waitForPositivePidFile(pidFile);
    } catch (error) {
      controller.abort();
      await execution.catch(() => undefined);
      throw error;
    }
    controller.abort();
    const result = await execution;

    expect(result, result.cleanupError).toMatchObject({
      termination: "cancelled",
      cleanup: "completed",
    });
    await expectProcessGone(pid);
  });

  it("delegates Windows cancellation to the tree terminator", async () => {
    const cwd = await tempDir();
    const terminated: number[] = [];
    const host = await directExecutionProcess(cwd, {
      platform: "win32",
      cleanupTimeoutMs: 1_000,
      terminationGraceMs: 20,
      windowsTreeTerminator: {
        async terminate(pid) {
          terminated.push(pid);
          process.kill(pid, "SIGKILL");
        },
      },
    });
    const result = await host.execute({
      program: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      cwd,
      timeoutMs: 50,
    });

    expect(result).toMatchObject({
      termination: "timed_out",
      cleanup: "completed",
    });
    expect(terminated).toHaveLength(1);
    await expectProcessGone(terminated[0]!);
  });

  it("fails before spawn for an already aborted request", async () => {
    const cwd = await tempDir();
    const controller = new AbortController();
    controller.abort();
    const host = await directExecutionProcess(cwd);

    await expect(
      host.execute({
        program: process.execPath,
        cwd,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "ExecutionAbortedError" });
  });

  it("executes through the native child supervisor with bounded evidence", async () => {
    const cwd = await tempDir();
    const host = await supervisedExecutionProcess(cwd);
    const result = await host.execute({
      program: process.execPath,
      args: [
        "-e",
        "process.stdout.write('A'.repeat(50)+'Z'.repeat(50));process.stderr.write('B'.repeat(20)+'Y'.repeat(20))",
      ],
      cwd,
      output: { stdoutBytes: 20, stderrBytes: 10 },
    });

    expect(result).toMatchObject({
      exitCode: 0,
      signal: null,
      termination: "exited",
      cleanup: "completed",
    });
    expect(result.stdout).toMatchObject({
      text: `${"A".repeat(10)}${"Z".repeat(10)}`,
      observedBytes: 100,
      retainedBytes: 20,
      truncated: true,
    });
    expect(result.stderr).toMatchObject({
      text: `${"B".repeat(5)}${"Y".repeat(5)}`,
      observedBytes: 40,
      retainedBytes: 10,
      truncated: true,
    });
  });

  it("streams retained native output across the protocol frame limit", async () => {
    const cwd = await tempDir();
    const retainedBytes = 2 * 1024 * 1024;
    const result = await (
      await supervisedExecutionProcess(cwd)
    ).execute({
      program: process.execPath,
      args: [
        "-e",
        `process.stdout.write('A'.repeat(${retainedBytes / 2})+'Z'.repeat(${retainedBytes / 2}))`,
      ],
      cwd,
      output: { stdoutBytes: retainedBytes },
    });

    expect(result).toMatchObject({
      exitCode: 0,
      termination: "exited",
      cleanup: "completed",
    });
    expect(result.stdout).toMatchObject({
      observedBytes: retainedBytes,
      retainedBytes,
      truncated: false,
    });
    expect(result.stdout.text.startsWith("A".repeat(64))).toBe(true);
    expect(result.stdout.text.endsWith("Z".repeat(64))).toBe(true);
  });

  it("uses native process ownership to clean descendants on timeout", async () => {
    const cwd = await tempDir();
    const result = await (
      await supervisedExecutionProcess(cwd)
    ).execute({
      program: process.execPath,
      args: ["-e", processTreeFixture],
      cwd,
      timeoutMs: 300,
      output: { stdoutBytes: 256 },
    });

    expect(result).toMatchObject({
      termination: "timed_out",
      cleanup: "completed",
    });
    const pids = processTreePids(result.stdout.text);
    await expectProcessGone(pids.root);
    await expectProcessGone(pids.grandchild);
  });

  it("uses native process ownership to clean descendants on cancellation", async () => {
    const cwd = await tempDir();
    const pidFile = join(cwd, "native-cancel-process-tree.json");
    const controller = new AbortController();
    const execution = (await supervisedExecutionProcess(cwd)).execute({
      program: process.execPath,
      args: ["-e", processTreeFixture, pidFile],
      cwd,
      signal: controller.signal,
      output: { stdoutBytes: 256 },
    });
    let pids: { readonly root: number; readonly grandchild: number };
    try {
      pids = await waitForProcessTreePidFile(pidFile);
    } catch (error) {
      controller.abort();
      await execution.catch(() => undefined);
      throw error;
    }
    controller.abort();
    const result = await execution;

    expect(result, result.cleanupError).toMatchObject({
      termination: "cancelled",
      cleanup: "completed",
    });
    await expectProcessGone(pids.root);
    await expectProcessGone(pids.grandchild);
  });

  it("redacts transient program and cwd when native spawn fails", async () => {
    const cwd = await tempDir();
    const program = join(cwd, "secret-program-that-does-not-exist");

    await expect(
      (await supervisedExecutionProcess(cwd)).execute({
        program,
        cwd,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return !message.includes(program) && !message.includes(cwd);
    });
  });

  it("requires recovery when a started helper exits without terminal evidence", async () => {
    const cwd = await tempDir();
    const program = join(cwd, "private-program");
    let terminateCalls = 0;
    const supervisor: ChildSupervisor = {
      async start() {
        return {
          async wait() {
            throw new Error(`untrusted helper diagnostic ${program}`);
          },
          async terminate() {
            terminateCalls += 1;
          },
        };
      },
      async startManaged() {
        throw new Error("managed supervisor is not used in this test");
      },
    };
    const host = await supervisedExecutionProcess(cwd, {
      childSupervisor: supervisor,
    });

    await expect(host.execute({ program, cwd })).rejects.toMatchObject({
      name: "ExecutionCleanupRequiredError",
      message: "execution process tree cleanup could not be proven",
    });
    expect(terminateCalls).toBe(1);
  });

  it("settles owned child cleanup when the Host control pipe closes", async () => {
    const cwd = await tempDir();
    const helper = spawn(serviceBin, ["--workspace-child"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const frames = lineFrames(helper.stdout);
    const claimToken = "a".repeat(64);
    const identity = {
      run_id: "wtsk_pipe_eof",
      attempt_id: "wtat_pipe_eof",
      child_id: "exch_pipe_eof",
      claim_token_sha256: createHash("sha256").update(claimToken).digest("hex"),
    };
    helper.stdin.write(
      `${JSON.stringify({
        protocol: 1,
        kind: "workspace_child_start",
        ...identity,
        program: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
        cwd,
        environment: { PATH: process.env.PATH ?? "" },
        stdin_mode: "closed",
        stdin_base64: "",
        stdout_limit_bytes: 256,
        stderr_limit_bytes: 256,
        termination_grace_ms: 30,
      })}\n`,
    );
    expect(await frames.next()).toMatchObject({
      kind: "workspace_child_ready",
      ...identity,
    });
    helper.stdin.end();
    const terminal = await nextFrameOfKind(frames, "workspace_child_terminal");
    expect(terminal).toMatchObject({
      kind: "workspace_child_terminal",
      termination: "pipe_eof",
      cleanup: "completed",
      ...identity,
    });
    await waitForChildClose(helper);
  });

  it("keeps different supervisor claims isolated while cancelling one child", async () => {
    const cwd = await tempDir();
    const firstController = new AbortController();
    const first = (
      await claimedExecutionProcess(cwd, "run_first", "attempt_first")
    ).execute({
      program: process.execPath,
      args: ["-e", processTreeFixture],
      cwd,
      signal: firstController.signal,
      output: { stdoutBytes: 256 },
    });
    const second = (
      await claimedExecutionProcess(cwd, "run_second", "attempt_second")
    ).execute({
      program: process.execPath,
      args: [
        "-e",
        "setTimeout(()=>process.stdout.write('second-complete'),600)",
      ],
      cwd,
      output: { stdoutBytes: 64 },
    });
    setTimeout(() => firstController.abort(), 300);

    await expect(first).resolves.toMatchObject({
      termination: "cancelled",
      cleanup: "completed",
    });
    await expect(second).resolves.toMatchObject({
      termination: "exited",
      cleanup: "completed",
      stdout: { text: "second-complete" },
    });
  });
});

const processTreeFixture = [
  "const {spawn}=require('node:child_process')",
  "const {renameSync,writeFileSync}=require('node:fs')",
  "const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true})",
  "const pids={root:process.pid,grandchild:grandchild.pid}",
  "if(process.argv[1]){writeFileSync(process.argv[1]+'.tmp',JSON.stringify(pids));renameSync(process.argv[1]+'.tmp',process.argv[1])}",
  "process.stdout.write(JSON.stringify(pids)+'\\n')",
  "setInterval(()=>{},1000)",
].join(";");

const stubbornProcessTreeFixture =
  "process.on('SIGTERM',()=>{});" + processTreeFixture;

const exitingRootProcessTreeFixture = [
  "const {spawn}=require('node:child_process')",
  "const {renameSync,writeFileSync}=require('node:fs')",
  "const grandchild=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true})",
  "grandchild.unref()",
  "const pids={root:process.pid,grandchild:grandchild.pid}",
  "writeFileSync(process.argv[1]+'.tmp',JSON.stringify(pids))",
  "renameSync(process.argv[1]+'.tmp',process.argv[1])",
].join(";");

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-execution-host-"));
  tempDirs.push(dir);
  return dir;
}

async function waitForPositivePidFile(path: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return positivePid((await readFile(path, "utf8")).trim(), "root");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("active process did not publish its pid");
}

async function waitForProcessTreePidFile(
  path: string,
): Promise<{ readonly root: number; readonly grandchild: number }> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return processTreePids(await readFile(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("process tree fixture did not publish its pids");
}

async function expectProcessGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        return;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`process ${pid} is still alive`);
}

function killProcessGroupBestEffort(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function processTreePids(output: string): {
  readonly root: number;
  readonly grandchild: number;
} {
  const parsed = JSON.parse(output.trim()) as {
    readonly root?: unknown;
    readonly grandchild?: unknown;
  };
  return {
    root: positivePid(parsed.root, "root"),
    grandchild: positivePid(parsed.grandchild, "grandchild"),
  };
}

function positivePid(value: unknown, name: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`process tree fixture returned invalid ${name} pid`);
  }
  return number;
}

async function directExecutionProcess(
  root: string,
  options: Pick<
    NativeExecutionEnvironmentOptions,
    | "terminationGraceMs"
    | "cleanupTimeoutMs"
    | "platform"
    | "windowsTreeTerminator"
  > & { readonly environmentVariables?: readonly string[] } = {},
): Promise<ExecutionProcess> {
  return await bindExecutionProcess(root, {
    strategy: { kind: "direct" },
    options,
    cleanup: "runtime_process_tree",
  });
}

async function directExecutionScope(
  root: string,
  options: {
    readonly oneShot?: boolean;
    readonly managed?: boolean;
    readonly managedProcess?: boolean;
    readonly maxStdinBytes?: number;
  } = {},
): Promise<ExecutionScope> {
  const environment = registerEnvironment(
    new NativeExecutionEnvironment({
      environmentId: `native_scope_test_${environments.size + 1}`,
      strategy: { kind: "direct" },
      ...(options.managedProcess === undefined
        ? {}
        : { managedProcess: options.managedProcess }),
      ...(options.maxStdinBytes === undefined
        ? {}
        : { maxStdinBytes: options.maxStdinBytes }),
    }),
  );
  return await environment.bind({
    scopeId: `scope_direct_test_${environments.size}`,
    policy: executionPolicy({
      process: {
        oneShot: options.oneShot ?? true,
        managed: options.managed ?? false,
      },
    }),
    fileSystemRoots: [{ id: "workspace", path: root }],
  });
}

function executionPolicy(
  options: {
    readonly isolation?: ExecutionPolicySnapshot["isolation"];
    readonly network?: ExecutionPolicySnapshot["network"];
    readonly pty?: boolean;
    readonly process?: Partial<ExecutionPolicySnapshot["process"]>;
  } = {},
): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [
        {
          id: "workspace",
          effects: ["read", "write", "create", "remove"],
        },
      ],
      maxReadBytes: 1024 * 1024,
      maxDirectoryEntries: 1024,
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree",
      environmentVariables: [],
      ...options.process,
    },
    network: options.network ?? "unrestricted",
    isolation: options.isolation ?? "none",
    pty: options.pty ?? false,
  };
}

function registerEnvironment<T extends ExecutionEnvironment>(
  environment: T,
): T {
  environments.add(environment);
  return environment;
}

async function collectManagedEvents(
  events: AsyncIterable<ManagedExecutionEvent>,
): Promise<readonly ManagedExecutionEvent[]> {
  const collected: ManagedExecutionEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

async function collectTerminalEvents(
  events: AsyncIterable<import("../src/execution/index.js").ExecutionTerminalEvent>,
): Promise<readonly import("../src/execution/index.js").ExecutionTerminalEvent[]> {
  const collected: import("../src/execution/index.js").ExecutionTerminalEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

async function supervisedExecutionProcess(
  root: string,
  options: {
    readonly childSupervisor?: ChildSupervisor;
    readonly supervisorClaim?: import("../src/execution/index.js").ChildSupervisorClaim;
  } = {},
): Promise<ExecutionProcess> {
  return await bindExecutionProcess(root, {
    strategy: {
      kind: "supervised",
      childSupervisor:
        options.childSupervisor ?? new NativeChildSupervisor({ serviceBin }),
    },
    options: {
      terminationGraceMs: 30,
      cleanupTimeoutMs: 1_000,
      managedProcess: true,
    },
    cleanup: "durable_supervisor",
    ...(options.supervisorClaim === undefined
      ? {}
      : { supervisorClaim: options.supervisorClaim }),
  });
}

async function claimedExecutionProcess(
  root: string,
  runId: string,
  attemptId: string,
): Promise<ExecutionProcess> {
  return await supervisedExecutionProcess(root, {
    supervisorClaim: {
      runId,
      attemptId,
      claimToken: "b".repeat(64),
    },
  });
}

async function bindExecutionProcess(
  root: string,
  input: {
    readonly strategy: NativeExecutionEnvironmentOptions["strategy"];
    readonly options: Pick<
      NativeExecutionEnvironmentOptions,
      | "terminationGraceMs"
      | "cleanupTimeoutMs"
      | "platform"
      | "windowsTreeTerminator"
    > & {
      readonly environmentVariables?: readonly string[];
      readonly managedProcess?: boolean;
    };
    readonly cleanup: "runtime_process_tree" | "durable_supervisor";
    readonly supervisorClaim?: import("../src/execution/index.js").ChildSupervisorClaim;
  },
): Promise<ExecutionProcess> {
  const environment = new NativeExecutionEnvironment({
    environmentId: `native_test_${environments.size + 1}`,
    strategy: input.strategy,
    ...input.options,
  });
  environments.add(environment);
  const scope = await environment.bind({
    scopeId: `scope_test_${environments.size}`,
    policy: {
      revision: 1,
      filesystem: {
        roots: [
          { id: "workspace", effects: ["read", "write", "create", "remove"] },
        ],
        maxReadBytes: 1024 * 1024,
        maxDirectoryEntries: 1024,
      },
      process: {
        oneShot: true,
        managed: false,
        cleanup: input.cleanup,
        environmentVariables: input.options.environmentVariables ?? [],
      },
      network: "unrestricted",
      isolation: "none",
      pty: false,
    },
    fileSystemRoots: [{ id: "workspace", path: root }],
    ...(input.supervisorClaim === undefined
      ? {}
      : { supervisorClaim: input.supervisorClaim }),
  });
  return scope.process;
}

function lineFrames(stream: NodeJS.ReadableStream): {
  next(): Promise<Record<string, unknown>>;
} {
  let buffer = "";
  let terminalError: Error | undefined;
  const queued: Record<string, unknown>[] = [];
  const waiters: Array<{
    resolve(frame: Record<string, unknown>): void;
    reject(error: Error): void;
  }> = [];
  const finish = (error: Error) => {
    if (terminalError !== undefined) return;
    terminalError = error;
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  };
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(line) as Record<string, unknown>;
      } catch (cause) {
        finish(
          new Error("workspace child emitted an invalid protocol frame", {
            cause,
          }),
        );
        return;
      }
      const waiter = waiters.shift();
      if (waiter === undefined) queued.push(frame);
      else waiter.resolve(frame);
    }
  });
  stream.once("end", () => {
    finish(
      new Error("workspace child protocol stream ended before the next frame"),
    );
  });
  stream.once("error", (cause) => {
    finish(new Error("workspace child protocol stream failed", { cause }));
  });
  return {
    async next() {
      const frame = queued.shift();
      if (frame !== undefined) return frame;
      if (terminalError !== undefined) throw terminalError;
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
  };
}

async function nextFrameOfKind(
  frames: { next(): Promise<Record<string, unknown>> },
  kind: string,
): Promise<Record<string, unknown>> {
  while (true) {
    const frame = await frames.next();
    if (frame.kind === kind) {
      return frame;
    }
  }
}

async function waitForChildClose(
  child: ReturnType<typeof spawn>,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("workspace child helper did not close")),
      2_000,
    );
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
