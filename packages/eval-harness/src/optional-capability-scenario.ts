import { join } from "node:path"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  FakeProviderAdapter,
  type ProviderRequest
} from "@wanex/runtime/provider"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  ToolRegistry
} from "@wanex/runtime/tools"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

export const optionalCapabilityTurnBindingScenario = createEvalScenario({
  id: "optional-capability.turn-binding",
  title: "Optional tools preserve exact executable evidence across recovery",
  tags: ["runtime", "tool", "recovery", "optional-capability"],
  async run(context) {
    const successStoreDir = join(context.storeDir, "optional-capability-success")
    const successful = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: successStoreDir,
        serviceBin: context.serviceBin
      },
      provider: new FakeProviderAdapter({
        responseText: "optional capability complete",
        toolName: "optional_echo"
      }),
      tools: optionalTools("1"),
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })
    let admittedRevision: string
    try {
      const submitted = await successful.submitUserTurn({
        sessionId: "ses_eval_optional_capability_success",
        content: [{ type: "text", text: "use the optional tool" }],
        maxSteps: 4
      })
      const run = await successful.runOnce()
      assert(
        run.results[0]?.worker.status === "completed",
        "stable optional capability should complete"
      )
      const turns = await successful.storage.listSessionTurns({
        sessionId: submitted.session.id
      })
      const snapshot = turns[0]?.executionBinding.toolSnapshot
      admittedRevision = snapshotRevision(snapshot)
      assert(admittedRevision === "1", "turn must freeze optional tool revision 1")
      const executions = await successful.storage.listToolExecutions({
        sessionId: submitted.session.id
      })
      assert(executions.length === 1, "optional tool must execute exactly once")
      assert(
        executionRevision(executions[0]?.descriptor) === admittedRevision,
        "durable tool execution must retain admitted implementation evidence"
      )
    } finally {
      await successful.dispose()
    }

    const driftStoreDir = join(context.storeDir, "optional-capability-drift")
    const admissionHost = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: driftStoreDir,
        serviceBin: context.serviceBin
      },
      provider: new FakeProviderAdapter({
        responseText: "must not dispatch",
        toolName: "optional_echo"
      }),
      tools: optionalTools("1"),
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })
    try {
      await admissionHost.submitUserTurn({
        sessionId: "ses_eval_optional_capability_drift",
        content: [{ type: "text", text: "recover with exact capability" }],
        maxSteps: 4
      })
    } finally {
      await admissionHost.dispose()
    }

    const driftProvider = new CountingFakeProvider({
      responseText: "must not dispatch",
      toolName: "optional_echo"
    })
    const recoveryHost = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: driftStoreDir,
        serviceBin: context.serviceBin
      },
      provider: driftProvider,
      tools: optionalTools("2"),
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })
    try {
      const run = await recoveryHost.runOnce()
      assert(
        run.results[0]?.worker.status === "failed",
        "changed optional capability revision must fail closed"
      )
      assert(
        driftProvider.calls === 0,
        "capability drift must fail before provider dispatch"
      )
      const executions = await recoveryHost.storage.listToolExecutions({
        sessionId: "ses_eval_optional_capability_drift"
      })
      assert(
        executions.length === 0,
        "capability drift must fail before tool invocation"
      )
      return {
        admittedRevision,
        driftRevision: "2",
        driftStatus: run.results[0]?.worker.status ?? "missing",
        providerDispatchesAfterDrift: driftProvider.calls,
        toolExecutionsAfterDrift: executions.length
      }
    } finally {
      await recoveryHost.dispose()
    }
  }
})

function optionalTools(revision: string): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name: "optional_echo",
    description: "Return optional capability input.",
    inputSchema: { type: "object", additionalProperties: true },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.eval.optional-echo",
      implementationRevision: revision,
      configuration: { mode: "eval" }
    }),
    async invoke(invocation) {
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({ echoed: invocation.input })
      }
    }
  })
  return registry
}

function snapshotRevision(snapshot: unknown): string {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.tools)) {
    throw new Error("turn tool snapshot is missing")
  }
  const first = snapshot.tools[0]
  if (!isRecord(first) || !isRecord(first.runtimeBinding)) {
    throw new Error("turn tool runtime binding is missing")
  }
  const revision = first.runtimeBinding.implementationRevision
  if (typeof revision !== "string") {
    throw new Error("turn tool implementation revision is missing")
  }
  return revision
}

function executionRevision(descriptor: unknown): string {
  if (!isRecord(descriptor) || !isRecord(descriptor.runtimeBinding)) {
    throw new Error("durable tool execution runtime binding is missing")
  }
  const revision = descriptor.runtimeBinding.implementationRevision
  if (typeof revision !== "string") {
    throw new Error("durable tool implementation revision is missing")
  }
  return revision
}

class CountingFakeProvider extends FakeProviderAdapter {
  calls = 0

  override async *stream(request: ProviderRequest) {
    this.calls += 1
    yield* super.stream(request)
  }
}
