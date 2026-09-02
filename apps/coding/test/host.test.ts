import { mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { WorkspaceChangeTransactionFilePlan } from "@wanex/protocol"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  fakeModelDescriptor,
  FakeProviderAdapter,
  modelEndpointConfigKey,
  modelEndpointToJson
} from "@wanex/runtime/provider"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type AgentRuntimeExecutionStage
} from "@wanex/runtime/execution"
import { createCodingHost } from "../src/host/start.js"
import type { CodingHost } from "../src/host/types.js"
import { resolveCodingExecutionEnvironmentId } from "../src/host/execution/environment.js"
import {
  codingApplicationScope,
  codingTurnOrigin
} from "../src/host/execution/scope.js"
import { codingStartDigest } from "../src/host/repository/admission.js"
import { codingRepositoryIdentity } from "../src/host/repository/identity.js"
import { spawnWorkspaceTransaction } from "@wanex/workspace/transaction"
import { createWorkspaceTaskExecutionPolicy } from "@wanex/workspace/tasks"
import {
  ApprovalRequiredWorkspacePolicy,
  BlockingProvider,
  ConcurrentBlockingProvider,
  CodingHostTestScope,
  EditThenBlockProvider,
  WorkspaceEditProvider,
  executionOptions,
  git,
  serviceBin,
  sha256,
  waitForApproval,
  waitForLeaseExpiry
} from "./support.js"

let scope: CodingHostTestScope

beforeEach(() => {
  scope = new CodingHostTestScope()
})

afterEach(async () => {
  await scope.dispose()
})

async function codingTaskExecutionBinding(
  storage: Awaited<ReturnType<CodingHostTestScope["createEnvironment"]>>["storage"],
  access: "read_only" | "writable"
) {
  const environmentId = await resolveCodingExecutionEnvironmentId(storage)
  const environment = new NativeExecutionEnvironment({
    environmentId,
    managedProcess: true,
    strategy: {
      kind: "supervised",
      childSupervisor: new NativeChildSupervisor({ serviceBin })
    }
  })
  try {
    return environment.resolveBinding({
      policy: createWorkspaceTaskExecutionPolicy(
        access,
        environment.capabilities.process.cleanup,
        environment.capabilities.isolation.enforcement
      )
    })
  } finally {
    await environment.close()
  }
}

describe("trusted coding host repository lifecycle", () => {
  it("attaches an exact active retry and rejects a conflicting idempotency key", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new BlockingProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        idempotencyKey: "host-active-retry",
        content: [{ type: "text", text: "wait for one execution" }]
      })
      await provider.started

      await expect(host.readDiagnostics()).resolves.toMatchObject({
        state: "open",
        repositories: [{
          repositoryId: repository.repositoryId,
          state: "open",
          runtime: {
            started: true,
            workerCount: 1,
            activeLoopCount: 1,
            settlement: {
              pendingCount: 1,
              pendingReferences: [first.reference],
            },
          },
          activeTurns: [{
            reference: first.reference,
            stage: "settlement_wait",
            modelEndpointResolution: "missing",
            runtimeStage: "provider_invocation_started",
            inputPresent: true,
            userMessagePresent: true,
            providerInvocationCount: 1,
            latestProviderInvocationState: "dispatched",
            tools: {
              state: "available",
              returnedCount: 0,
              truncated: false,
              items: [],
            },
            task: { present: true, state: "active", attemptState: "active" },
            job: { present: true, state: "running", attempt: 1, leasePresent: true },
            turn: { present: true, state: "running", attemptState: "running" },
          }],
        }],
      })

      const duplicate = repository.startTurn({
        idempotencyKey: "host-active-retry",
        content: [{ type: "text", text: "wait for one execution" }]
      })
      expect(duplicate).toBe(first)
      expect(() => repository.startTurn({
        idempotencyKey: "host-active-retry",
        content: [{ type: "text", text: "changed execution" }]
      })).toThrowError(/idempotency key was reused/)

      await duplicate.cancel("stop active retry test")
      await expect(first.result).resolves.toMatchObject({
        turnState: "cancelled"
      })
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 20_000)

  it("diagnoses a Turn blocked before durable Runtime submission", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new WorkspaceEditProvider()
    let releaseEndpoint!: () => void
    const endpointGate = new Promise<void>((resolve) => {
      releaseEndpoint = resolve
    })
    let endpointResolutionStarted!: () => void
    const endpointStarted = new Promise<void>((resolve) => {
      endpointResolutionStarted = resolve
    })
    const execution = {
      ...executionOptions(provider, {
        toolPermissionPolicy: new AllowAllToolsPolicy()
      }),
      resolveModelEndpointId: async () => {
        endpointResolutionStarted()
        await endpointGate
        return undefined
      }
    }
    const host = await environment.start(execution)
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const operation = repository.startTurn({
        idempotencyKey: "host-endpoint-diagnostics",
        content: [{ type: "text", text: "diagnose before submission" }]
      })
      await endpointStarted

      await expect(host.readDiagnostics()).resolves.toMatchObject({
        repositories: [{
          runtime: {
            started: false,
            settlement: { pendingCount: 1, pendingReferences: [operation.reference] },
          },
          activeTurns: [{
            reference: operation.reference,
            stage: "model_endpoint_resolve",
            modelEndpointResolution: "not_started",
            inputPresent: true,
            userMessagePresent: false,
            providerInvocationCount: 0,
            tools: {
              state: "available",
              returnedCount: 0,
              truncated: false,
              items: [],
            },
            task: { present: true, state: "active", attemptState: "active" },
            job: { present: false },
            turn: { present: false },
          }],
        }],
      })

      releaseEndpoint()
      await expect(operation.result).resolves.toMatchObject({
        turnState: "succeeded"
      })
    } finally {
      releaseEndpoint()
      await host.close()
      await environment.dispose()
    }
  }, 20_000)

  it("attaches an exact active retry from an independent Coding Host", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const firstProvider = new BlockingProvider()
    const firstHost = await environment.start(executionOptions(firstProvider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    const firstRepository = await firstHost.openRepository({
      repositoryPath: repositoryRoot
    })
    const first = firstRepository.startTurn({
      idempotencyKey: "host-cross-process-attach",
      content: [{ type: "text", text: "wait for one durable operation" }]
    })
    await firstProvider.started

    const secondProvider = new WorkspaceEditProvider()
    const secondHost = await environment.start(executionOptions(secondProvider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const secondRepository = await secondHost.openRepository({
        repositoryPath: repositoryRoot
      })
      const attached = secondRepository.startTurn({
        idempotencyKey: "host-cross-process-attach",
        content: [{ type: "text", text: "wait for one durable operation" }]
      })
      expect(attached).not.toBe(first)
      await attached.cancel("cancel the canonical operation from the observer")

      const [firstReceipt, attachedReceipt] = await Promise.all([
        first.result,
        attached.result
      ])
      expect(attachedReceipt).toEqual(firstReceipt)
      expect(firstReceipt).toMatchObject({
        reference: attached.reference,
        turnState: "cancelled"
      })
      expect(secondProvider.calls).toBe(0)
    } finally {
      await secondHost.close()
      await firstHost.close()
      await environment.dispose()
    }
  }, 30_000)

  it("continues a lost pre-submit admission only when no Turn or Job exists", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const identity = codingRepositoryIdentity(await realpath(repositoryRoot))
    const idempotencyKey = "host-admission-recovery"
    const operationDigest = sha256(
      `${identity.repositoryId}\0<new-session>\0${idempotencyKey}`
    )
    const sessionDigest = sha256(`${identity.repositoryId}\0${idempotencyKey}`)
    const taskId = `wtsk_coding_${operationDigest}`
    const reference = {
      repositoryId: identity.repositoryId,
      taskId,
      sessionId: `ses_coding_${sessionDigest}`,
      inputId: `inp_coding_${operationDigest}`,
      turnId: `turn_coding_${operationDigest}`,
      jobId: `job_coding_${operationDigest}`
    }
    const request = {
      idempotencyKey,
      content: [{ type: "text" as const, text: "recover one coding admission" }]
    }
    const applicationScope = codingApplicationScope({
      repositoryId: identity.repositoryId,
      workspaceId: identity.workspaceId,
      taskId: reference.taskId
    })
    await environment.storage.createSession({
      id: reference.sessionId,
      kind: "agent",
      scope: { kind: "coding.repository", id: identity.repositoryId }
    })
    await environment.storage.admitSessionInput({
      id: reference.inputId,
      sessionId: reference.sessionId,
      principalId: "coding-agent",
      idempotencyKey,
      content: [{ type: "text", id: "user_text_0", text: request.content[0]!.text }],
      origin: codingTurnOrigin(applicationScope, codingStartDigest(request)),
      inputType: "user",
      intent: "normal"
    })
    const executionEnvironment = await codingTaskExecutionBinding(
      environment.storage,
      "writable"
    )
    const claimToken = "coding-admission-recovery-token-abcdefghijklmnopqrstuvwxyz"
    await environment.storage.beginWorkspaceTaskRun({
      id: reference.taskId,
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      access: "writable",
      repositoryId: identity.repositoryId,
      isolationId: `wiso_${sha256(
        `${identity.repositoryId}\0${reference.taskId}`
      ).slice(0, 32)}`,
      executionEnvironment,
      jobId: reference.jobId,
      agentId: "coding-agent",
      attemptId: "wtat_coding_admission_recovery",
      ownerId: "coding-lost-owner",
      claimToken,
      leaseMs: 60_000
    })
    await environment.storage.markWorkspaceTaskAttention({
      runId: reference.taskId,
      attemptId: "wtat_coding_admission_recovery",
      claimToken,
      failure: {
        type: "workspace_task.recovery_required",
        message: "owner lost before Session Turn submission"
      }
    })

    const provider = new WorkspaceEditProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const operation = repository.startTurn(request)
      const result = await operation.result
      expect(result).toMatchObject({
        reference,
        turnState: "succeeded",
        task: { status: "succeeded" }
      })
      await expect(
        environment.storage.listSessionInputs({ sessionId: reference.sessionId })
      ).resolves.toHaveLength(1)
      await expect(
        environment.storage.listSessionTurns({ sessionId: reference.sessionId })
      ).resolves.toHaveLength(1)
      await expect(
        environment.storage.listWorkspaceTaskRuns({ runIds: [reference.taskId] })
      ).resolves.toHaveLength(1)
      expect(provider.calls).toBe(2)
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)

  it("replays a settled operation without creating another task or provider execution", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new WorkspaceEditProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        idempotencyKey: "host-settled-retry",
        content: [{ type: "text", text: "create replayed file" }]
      })
      const firstReceipt = await first.result
      const duplicate = repository.startTurn({
        idempotencyKey: "host-settled-retry",
        content: [{ type: "text", text: "create replayed file" }]
      })
      const duplicateReceipt = await duplicate.result

      expect(duplicate.reference).toEqual(first.reference)
      expect(duplicateReceipt.task.status).toBe("succeeded")
      expect(provider.calls).toBe(2)
      await expect(environment.storage.listWorkspaceTaskRuns({
        repositoryId: repository.repositoryId
      })).resolves.toHaveLength(1)
      expect(firstReceipt.task.proposalId).toBe(duplicateReceipt.task.proposalId)
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 20_000)

  it("replays durable admission after host replacement and rejects model drift", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const firstProvider = new WorkspaceEditProvider()
    const firstHost = await environment.start(executionOptions(firstProvider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    const firstRepository = await firstHost.openRepository({
      repositoryPath: repositoryRoot
    })
    const first = firstRepository.startTurn({
      idempotencyKey: "host-restart-replay",
      content: [{ type: "text", text: "create a durable replay file" }]
    })
    await expect(first.result).resolves.toMatchObject({
      turnState: "succeeded"
    })
    await firstHost.close()

    const secondProvider = new WorkspaceEditProvider()
    const secondHost = await environment.start(executionOptions(secondProvider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const secondRepository = await secondHost.openRepository({
        repositoryPath: repositoryRoot
      })
      const replay = secondRepository.startTurn({
        idempotencyKey: "host-restart-replay",
        content: [{ type: "text", text: "create a durable replay file" }]
      })
      await expect(replay.result).resolves.toMatchObject({
        reference: first.reference,
        task: { status: "succeeded" }
      })
      expect(secondProvider.calls).toBe(0)

      const changedModel = secondRepository.startTurn({
        idempotencyKey: "host-restart-replay",
        modelEndpointId: "coding.changed.model",
        content: [{ type: "text", text: "create a durable replay file" }]
      })
      await expect(changedModel.result).rejects.toMatchObject({
        code: "invalid_request"
      })
      expect(secondProvider.calls).toBe(0)
    } finally {
      await secondHost.close()
      await environment.dispose()
    }
  }, 20_000)

  it("resolves the current model endpoint once per Turn and freezes its binding", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const endpointA = {
      id: "coding.endpoint.a",
      connection: {
        id: "coding.connection.a",
        providerId: "coding-fake-a"
      },
      protocol: { id: "fake" as const },
      model: fakeModelDescriptor("coding-model-a")
    }
    const endpointB = {
      id: "coding.endpoint.b",
      connection: {
        id: "coding.connection.b",
        providerId: "coding-fake-b"
      },
      protocol: { id: "fake" as const },
      model: fakeModelDescriptor("coding-model-b")
    }
    await environment.storage.putConfig(
      modelEndpointConfigKey(endpointA.id),
      modelEndpointToJson(endpointA)
    )
    await environment.storage.putConfig(
      modelEndpointConfigKey(endpointB.id),
      modelEndpointToJson(endpointB)
    )
    let selected = endpointA.id
    const resolutions: Array<Record<string, string | undefined>> = []
    const host = await environment.start({
      ...executionOptions(
        new FakeProviderAdapter({
          providerId: "coding-fallback",
          model: fakeModelDescriptor("coding-fallback-model"),
          responseText: "fallback"
        }),
        { toolPermissionPolicy: new AllowAllToolsPolicy() }
      ),
      resolveModelEndpointId(request) {
        resolutions.push({
          repositoryId: request.repositoryId,
          sessionId: request.sessionId,
          inputId: request.inputId,
          turnId: request.turnId,
          jobId: request.jobId,
          requestedModelEndpointId: request.requestedModelEndpointId
        })
        return selected
      }
    })
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        idempotencyKey: "host-model-first",
        content: [{ type: "text", text: "use endpoint a" }]
      })
      await expect(first.result).resolves.toMatchObject({
        turnState: "succeeded"
      })
      const firstTurn = await environment.storage.getSessionTurn(first.reference.turnId)
      expect(firstTurn?.executionBinding.modelEndpoint.endpointId).toBe(endpointA.id)

      selected = endpointB.id
      const second = repository.startTurn({
        idempotencyKey: "host-model-second",
        sessionId: first.reference.sessionId,
        modelEndpointId: endpointA.id,
        content: [{ type: "text", text: "use endpoint b" }]
      })
      await expect(second.result).resolves.toMatchObject({
        turnState: "succeeded"
      })
      const secondTurn = await environment.storage.getSessionTurn(second.reference.turnId)
      expect(secondTurn?.executionBinding.modelEndpoint.endpointId).toBe(endpointB.id)
      expect(resolutions).toHaveLength(2)
      expect(resolutions[0]).toMatchObject({
        repositoryId: repository.repositoryId,
        sessionId: first.reference.sessionId,
        inputId: first.reference.inputId,
        turnId: first.reference.turnId,
        jobId: first.reference.jobId
      })
      expect(resolutions[1]).toMatchObject({
        repositoryId: repository.repositoryId,
        sessionId: second.reference.sessionId,
        inputId: second.reference.inputId,
        turnId: second.reference.turnId,
        jobId: second.reference.jobId,
        requestedModelEndpointId: endpointA.id
      })
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 15_000)

  it("rejects ambiguous static and dynamic model selection", async () => {
    const environment = await scope.createEnvironment()
    try {
      await expect(
        environment.start({
          ...executionOptions(
            new FakeProviderAdapter({
              responseText: "unused"
            }),
            { toolPermissionPolicy: new AllowAllToolsPolicy() }
          ),
          modelEndpointId: "coding.static",
          resolveModelEndpointId: () => "coding.dynamic"
        })
      ).rejects.toThrow(
        "coding execution cannot combine a static model endpoint with a resolver"
      )
    } finally {
      await environment.dispose()
    }
  })

  it("deduplicates a canonical repository and exposes only opaque state", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const nested = join(repositoryRoot, "src", "nested")
    await mkdir(nested, { recursive: true })
    const host = await environment.start()

    try {
      const [first, second] = await Promise.all([
        host.openRepository({ repositoryPath: repositoryRoot }),
        host.openRepository({ repositoryPath: nested })
      ])

      expect(second).toBe(first)
      expect(first.repositoryId).toMatch(/^repo_[a-f0-9]{40}$/)
      expect(first).toMatchObject({
        state: "open",
        sharedCheckoutReady: true,
        recovery: {
          transaction: "clean",
          tasks: {
            attempted: 0,
            released: 0,
            attention: 0,
            skipped: 0,
            failed: 0,
            remaining: false,
            entries: [],
            diagnostics: []
          }
        }
      })

      const serialized = JSON.stringify({ host, repository: first })
      expect(serialized).not.toContain(repositoryRoot)
      expect(serialized).not.toContain(environment.dataDir)
      expect(serialized).not.toContain(serviceBin)
      expect(serialized).not.toContain("transport")
      expect(serialized).not.toContain("storage")

      await first.close()
      await first.close()
      expect(first.state).toBe("closed")

      const reopened = await host.openRepository({
        repositoryPath: repositoryRoot
      })
      expect(reopened).not.toBe(first)
      expect(reopened.repositoryId).toBe(first.repositoryId)
    } finally {
      await host.close()
      await host.close()
      await environment.dispose()
    }
  })

  it("rejects untrusted paths and repository/data overlap with fixed codes", async () => {
    const environment = await scope.createEnvironment()
    await expect(
      createCodingHost({
        dataDir: "relative-data",
        storage: {
          kind: "injected",
          handle: environment.storageHandle
        },
        artifacts: { explicitPath: serviceBin }
      })
    ).rejects.toMatchObject({ code: "invalid_data_directory" })

    const host = await environment.start()
    const ordinaryDirectory = await scope.tempDir("wanex-coding-not-repo-")
    try {
      await expect(
        host.openRepository({ repositoryPath: "relative-repository" })
      ).rejects.toMatchObject({ code: "repository_unavailable" })
      await expect(
        host.openRepository({ repositoryPath: ordinaryDirectory })
      ).rejects.toMatchObject({ code: "repository_invalid" })
    } finally {
      await host.close()
    }

    const repositoryRoot = await scope.createRepository()
    const overlappingHost = await createCodingHost({
      dataDir: join(repositoryRoot, ".host-data"),
      storage: {
        kind: "injected",
        handle: environment.storageHandle
      },
      artifacts: { explicitPath: serviceBin }
    })
    try {
      await expect(
        overlappingHost.openRepository({ repositoryPath: repositoryRoot })
      ).rejects.toMatchObject({ code: "repository_data_overlap" })
    } finally {
      await overlappingHost.close()
    }

    const containingDataDir = await scope.tempDir("wanex-coding-containing-data-")
    const containedRepository = await scope.createRepository(containingDataDir)
    const containingHost = await createCodingHost({
      dataDir: containingDataDir,
      storage: {
        kind: "injected",
        handle: environment.storageHandle
      },
      artifacts: { explicitPath: serviceBin }
    })
    try {
      await expect(
        containingHost.openRepository({ repositoryPath: containedRepository })
      ).rejects.toMatchObject({ code: "repository_data_overlap" })
    } finally {
      await containingHost.close()
      await environment.dispose()
    }
  })

  it("admits expired task recovery once when the repository opens", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const canonicalRoot = await realpath(repositoryRoot)
    const identity = codingRepositoryIdentity(canonicalRoot)
    const firstHost = await environment.start()
    const firstRepository = await firstHost.openRepository({
      repositoryPath: repositoryRoot
    })
    expect(firstRepository.repositoryId).toBe(identity.repositoryId)
    await firstHost.close()

    await environment.storage.beginWorkspaceTaskRun({
      id: "wtsk_coding_expired",
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      access: "read_only",
      repositoryId: identity.repositoryId,
      isolationId: "wiso_coding_expired",
      executionEnvironment: await codingTaskExecutionBinding(
        environment.storage,
        "read_only"
      ),
      attemptId: "wtat_coding_expired",
      ownerId: "coding-expired-owner",
      claimToken: "coding-expired-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 1_000
    })
    await environment.storage.markWorkspaceTaskActive({
      runId: "wtsk_coding_expired",
      attemptId: "wtat_coding_expired",
      claimToken: "coding-expired-token-abcdefghijklmnopqrstuvwxyz"
    })
    await waitForLeaseExpiry(
      environment.storage,
      "wtsk_coding_expired"
    )

    const secondHost = await environment.start()
    try {
      const repository = await secondHost.openRepository({
        repositoryPath: repositoryRoot
      })
      expect(repository.recovery).toEqual({
        transaction: "clean",
        tasks: {
          attempted: 1,
          released: 0,
          attention: 1,
          skipped: 0,
          failed: 0,
          remaining: false,
          entries: [{
            runId: "wtsk_coding_expired",
            previousState: "active",
            outcome: "attention"
          }],
          diagnostics: []
        }
      })
      await expect(
        environment.storage.getWorkspaceTaskRun({
          runId: "wtsk_coding_expired"
        })
      ).resolves.toMatchObject({ run: { state: "attention" } })
    } finally {
      await secondHost.close()
      await environment.dispose()
    }
  })

  it("cancels the exact orphan Turn linked to an expired Workspace task", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const identity = codingRepositoryIdentity(await realpath(repositoryRoot))
    const provider = new WorkspaceEditProvider()
    const orphanRuntime = new WanexRuntimeHost({
      storage: environment.storage,
      provider
    })
    const executionEnvironment = await codingTaskExecutionBinding(
      environment.storage,
      "writable"
    )
    const applicationScope = codingApplicationScope({
      repositoryId: identity.repositoryId,
      workspaceId: identity.workspaceId,
      taskId: "wtsk_coding_recovery_orphan"
    })
    const submitted = await orphanRuntime.submitUserTurn({
      content: [{ type: "text", text: "orphaned coding turn" }],
      sessionId: "ses_coding_recovery_orphan",
      sessionScope: {
        kind: "coding.repository",
        id: identity.repositoryId
      },
      inputId: "inp_coding_recovery_orphan",
      turnId: "turn_coding_recovery_orphan",
      jobId: "job_coding_recovery_orphan",
      principalId: "coding-agent",
      executionEnvironment,
      applicationScope,
      origin: {
        kind: "coding",
        sourceRef: "wtsk_coding_recovery_orphan",
        parentRef: identity.repositoryId,
        metadata: {
          workspaceId: identity.workspaceId,
          access: "writable"
        }
      }
    })
    await orphanRuntime.dispose()

    await environment.storage.beginWorkspaceTaskRun({
      id: "wtsk_coding_recovery_orphan",
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      access: "writable",
      repositoryId: identity.repositoryId,
      isolationId: "wiso_coding_recovery_orphan",
      executionEnvironment,
      jobId: submitted.receipt.job.id,
      agentId: "coding-agent",
      attemptId: "wtat_coding_recovery_orphan",
      ownerId: "coding-lost-owner",
      claimToken: "coding-lost-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 1_000
    })
    await environment.storage.markWorkspaceTaskActive({
      runId: "wtsk_coding_recovery_orphan",
      attemptId: "wtat_coding_recovery_orphan",
      claimToken: "coding-lost-token-abcdefghijklmnopqrstuvwxyz",
      baseRevision: await git(repositoryRoot, ["rev-parse", "HEAD"]),
      runtimeRef: `wanex/runtime/${sha256("wiso_coding_recovery_orphan").slice(0, 32)}`
    })
    await waitForLeaseExpiry(
      environment.storage,
      "wtsk_coding_recovery_orphan"
    )

    const recoveredHost = await environment.start()
    try {
      const repository = await recoveredHost.openRepository({
        repositoryPath: repositoryRoot
      })
      expect(repository.recovery.tasks.entries).toContainEqual({
        runId: "wtsk_coding_recovery_orphan",
        previousState: "active",
        outcome: "attention"
      })
      await expect(
        environment.storage.listSessionTurns({
          sessionId: submitted.session.id
        })
      ).resolves.toMatchObject([{
        id: submitted.turnId,
        state: "cancelled"
      }])
      await expect(repository.getTurn(submitted.turnId)).resolves.toMatchObject({
        reference: {
          repositoryId: identity.repositoryId,
          taskId: "wtsk_coding_recovery_orphan",
          sessionId: submitted.session.id,
          turnId: submitted.turnId,
          jobId: submitted.receipt.job.id
        },
        state: "cancelled"
      })
      expect(provider.calls).toBe(0)
    } finally {
      await recoveredHost.close()
      await environment.dispose()
    }
  })

  it("fails closed when Coding history lacks or contradicts durable bindings", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const identity = codingRepositoryIdentity(await realpath(repositoryRoot))
    const host = await environment.start()
    const repository = await host.openRepository({ repositoryPath: repositoryRoot })
    const externalRuntime = new WanexRuntimeHost({
      storage: environment.storage,
      provider: new WorkspaceEditProvider()
    })
    try {
      const missing = await externalRuntime.submitUserTurn({
        content: [{ type: "text", text: "missing durable Coding scope" }],
        sessionId: "ses_coding_binding_missing",
        sessionScope: {
          kind: "coding.repository",
          id: identity.repositoryId
        },
        inputId: "inp_coding_binding_missing",
        turnId: "turn_coding_binding_missing",
        jobId: "job_coding_binding_missing",
        principalId: "coding-agent"
      })
      await expect(repository.getTurn(missing.turnId)).rejects.toThrow(
        "Coding Turn application scope is missing or foreign"
      )

      const taskId = "wtsk_coding_binding_contradiction"
      const taskBinding = await codingTaskExecutionBinding(
        environment.storage,
        "writable"
      )
      const applicationScope = codingApplicationScope({
        repositoryId: identity.repositoryId,
        workspaceId: identity.workspaceId,
        taskId
      })
      const contradictory = await externalRuntime.submitUserTurn({
        content: [{ type: "text", text: "contradict durable Coding scope" }],
        sessionId: "ses_coding_binding_contradiction",
        sessionScope: {
          kind: "coding.repository",
          id: identity.repositoryId
        },
        inputId: "inp_coding_binding_contradiction",
        turnId: "turn_coding_binding_contradiction",
        jobId: "job_coding_binding_contradiction",
        principalId: "coding-agent",
        executionEnvironment: {
          ...taskBinding,
          providerRevision: `${taskBinding.providerRevision}.changed`
        },
        applicationScope,
        origin: {
          kind: "coding",
          sourceRef: taskId,
          parentRef: identity.repositoryId,
          metadata: {
            workspaceId: identity.workspaceId,
            access: "writable"
          }
        }
      })
      await environment.storage.beginWorkspaceTaskRun({
        id: taskId,
        workspaceId: identity.workspaceId,
        principalId: "coding-agent",
        access: "writable",
        repositoryId: identity.repositoryId,
        isolationId: "wiso_coding_binding_contradiction",
        executionEnvironment: taskBinding,
        jobId: contradictory.receipt.job.id,
        agentId: "coding-agent",
        attemptId: "wtat_coding_binding_contradiction",
        ownerId: "coding-binding-owner",
        claimToken: "coding-binding-token-abcdefghijklmnopqrstuvwxyz",
        leaseMs: 60_000
      })

      await expect(repository.getTurn(contradictory.turnId)).rejects.toThrow(
        "Coding Turn and Workspace task execution environment changed after admission"
      )
    } finally {
      await externalRuntime.dispose()
      await host.close()
      await environment.dispose()
    }
  })

  it("rejects writable admission while shared-checkout recovery needs attention", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const identity = codingRepositoryIdentity(await realpath(repositoryRoot))
    const transactionId = "wtx_coding_repository_attention"
    const transactionAttempt = {
      transactionId,
      attemptId: "wta_coding_repository_attention",
      claimToken: "coding-repository-attention-token-abcdefghijklmnopqrstuvwxyz"
    }
    const before = "base\n"
    const target = "changed\n"
    const file: WorkspaceChangeTransactionFilePlan = {
      ordinal: 0,
      path: "README.md",
      beforeText: before,
      beforeSha256: sha256(before),
      afterText: target,
      afterSha256: sha256(target)
    }
    await environment.storage.putWorkspaceChangeSet({
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      changeSet: {
        id: "wcs_coding_repository_attention",
        changes: [{
          path: "README.md",
          kind: "update",
          baseText: before,
          targetText: target
        }]
      }
    })
    await environment.storage.beginWorkspaceChangeTransaction({
      id: transactionId,
      workspaceId: identity.workspaceId,
      changeSetId: "wcs_coding_repository_attention",
      operation: "apply",
      sourceKind: "host",
      sourceId: "coding:recovery-attention",
      idempotencyKey: "coding:recovery-attention",
      rootIdentitySha256: sha256(await realpath(repositoryRoot)),
      attemptId: transactionAttempt.attemptId,
      ownerId: "coding-lost-owner",
      claimToken: transactionAttempt.claimToken,
      leaseMs: 60_000
    })
    await environment.storage.recordWorkspaceChangeTransactionPlan({
      ...transactionAttempt,
      files: [file]
    })
    const helperEnvironment = new NativeExecutionEnvironment({
      environmentId: "native_coding_recovery_fixture",
      managedProcess: true,
      strategy: { kind: "direct" }
    })
    const helperScope = await helperEnvironment.bind({
      scopeId: "coding_recovery_fixture",
      policy: {
        revision: 1,
        filesystem: {
          roots: [{ id: "repository", effects: ["read", "write", "create", "remove"] }],
          maxReadBytes: 50 * 1024 * 1024,
          maxDirectoryEntries: 100_000
        },
        process: {
          oneShot: true,
          managed: true,
          cleanup: "runtime_process_tree",
          environmentVariables: []
        },
        network: "unrestricted",
        isolation: "none",
        pty: false
      },
      fileSystemRoots: [{ id: "repository", path: repositoryRoot }]
    })
    try {
      const helper = await spawnWorkspaceTransaction({
        rootDir: repositoryRoot,
        serviceBin,
        transactionId,
        executionScope: helperScope
      })
      await helper.prepare([file])
      await helper.terminate()
    } finally {
      await helperEnvironment.close()
    }
    await writeFile(join(repositoryRoot, "README.md"), "external\n", "utf8")
    await environment.storage.renewWorkspaceChangeTransaction({
      ...transactionAttempt,
      leaseMs: 10
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 25))

    const host = await environment.start()
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      expect(repository.sharedCheckoutReady).toBe(false)
      expect(repository.recovery.transaction).toBe("attention")
      expect(() => repository.startTurn({
        idempotencyKey: "host-recovery-blocked",
        content: [{ type: "text", text: "must not run" }]
      })).toThrowError(expect.objectContaining({ code: "repository_not_ready" }))
    } finally {
      await host.close()
      await environment.dispose()
    }
  })

  it("closes idempotently, rejects later opens, and keeps injected storage open", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const host = await environment.start()
    await host.openRepository({ repositoryPath: repositoryRoot })

    await host.close()
    await host.close()
    expect(host.state).toBe("closed")
    await expect(
      host.openRepository({ repositoryPath: repositoryRoot })
    ).rejects.toMatchObject({ code: "host_closed" })

    await expect(
      environment.storage.putConfig("coding.injected", { open: true })
    ).resolves.toBeUndefined()
    await expect(
      environment.storage.getConfig("coding.injected")
    ).resolves.toEqual({ open: true })
    await environment.dispose()
  })

  it("runs concurrent scoped Turns in independent worktrees and proposes without shared writes", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new WorkspaceEditProvider()
    const host = await environment.start(executionOptions(provider, {
      workerCount: 2,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const [alpha, beta] = [
        repository.startTurn({
          idempotencyKey: "host-concurrent-alpha",
          content: [{ type: "text", text: "create alpha" }],
          proposalTitle: "Create alpha",
          agentId: "agent_alpha"
        }),
        repository.startTurn({
          idempotencyKey: "host-concurrent-beta",
          content: [{ type: "text", text: "create beta" }],
          proposalTitle: "Create beta",
          agentId: "agent_beta"
        })
      ]
      const [alphaReceipt, betaReceipt] = await Promise.all([
        alpha.result,
        beta.result
      ])

      for (const receipt of [alphaReceipt, betaReceipt]) {
        expect(receipt).toMatchObject({
          turnState: "succeeded",
          task: {
            status: "succeeded",
            outcome: "proposed",
            changeSetId: expect.stringMatching(/^wcs_task_/),
            proposalId: expect.stringMatching(/^wcp_task_/)
          }
        })
        const task = await environment.storage.getWorkspaceTaskRun({
          runId: receipt.reference.taskId
        })
        expect(task).toMatchObject({
          run: {
            state: "released",
            jobId: receipt.reference.jobId
          }
        })
        const turns = await environment.storage.listSessionTurns({
          sessionId: receipt.reference.sessionId
        })
        const turn = turns.find((candidate) => candidate.id === receipt.reference.turnId)
        expect(turn?.executionBinding.applicationScope).toMatchObject({
          kind: "coding.workspace-task",
          id: receipt.reference.taskId,
          metadata: {
            repositoryId: repository.repositoryId,
            workspaceId: task?.run.workspaceId,
            access: "writable"
          }
        })
        expect(turn?.executionBinding.executionEnvironment).toEqual(
          task?.run.executionEnvironment
        )
        const serialized = JSON.stringify(turn?.executionBinding)
        expect(serialized).not.toContain(repositoryRoot)
        expect(serialized).not.toContain(environment.dataDir)
        expect(serialized).not.toContain(serviceBin)
        expect(serialized).not.toContain(process.execPath)
      }
      await expect(readFile(join(repositoryRoot, "alpha.txt"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" })
      await expect(readFile(join(repositoryRoot, "beta.txt"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" })
      expect(provider.calls).toBe(4)
    } finally {
      await host.close()
      await environment.dispose()
    }
  })

  it("runs different Coding Sessions concurrently and serializes Turns within one Session", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new ConcurrentBlockingProvider()
    const host = await environment.start(executionOptions(provider, {
      workerCount: 2,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const first = repository.startTurn({
        sessionId: "coding-shared-session",
        idempotencyKey: "host-shared-first",
        content: [{ type: "text", text: "shared first" }]
      })
      await provider.waitForStarted(1)
      const independent = repository.startTurn({
        sessionId: "coding-independent-session",
        idempotencyKey: "host-independent",
        content: [{ type: "text", text: "independent" }]
      })

      await provider.waitForStarted(2)
      expect(provider.maxActive).toBe(2)

      const queued = repository.startTurn({
        sessionId: "coding-shared-session",
        idempotencyKey: "host-shared-second",
        content: [{ type: "text", text: "shared second" }]
      })
      expect(provider.startedCount).toBe(2)

      await Promise.all([
        first.cancel("release shared Session"),
        independent.cancel("release independent Session")
      ])
      await Promise.all([first.result, independent.result])
      await provider.waitForStarted(3)
      expect(provider.maxActive).toBe(2)

      await queued.cancel("finish serialized Session test")
      await expect(queued.result).resolves.toMatchObject({
        turnState: "cancelled",
        task: { status: "failed" }
      })
      expect(provider.active).toBe(0)
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 30_000)

  it("retains one scoped worktree across durable approval and wakes exact resumption", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const policy = new ApprovalRequiredWorkspacePolicy()
    const host = await environment.start(executionOptions(
      new WorkspaceEditProvider(),
      { toolPermissionPolicy: policy }
    ))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const operation = repository.startTurn({
        idempotencyKey: "host-approval",
        content: [{ type: "text", text: "create approved" }]
      })
      await policy.requested
      const approval = await waitForApproval(environment.storage, operation.reference.turnId)
      await waitForRuntimeStage(
        host,
        operation.reference.turnId,
        "tool_execution_begin_completed"
      )
      await expect(
        environment.storage.getWorkspaceTaskRun({
          runId: operation.reference.taskId
        })
      ).resolves.toMatchObject({ run: { state: "active" } })

      await operation.resolveApproval({
        executionId: approval.id,
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once",
        reason: "reviewed exact Coding change"
      })
      await expect(operation.result).resolves.toMatchObject({
        turnState: "succeeded",
        task: { status: "succeeded", outcome: "proposed" }
      })
      expect(policy.calls).toBe(1)
    } finally {
      await host.close()
      await environment.dispose()
    }
  })

  it("cancels and drains an active scoped Turn before Host close returns", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new BlockingProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    const repository = await host.openRepository({ repositoryPath: repositoryRoot })
    const operation = repository.startTurn({
      idempotencyKey: "host-close-cancel",
      content: [{ type: "text", text: "wait" }]
    })
    await provider.started

    await host.close()
    expect(host.state).toBe("closed")
    expect(repository.state).toBe("closed")
    await expect(operation.result).resolves.toMatchObject({
      turnState: "cancelled",
      task: { status: "failed" }
    })
    await expect(
      environment.storage.getWorkspaceTaskRun({ runId: operation.reference.taskId })
    ).resolves.toMatchObject({ run: { state: "released" } })
    await environment.dispose()
  })

  it("collects cancelled changed work as an incomplete Proposal", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new EditThenBlockProvider()
    const host = await environment.start(executionOptions(provider, {
      toolPermissionPolicy: new AllowAllToolsPolicy()
    }))
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const operation = repository.startTurn({
        idempotencyKey: "host-cancelled-change",
        content: [{ type: "text", text: "create cancelled" }]
      })
      await provider.blocked
      await operation.cancel("stop after generated change")
      const receipt = await operation.result
      expect(receipt).toMatchObject({
        turnState: "cancelled",
        task: {
          status: "failed",
          outcome: "proposed",
          proposalId: expect.any(String)
        }
      })
      const proposal = await repository.getProposal(receipt.task.proposalId!)
      expect(proposal).toMatchObject({
        state: "open",
        incomplete: true,
        executionOutcome: "failed",
        files: [{ path: "change.txt", kind: "create" }]
      })
      await expect(readFile(join(repositoryRoot, "change.txt"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      await host.close()
      await environment.dispose()
    }
  })

})

async function waitForRuntimeStage(
  host: CodingHost,
  turnId: string,
  stage: AgentRuntimeExecutionStage
): Promise<void> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const diagnostics = await host.readDiagnostics()
    const current = diagnostics.repositories
      .flatMap((repository) => repository.activeTurns)
      .find((turn) => turn.reference.turnId === turnId)
    if (current?.runtimeStage === stage) return
    if (Date.now() >= deadline) {
      throw new Error(
        `Coding runtime stage did not reach ${stage} for Turn ${turnId}`
      )
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
}
