import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  MacosSeatbeltExecutionEnvironment,
  type BindExecutionScopeRequest,
  type ExecutionCapabilitySnapshot,
  type ExecutionEnvironment,
  type ExecutionEnvironmentBinding,
  type ExecutionEnvironmentDescriptor,
  type ExecutionPolicySnapshot,
  type ExecutionScope,
} from "../src/execution/index.js";
import {
  runDeniedExecutionEnvironmentConformance,
  runExecutionEnvironmentConformance,
} from "./execution-environment-conformance.js";

const serviceBin = new URL(
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url,
).pathname;

runExecutionEnvironmentConformance({
  name: "native_direct",
  expectedNormalCleanup: "not_required",
  create: ({ environmentId }) =>
    new NativeExecutionEnvironment({
      environmentId,
      strategy: { kind: "direct" },
      terminationGraceMs: 30,
      cleanupTimeoutMs: 1_000,
    }),
});

runExecutionEnvironmentConformance({
  name: "native_supervised",
  expectedNormalCleanup: "completed",
  create: ({ environmentId }) =>
    new NativeExecutionEnvironment({
      environmentId,
      strategy: {
        kind: "supervised",
        childSupervisor: new NativeChildSupervisor({ serviceBin }),
      },
      terminationGraceMs: 30,
      cleanupTimeoutMs: 1_000,
    }),
  supervisorClaim: (scopeId) => ({
    runId: `run_${scopeId}`,
    attemptId: `attempt_${scopeId}`,
    claimToken: "c".repeat(64),
  }),
});

if (process.platform === "darwin") {
  runExecutionEnvironmentConformance({
    name: "macos_seatbelt",
    expectedNormalCleanup: "completed",
    create: ({ environmentId }) =>
      new MacosSeatbeltExecutionEnvironment({
        environmentId,
        childSupervisor: new NativeChildSupervisor({ serviceBin }),
        nativeEnvironmentFactory: (options) => new NativeExecutionEnvironment(options),
        terminationGraceMs: 30,
        cleanupTimeoutMs: 1_000,
      }),
    supervisorClaim: (scopeId) => ({
      runId: `run_${scopeId}`,
      attemptId: `attempt_${scopeId}`,
      claimToken: "c".repeat(64),
    }),
  });
}

runDeniedExecutionEnvironmentConformance({
  name: "denied_fake",
  create: () => {
    const effects = { filesystem: 0, process: 0 };
    return {
      environment: new DeniedExecutionEnvironment(effects),
      effects,
    };
  },
});

class DeniedExecutionEnvironment implements ExecutionEnvironment {
  readonly descriptor: ExecutionEnvironmentDescriptor = {
    revision: 1,
    environmentId: "denied_fake",
    providerId: "wanex.execution.denied-test",
    providerRevision: "1",
    kind: "denied-test",
  };
  readonly capabilities: ExecutionCapabilitySnapshot = {
    revision: 1,
    isolation: { enforcement: "none" },
    filesystem: { enforcement: "library_guard", effects: [] },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree",
    },
    pty: { supported: false },
    network: { enforcement: "none" },
    secretProjection: { supported: false },
    artifactExport: { supported: false },
  };

  constructor(
    private readonly effects: { filesystem: number; process: number },
  ) {}

  resolveBinding(_request: {
    readonly policy: ExecutionPolicySnapshot;
  }): ExecutionEnvironmentBinding {
    throw new Error("provider denied execution admission");
  }

  async bind(request: BindExecutionScopeRequest): Promise<ExecutionScope> {
    this.resolveBinding({ policy: request.policy });
    this.effects.filesystem += 1;
    this.effects.process += 1;
    throw new Error("denied provider performed an effect after admission");
  }

  async close(): Promise<void> {}
}
