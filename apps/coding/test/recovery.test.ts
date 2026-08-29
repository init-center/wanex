import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AllowAllToolsPolicy,
  jsonToolResultContent,
  toolResultContentDigest
} from "@wanex/runtime/tools"
import { startCodingApplication } from "../src/host/index.js"
import type { CodingApplicationEvent } from "../src/index.js"
import {
  AmbiguousToolProvider,
  ambiguousToolRegistry,
  CodingHostTestScope,
  executionOptions,
  serviceBin
} from "./support.js"

let scope: CodingHostTestScope

beforeEach(() => {
  scope = new CodingHostTestScope()
})

afterEach(async () => {
  await scope.dispose()
})

describe("Coding Tool recovery", () => {
  it("retains the task isolation and resumes the exact Turn without reinvoking a confirmed Tool", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const provider = new AmbiguousToolProvider()
    const host = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: {
        ...executionOptions(provider, {
          toolPermissionPolicy: new AllowAllToolsPolicy()
        }),
        baseAgentContext: {
          tools: ambiguousToolRegistry(provider)
        }
      }
    })
    try {
      const project = await host.openProject({ repositoryPath: repositoryRoot })
      const events: CodingApplicationEvent[] = []
      const unsubscribe = host.application.subscribe((event) => events.push(event))
      const settled = nextEvent(
        host.application,
        (event) =>
          event.kind === "turn_invalidated" &&
          event.reason === "turn_settled"
      )
      const started = await host.application.startTurn({
        projectId: project.projectId,
        idempotencyKey: "recovery-initial",
        content: [{ type: "text", text: "reconcile remote operation" }]
      })
      await settled

      const attention = await host.application.readTurn({
        projectId: project.projectId,
        turnId: started.turnId
      })
      expect(attention).toMatchObject({
        state: "recovery_required",
        result: "attention",
        recovery: {
          totalCount: 1,
          returnedCount: 1,
          omittedCount: 0,
          items: [{
            tool: {
              name: "ambiguous_remote",
              resultMode: "immediate",
              idempotent: false
            },
            evidence: {
              message: "remote operation result was lost",
              reconciliationRef: "remote-1"
            },
            availableDecisions: [
              "confirm_succeeded",
              "confirm_failed",
              "abandon_turn"
            ]
          }]
        }
      })
      expect(provider.calls).toBe(1)
      expect(provider.toolCalls).toBe(1)

      const taskBefore = (await environment.storage.listWorkspaceTaskRuns({
        repositoryId: project.projectId
      }))[0]
      expect(taskBefore).toMatchObject({ run: { state: "attention" } })
      const isolationId = taskBefore?.run.isolationId
      if (isolationId === undefined) throw new Error("missing task isolation")

      const recovery = attention!.recovery.items[0]!
      const content = jsonToolResultContent({
        remoteId: "remote-1",
        accepted: true
      })
      const recovered = await host.application.resolveTurnRecovery({
        projectId: project.projectId,
        turnId: started.turnId,
        executionId: recovery.executionId,
        expectedRecoveryRevision: recovery.recoveryRevision,
        decision: "confirm_succeeded",
        reason: "verified against the remote operation log",
        requestId: "coding-recovery-confirm-1",
        content,
        contentDigest: toolResultContentDigest(content)
      })

      expect(recovered).toMatchObject({
        state: "succeeded",
        recovery: { totalCount: 0, returnedCount: 0, omittedCount: 0, items: [] }
      })
      expect(provider.calls).toBe(2)
      expect(provider.toolCalls).toBe(1)
      const taskAfter = (await environment.storage.listWorkspaceTaskRuns({
        repositoryId: project.projectId
      }))[0]
      expect(taskAfter).toMatchObject({ run: { state: "released" } })
      expect(taskAfter?.run.isolationId).toBe(isolationId)
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "turn_invalidated",
          turnId: started.turnId,
          reason: "turn_recovery_resolved"
        })
      )
      unsubscribe()
    } finally {
      await host.close()
      await environment.dispose()
    }
  }, 20_000)

  it("confirms a failed Tool and makes a repeated request idempotent", async () => {
    const fixture = await openRecoveryFixture()
    try {
      const item = fixture.turn.recovery.items[0]!
      const content = jsonToolResultContent({ rejected: true })
      const request = {
        projectId: fixture.project.projectId,
        turnId: fixture.started.turnId,
        executionId: item.executionId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision: "confirm_failed" as const,
        reason: "the remote operation was rejected",
        requestId: "coding-recovery-confirm-failed",
        content,
        contentDigest: toolResultContentDigest(content),
        error: { code: "REMOTE_REJECTED" }
      }
      const recovered = await fixture.host.application.resolveTurnRecovery(request)
      expect(recovered).toMatchObject({ state: "succeeded", recovery: { totalCount: 0 } })
      const duplicate = await fixture.host.application.resolveTurnRecovery(request)
      expect(duplicate).toMatchObject({ state: "succeeded", recovery: { totalCount: 0 } })
      expect(fixture.provider.calls).toBe(2)
      expect(fixture.provider.toolCalls).toBe(1)
      const executions = await fixture.environment.storage.listToolExecutions({
        turnId: fixture.started.turnId
      })
      expect(executions).toEqual([
        expect.objectContaining({
          state: "failed",
          content,
          contentDigest: toolResultContentDigest(content),
          isError: true
        })
      ])
    } finally {
      await fixture.host.close()
      await fixture.environment.dispose()
    }
  }, 20_000)

  it("allows retry only for an idempotent immediate Tool and reuses the same execution", async () => {
    const fixture = await openRecoveryFixture({
      idempotent: true,
      succeedOnRetry: true
    })
    try {
      const item = fixture.turn.recovery.items[0]!
      expect(item.availableDecisions).toContain("retry")
      const recovered = await fixture.host.application.resolveTurnRecovery({
        projectId: fixture.project.projectId,
        turnId: fixture.started.turnId,
        executionId: item.executionId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision: "retry",
        reason: "the remote request uses an idempotency key",
        requestId: "coding-recovery-retry"
      })
      expect(recovered).toMatchObject({ state: "succeeded", recovery: { totalCount: 0 } })
      expect(fixture.provider.calls).toBe(2)
      expect(fixture.provider.toolCalls).toBe(2)
      const executions = await fixture.environment.storage.listToolExecutions({
        turnId: fixture.started.turnId
      })
      expect(executions).toEqual([
        expect.objectContaining({ state: "succeeded", attemptCount: 2 })
      ])
    } finally {
      await fixture.host.close()
      await fixture.environment.dispose()
    }
  }, 20_000)

  it("abandons an unknown outcome without collecting or releasing the worktree", async () => {
    const fixture = await openRecoveryFixture()
    try {
      const item = fixture.turn.recovery.items[0]!
      const before = (await fixture.environment.storage.listWorkspaceTaskRuns({
        repositoryId: fixture.project.projectId
      }))[0]
      const abandoned = await fixture.host.application.resolveTurnRecovery({
        projectId: fixture.project.projectId,
        turnId: fixture.started.turnId,
        executionId: item.executionId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision: "abandon_turn",
        reason: "the remote system has no reconciliation endpoint",
        requestId: "coding-recovery-abandon"
      })
      expect(abandoned).toMatchObject({
        state: "failed",
        result: "failed",
        recovery: { totalCount: 0 }
      })
      const after = (await fixture.environment.storage.listWorkspaceTaskRuns({
        repositoryId: fixture.project.projectId
      }))[0]
      expect(after).toMatchObject({ run: { state: "attention" } })
      expect(after?.run.isolationId).toBe(before?.run.isolationId)
      expect(fixture.provider.calls).toBe(1)
      expect(fixture.provider.toolCalls).toBe(1)
    } finally {
      await fixture.host.close()
      await fixture.environment.dispose()
    }
  }, 20_000)

  it("keeps a multi-tool batch in attention until every recovery item is resolved", async () => {
    const fixture = await openRecoveryFixture({
      toolCount: 2
    })
    try {
      expect(fixture.turn.recovery.items).toHaveLength(2)
      const first = fixture.turn.recovery.items[0]!
      const firstContent = jsonToolResultContent({ operation: "remote-1", accepted: true })
      const partiallyResolved = await fixture.host.application.resolveTurnRecovery({
        projectId: fixture.project.projectId,
        turnId: fixture.started.turnId,
        executionId: first.executionId,
        expectedRecoveryRevision: first.recoveryRevision,
        decision: "confirm_succeeded",
        reason: "verified the first remote operation",
        requestId: "coding-recovery-multi-1",
        content: firstContent,
        contentDigest: toolResultContentDigest(firstContent)
      })
      expect(partiallyResolved).toMatchObject({
        state: "recovery_required",
        recovery: { totalCount: 1, returnedCount: 1 }
      })
      const remaining = partiallyResolved!.recovery.items[0]!
      const secondContent = jsonToolResultContent({ operation: "remote-2", accepted: true })
      const resolved = await fixture.host.application.resolveTurnRecovery({
        projectId: fixture.project.projectId,
        turnId: fixture.started.turnId,
        executionId: remaining.executionId,
        expectedRecoveryRevision: remaining.recoveryRevision,
        decision: "confirm_succeeded",
        reason: "verified the second remote operation",
        requestId: "coding-recovery-multi-2",
        content: secondContent,
        contentDigest: toolResultContentDigest(secondContent)
      })
      expect(resolved).toMatchObject({
        state: "succeeded",
        recovery: { totalCount: 0 }
      })
      expect(fixture.provider.calls).toBe(2)
      expect(fixture.provider.toolCalls).toBe(2)
    } finally {
      await fixture.host.close()
      await fixture.environment.dispose()
    }
  }, 20_000)

  it("allows explicit recovery after the Coding Host is replaced", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const firstProvider = new AmbiguousToolProvider()
    const firstHost = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: {
        ...executionOptions(firstProvider, {
          toolPermissionPolicy: new AllowAllToolsPolicy()
        }),
        baseAgentContext: { tools: ambiguousToolRegistry(firstProvider) }
      }
    })
    const firstProject = await firstHost.openProject({ repositoryPath: repositoryRoot })
    const firstSettled = nextEvent(
      firstHost.application,
      (event) =>
        event.kind === "turn_invalidated" && event.reason === "turn_settled"
    )
    const started = await firstHost.application.startTurn({
      projectId: firstProject.projectId,
      idempotencyKey: "recovery-after-restart",
      content: [{ type: "text", text: "reconcile after restart" }]
    })
    await firstSettled
    await firstHost.close()

    const secondProvider = new AmbiguousToolProvider()
    const secondHost = await startCodingApplication({
      dataDir: environment.dataDir,
      storage: { kind: "injected", handle: environment.storageHandle },
      artifacts: { explicitPath: serviceBin },
      execution: {
        ...executionOptions(secondProvider, {
          toolPermissionPolicy: new AllowAllToolsPolicy()
        }),
        baseAgentContext: { tools: ambiguousToolRegistry(secondProvider) }
      }
    })
    try {
      const secondProject = await secondHost.openProject({ repositoryPath: repositoryRoot })
      const attention = await secondHost.application.readTurn({
        projectId: secondProject.projectId,
        turnId: started.turnId
      })
      expect(attention).toMatchObject({ state: "recovery_required" })
      const item = attention!.recovery.items[0]!
      const content = jsonToolResultContent({ accepted: true, afterRestart: true })
      const recovered = await secondHost.application.resolveTurnRecovery({
        projectId: secondProject.projectId,
        turnId: started.turnId,
        executionId: item.executionId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision: "confirm_succeeded",
        reason: "verified after replacing the host",
        requestId: "coding-recovery-after-restart",
        content,
        contentDigest: toolResultContentDigest(content)
      })
      expect(recovered).toMatchObject({ state: "succeeded", recovery: { totalCount: 0 } })
      expect(secondProvider.calls).toBe(1)
      expect(secondProvider.toolCalls).toBe(0)
    } finally {
      await secondHost.close()
      await environment.dispose()
    }
  }, 20_000)
})

async function openRecoveryFixture(options: {
  readonly idempotent?: boolean
  readonly succeedOnRetry?: boolean
  readonly toolCount?: number
} = {}) {
  const environment = await scope.createEnvironment()
  const repositoryRoot = await scope.createRepository()
  const provider = new AmbiguousToolProvider(options.toolCount)
  const host = await startCodingApplication({
    dataDir: environment.dataDir,
    storage: { kind: "injected", handle: environment.storageHandle },
    artifacts: { explicitPath: serviceBin },
    execution: {
      ...executionOptions(provider, {
        toolPermissionPolicy: new AllowAllToolsPolicy()
      }),
      baseAgentContext: {
        tools: ambiguousToolRegistry(provider, {
          ...options,
          parallelSafe: options.toolCount === 2
        })
      }
    }
  })
  const project = await host.openProject({ repositoryPath: repositoryRoot })
  const settled = nextEvent(
    host.application,
    (event) =>
      event.kind === "turn_invalidated" && event.reason === "turn_settled"
  )
  const started = await host.application.startTurn({
    projectId: project.projectId,
    idempotencyKey: "recovery-fixture",
    content: [{ type: "text", text: "reconcile remote operation" }]
  })
  await settled
  const turn = await host.application.readTurn({
    projectId: project.projectId,
    turnId: started.turnId
  })
  if (turn === null || turn.recovery.items.length !== (options.toolCount ?? 1)) {
    throw new Error("recovery fixture did not produce the expected recovery items")
  }
  return { environment, host, project, provider, repositoryRoot, started, turn }
}

function nextEvent(
  application: { subscribe(listener: (event: CodingApplicationEvent) => void): () => void },
  predicate: (event: CodingApplicationEvent) => boolean
): Promise<CodingApplicationEvent> {
  return new Promise((resolve) => {
    const unsubscribe = application.subscribe((event) => {
      if (!predicate(event)) return
      unsubscribe()
      resolve(event)
    })
  })
}
