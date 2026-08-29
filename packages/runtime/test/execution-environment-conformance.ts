import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertExecutionEnvironmentBindingEqual,
  type BindExecutionScopeRequest,
  type ChildSupervisorClaim,
  type ExecutionEnvironment,
  type ExecutionPolicySnapshot,
} from "../src/execution/index.js";

export interface ExecutionEnvironmentConformanceAdapter {
  readonly name: string;
  readonly expectedNormalCleanup: "not_required" | "completed";
  create(request: {
    readonly environmentId: string;
  }): Promise<ExecutionEnvironment> | ExecutionEnvironment;
  supervisorClaim?(scopeId: string): ChildSupervisorClaim;
}

export interface DeniedExecutionEnvironmentConformanceAdapter {
  readonly name: string;
  create(): {
    readonly environment: ExecutionEnvironment;
    readonly effects: {
      readonly filesystem: number;
      readonly process: number;
    };
  };
}

let conformanceSequence = 0;

export function runExecutionEnvironmentConformance(
  adapter: ExecutionEnvironmentConformanceAdapter,
): void {
  describe(`ExecutionEnvironment conformance: ${adapter.name}`, () => {
    let rootDir: string;
    let outsideDir: string;
    let environment: ExecutionEnvironment;

    beforeEach(async () => {
      conformanceSequence += 1;
      rootDir = await mkdtemp(join(tmpdir(), "wanex-execution-conformance-root-"));
      outsideDir = await mkdtemp(
        join(tmpdir(), "wanex-execution-conformance-outside-"),
      );
      environment = await adapter.create({
        environmentId: `conformance_${adapter.name}_${conformanceSequence}`,
      });
    });

    afterEach(async () => {
      await environment.close();
      await Promise.all([
        rm(rootDir, { recursive: true, force: true }),
        rm(outsideDir, { recursive: true, force: true }),
      ]);
    });

    it("resolves deterministic evidence and binds the exact same snapshot", async () => {
      const policy = conformancePolicy(environment);
      const first = environment.resolveBinding({ policy });
      const second = environment.resolveBinding({ policy });

      expect(second).toEqual(first);
      assertExecutionEnvironmentBindingEqual(second, first);

      const scope = await environment.bind(
        bindRequest(adapter, "deterministic", rootDir, policy),
      );
      assertExecutionEnvironmentBindingEqual(
        scope.binding,
        first,
        `${adapter.name} bound execution evidence`,
      );
      await scope.close();
    });

    it("enforces filesystem roots and process working-directory authority", async () => {
      const admittedFile = join(rootDir, "admitted.txt");
      const outsideFile = join(outsideDir, "outside.txt");
      await writeFile(admittedFile, "inside", "utf8");
      await writeFile(outsideFile, "outside", "utf8");
      const scope = await environment.bind(
        bindRequest(adapter, "authority", rootDir, conformancePolicy(environment)),
      );

      expect(
        Buffer.from(await scope.fileSystem.read(admittedFile)).toString("utf8"),
      ).toBe("inside");
      await expect(scope.fileSystem.read(outsideFile)).rejects.toThrow(
        /outside admitted roots/,
      );
      const result = await scope.process.execute({
        program: process.execPath,
        args: ["-e", "process.stdout.write('conformant')"],
        cwd: rootDir,
      });
      expect(result).toMatchObject({
        termination: "exited",
        exitCode: 0,
        cleanup: adapter.expectedNormalCleanup,
        stdout: { text: "conformant" },
      });
      await expect(
        scope.process.execute({
          program: process.execPath,
          args: ["-e", "process.stdout.write('forbidden')"],
          cwd: outsideDir,
        }),
      ).rejects.toThrow(/outside admitted roots/);
      await scope.close();
    });

    it("settles cancellation with truthful cleanup evidence", async () => {
      const marker = join(rootDir, "cancel-started.txt");
      const scope = await environment.bind(
        bindRequest(adapter, "cancel", rootDir, conformancePolicy(environment)),
      );
      const controller = new AbortController();
      const execution = scope.process.execute({
        program: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1],'started');setInterval(()=>{},1000)",
          marker,
        ],
        cwd: rootDir,
        signal: controller.signal,
      });
      await waitForFile(marker);

      controller.abort();

      await expect(execution).resolves.toMatchObject({
        termination: "cancelled",
        cleanup: "completed",
      });
      await scope.close();
    });

    it("closes owned work and revokes scope and environment ports", async () => {
      const marker = join(rootDir, "close-started.txt");
      const policy = conformancePolicy(environment);
      const scope = await environment.bind(
        bindRequest(adapter, "close", rootDir, policy),
      );
      const execution = scope.process.execute({
        program: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1],'started');setInterval(()=>{},1000)",
          marker,
        ],
        cwd: rootDir,
      });
      await waitForFile(marker);

      await scope.close();

      await expect(execution).resolves.toMatchObject({
        termination: "cancelled",
        cleanup: "completed",
      });
      await expect(scope.fileSystem.metadata(rootDir)).rejects.toMatchObject({
        name: "ExecutionScopeClosedError",
      });
      await environment.close();
      await expect(
        environment.bind(bindRequest(adapter, "closed", rootDir, policy)),
      ).rejects.toMatchObject({ name: "ExecutionEnvironmentClosedError" });
    });
  });
}

export function runDeniedExecutionEnvironmentConformance(
  adapter: DeniedExecutionEnvironmentConformanceAdapter,
): void {
  describe(`ExecutionEnvironment denied-provider conformance: ${adapter.name}`, () => {
    it("fails admission before filesystem or process effects", async () => {
      const rootDir = await mkdtemp(
        join(tmpdir(), "wanex-execution-denied-conformance-"),
      );
      const { environment, effects } = adapter.create();
      const policy = conformancePolicy(environment);
      try {
        expect(() => environment.resolveBinding({ policy })).toThrow(
          /provider denied execution admission/,
        );
        await expect(
          environment.bind({
            scopeId: "denied_conformance",
            policy,
            fileSystemRoots: [{ id: "workspace", path: rootDir }],
          }),
        ).rejects.toThrow(/provider denied execution admission/);
        expect(effects).toEqual({ filesystem: 0, process: 0 });
      } finally {
        await environment.close();
        await rm(rootDir, { recursive: true, force: true });
      }
    });
  });
}

function conformancePolicy(
  environment: ExecutionEnvironment,
): ExecutionPolicySnapshot {
  return {
    revision: 1,
    filesystem: {
      roots: [
        {
          id: "workspace",
          effects: ["create", "read", "remove", "write"],
        },
      ],
      maxReadBytes: 1024 * 1024,
      maxDirectoryEntries: 1_000,
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: environment.capabilities.process.cleanup,
      environmentVariables: [],
    },
    network: "unrestricted",
    isolation: "none",
    pty: false,
  };
}

function bindRequest(
  adapter: ExecutionEnvironmentConformanceAdapter,
  suffix: string,
  rootDir: string,
  policy: ExecutionPolicySnapshot,
): BindExecutionScopeRequest {
  const scopeId = `scope_${adapter.name}_${suffix}_${conformanceSequence}`;
  return {
    scopeId,
    policy,
    fileSystemRoots: [{ id: "workspace", path: rootDir }],
    ...(adapter.supervisorClaim === undefined
      ? {}
      : { supervisorClaim: adapter.supervisorClaim(scopeId) }),
  };
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await readFile(path);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`execution conformance marker was not created: ${path}`);
}
