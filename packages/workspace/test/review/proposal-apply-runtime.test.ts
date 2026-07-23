import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WorkspaceRuntime } from "../../src/index.js"
import { WorkspaceProposalApplyRuntime } from "../../src/review/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/workspace/review", () => {
  it("plans independent proposals as executable", async () => {
    const { storage, runtime } = await createRuntime()
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_plan_a",
      changeSetId: "cs_plan_a",
      path: "plan-a.txt",
      text: "a\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_plan_b",
      changeSetId: "cs_plan_b",
      path: "plan-b.txt",
      text: "b\n"
    })

    const plan = await runtime.planApplyProposalBatch({
      items: [
        { proposalId: "wcp_plan_b" },
        { proposalId: "wcp_plan_a" }
      ]
    })

    expect(plan).toMatchObject({
      status: "executable",
      orderedProposalIds: ["wcp_plan_b", "wcp_plan_a"],
      items: [
        {
          proposalId: "wcp_plan_b",
          status: "ready",
          paths: ["plan-b.txt"]
        },
        {
          proposalId: "wcp_plan_a",
          status: "ready",
          paths: ["plan-a.txt"]
        }
      ]
    })
  })

  it("marks same-path independent proposals as needs_review", async () => {
    const { storage, runtime } = await createRuntime()
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_plan_conflict_a",
      changeSetId: "cs_plan_conflict_a",
      path: "shared.txt",
      text: "a\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_plan_conflict_b",
      changeSetId: "cs_plan_conflict_b",
      path: "shared.txt",
      text: "b\n"
    })

    const plan = await runtime.planApplyProposalBatch({
      items: [
        { proposalId: "wcp_plan_conflict_a" },
        { proposalId: "wcp_plan_conflict_b" }
      ]
    })

    expect(plan.status).toBe("needs_review")
    expect(plan.items[1]).toMatchObject({
      proposalId: "wcp_plan_conflict_b",
      status: "needs_review",
      conflicts: [
        {
          path: "shared.txt",
          reason: "create_create_same_path",
          conflictingProposalId: "wcp_plan_conflict_a",
          conflictingChangeSetId: "cs_plan_conflict_a"
        }
      ]
    })
    await expect(
      runtime.applyProposalBatch({
        items: [
          { proposalId: "wcp_plan_conflict_a" },
          { proposalId: "wcp_plan_conflict_b" }
        ]
      })
    ).resolves.toMatchObject({
      status: "failed",
      results: [
        { proposalId: "wcp_plan_conflict_a", status: "blocked" },
        { proposalId: "wcp_plan_conflict_b", status: "needs_review" }
      ]
    })
  })

  it("allows dependent proposals to queue without review conflicts", async () => {
    const { storage, runtime } = await createRuntime()
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_plan_dep_a",
      changeSetId: "cs_plan_dep_a",
      path: "dependent.txt",
      text: "a\n"
    })
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSet: {
        id: "cs_plan_dep_b",
        changes: [
          {
            path: "dependent.txt",
            kind: "update",
            baseText: "a\n",
            targetText: "b\n"
          }
        ]
      }
    })
    await putRequestedProposal(storage, {
      proposalId: "wcp_plan_dep_b",
      changeSetId: "cs_plan_dep_b"
    })

    const plan = await runtime.planApplyProposalBatch({
      items: [
        { proposalId: "wcp_plan_dep_a" },
        { proposalId: "wcp_plan_dep_b", dependsOn: ["wcp_plan_dep_a"] }
      ]
    })

    expect(plan.status).toBe("executable")
    expect(plan.items).toEqual([
      expect.objectContaining({
        proposalId: "wcp_plan_dep_a",
        status: "ready"
      }),
      expect.objectContaining({
        proposalId: "wcp_plan_dep_b",
        status: "queued",
        dependsOn: ["wcp_plan_dep_a"]
      })
    ])
  })

  it("applies an apply_requested proposal and records durable audit", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSet: {
        id: "cs_apply_runtime",
        title: "Apply runtime",
        changes: [
          {
            path: "apply.txt",
            kind: "create",
            targetText: "applied\n"
          }
        ]
      }
    })
    await storage.putWorkspaceChangeProposal({
      id: "wcp_apply_runtime",
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSetId: "cs_apply_runtime"
    })
    await storage.recordWorkspaceChangeProposalOperation({
      proposalId: "wcp_apply_runtime",
      operation: "approve",
      actorId: "reviewer_apply_runtime"
    })
    await storage.recordWorkspaceChangeProposalOperation({
      proposalId: "wcp_apply_runtime",
      operation: "request_apply",
      actorId: "reviewer_apply_runtime"
    })

    const result = await runtime.applyProposal({
      proposalId: "wcp_apply_runtime",
      actorId: "proposal_apply_test",
      operationId: "wcpo_runtime_mark_applied",
      metadata: { source: "test" }
    })

    expect(result.status).toBe("applied")
    expect(result.proposal.state).toBe("applied")
    expect(result.proposal.closedAt).toEqual(expect.any(Number))
    expect(result.workspaceOperation).toMatchObject({
      operation: "apply",
      status: "applied"
    })
    expect(result.proposalOperation).toMatchObject({
      id: "wcpo_runtime_mark_applied",
      operation: "mark_applied",
      fromState: "apply_requested",
      toState: "applied",
      metadata: {
        source: "test",
        workspaceOperationId: result.workspaceOperation?.id,
        changeSetId: "cs_apply_runtime",
        status: "applied"
      }
    })
    await expect(readFile(join(rootDir, "apply.txt"), "utf8")).resolves.toBe(
      "applied\n"
    )
    const operations = await storage.listWorkspaceChangeProposalOperations({
      proposalId: "wcp_apply_runtime"
    })
    expect(operations.map((operation) => operation.operation)).toEqual([
      "approve",
      "request_apply",
      "mark_applied"
    ])
  })

  it("marks conflicted proposal apply as apply_failed", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await writeFile(join(rootDir, "conflict.txt"), "current\n", "utf8")
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSet: {
        id: "cs_apply_conflict_runtime",
        changes: [
          {
            path: "conflict.txt",
            kind: "update",
            baseText: "base\n",
            targetText: "target\n"
          }
        ]
      }
    })
    await storage.putWorkspaceChangeProposal({
      id: "wcp_apply_conflict_runtime",
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSetId: "cs_apply_conflict_runtime"
    })
    await storage.recordWorkspaceChangeProposalOperation({
      proposalId: "wcp_apply_conflict_runtime",
      operation: "approve",
      actorId: "reviewer_apply_runtime"
    })
    await storage.recordWorkspaceChangeProposalOperation({
      proposalId: "wcp_apply_conflict_runtime",
      operation: "request_apply",
      actorId: "reviewer_apply_runtime"
    })

    const result = await runtime.applyProposal({
      proposalId: "wcp_apply_conflict_runtime",
      failureOperationId: "wcpo_runtime_mark_apply_failed"
    })

    expect(result.status).toBe("apply_failed")
    expect(result.proposal.state).toBe("apply_failed")
    expect(result.workspaceOperation).toMatchObject({
      operation: "apply",
      status: "conflicted"
    })
    expect(result.proposalOperation).toMatchObject({
      id: "wcpo_runtime_mark_apply_failed",
      operation: "mark_apply_failed",
      fromState: "apply_requested",
      toState: "apply_failed"
    })
    expect(result.proposalOperation.metadata).toMatchObject({
      changeSetId: "cs_apply_conflict_runtime",
      workspaceOperationId: result.workspaceOperation?.id,
      error: {
        type: "workspace.apply_conflicted"
      }
    })
    await expect(readFile(join(rootDir, "conflict.txt"), "utf8")).resolves.toBe(
      "current\n"
    )
  })

  it("refuses proposals that are not apply_requested", async () => {
    const { storage, runtime } = await createRuntime()
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSet: {
        id: "cs_apply_not_ready",
        changes: [
          {
            path: "not-ready.txt",
            kind: "create",
            targetText: "no\n"
          }
        ]
      }
    })
    await storage.putWorkspaceChangeProposal({
      id: "wcp_apply_not_ready",
      workspaceId: "workspace_apply_runtime",
      principalId: "agent_apply_runtime",
      changeSetId: "cs_apply_not_ready"
    })

    await expect(
      runtime.applyProposal({ proposalId: "wcp_apply_not_ready" })
    ).rejects.toThrow(/not apply_requested/)
  })

  it("applies a batch in dependency order", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_a",
      changeSetId: "cs_batch_a",
      path: "batch-a.txt",
      text: "a\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_b",
      changeSetId: "cs_batch_b",
      path: "batch-b.txt",
      text: "b\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_c",
      changeSetId: "cs_batch_c",
      path: "batch-c.txt",
      text: "c\n"
    })

    const result = await runtime.applyProposalBatch({
      actorId: "proposal_batch_test",
      metadata: { source: "batch-test" },
      items: [
        { proposalId: "wcp_batch_c", dependsOn: ["wcp_batch_b"] },
        { proposalId: "wcp_batch_a" },
        { proposalId: "wcp_batch_b", dependsOn: ["wcp_batch_a"] }
      ]
    })

    expect(result.status).toBe("applied")
    expect(result.orderedProposalIds).toEqual([
      "wcp_batch_a",
      "wcp_batch_b",
      "wcp_batch_c"
    ])
    expect(result.results.map((item) => item.status)).toEqual([
      "applied",
      "applied",
      "applied"
    ])
    await expect(readFile(join(rootDir, "batch-a.txt"), "utf8")).resolves.toBe(
      "a\n"
    )
    await expect(readFile(join(rootDir, "batch-b.txt"), "utf8")).resolves.toBe(
      "b\n"
    )
    await expect(readFile(join(rootDir, "batch-c.txt"), "utf8")).resolves.toBe(
      "c\n"
    )
    const operations = await storage.listWorkspaceChangeProposalOperations({
      proposalId: "wcp_batch_b"
    })
    expect(operations.at(-1)?.metadata).toMatchObject({
      source: "batch-test",
      batchIndex: 1,
      dependsOn: ["wcp_batch_a"]
    })
  })

  it("stops a batch after the first failed apply by default", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await writeFile(join(rootDir, "batch-conflict.txt"), "current\n", "utf8")
    await putRequestedUpdateProposal(storage, {
      proposalId: "wcp_batch_conflict",
      changeSetId: "cs_batch_conflict",
      path: "batch-conflict.txt",
      baseText: "base\n",
      targetText: "target\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_after_conflict",
      changeSetId: "cs_batch_after_conflict",
      path: "after-conflict.txt",
      text: "after\n"
    })

    const result = await runtime.applyProposalBatch({
      items: [
        { proposalId: "wcp_batch_conflict" },
        { proposalId: "wcp_batch_after_conflict" }
      ]
    })

    expect(result.status).toBe("failed")
    expect(result.results.map((item) => item.status)).toEqual([
      "apply_failed",
      "skipped"
    ])
    await expect(
      readFile(join(rootDir, "after-conflict.txt"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("continues independent items and blocks failed dependents when requested", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await writeFile(join(rootDir, "batch-continue-conflict.txt"), "current\n")
    await putRequestedUpdateProposal(storage, {
      proposalId: "wcp_batch_continue_conflict",
      changeSetId: "cs_batch_continue_conflict",
      path: "batch-continue-conflict.txt",
      baseText: "base\n",
      targetText: "target\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_continue_dependent",
      changeSetId: "cs_batch_continue_dependent",
      path: "blocked-dependent.txt",
      text: "blocked\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_continue_independent",
      changeSetId: "cs_batch_continue_independent",
      path: "independent.txt",
      text: "independent\n"
    })

    const result = await runtime.applyProposalBatch({
      stopOnFailure: false,
      items: [
        { proposalId: "wcp_batch_continue_conflict" },
        {
          proposalId: "wcp_batch_continue_dependent",
          dependsOn: ["wcp_batch_continue_conflict"]
        },
        { proposalId: "wcp_batch_continue_independent" }
      ]
    })

    expect(result.status).toBe("partial")
    expect(result.results.map((item) => [item.proposalId, item.status])).toEqual([
      ["wcp_batch_continue_conflict", "apply_failed"],
      ["wcp_batch_continue_dependent", "blocked"],
      ["wcp_batch_continue_independent", "applied"]
    ])
    await expect(readFile(join(rootDir, "independent.txt"), "utf8")).resolves.toBe(
      "independent\n"
    )
    await expect(
      readFile(join(rootDir, "blocked-dependent.txt"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects invalid batch dependency graphs before mutation", async () => {
    const { rootDir, storage, runtime } = await createRuntime()
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_invalid_a",
      changeSetId: "cs_batch_invalid_a",
      path: "invalid-a.txt",
      text: "a\n"
    })
    await putRequestedCreateProposal(storage, {
      proposalId: "wcp_batch_invalid_b",
      changeSetId: "cs_batch_invalid_b",
      path: "invalid-b.txt",
      text: "b\n"
    })

    await expect(
      runtime.applyProposalBatch({
        items: [
          { proposalId: "wcp_batch_invalid_a" },
          { proposalId: "wcp_batch_invalid_a" }
        ]
      })
    ).rejects.toThrow(/duplicate proposal batch item/)
    await expect(
      runtime.applyProposalBatch({
        items: [
          {
            proposalId: "wcp_batch_invalid_a",
            dependsOn: ["wcp_batch_missing"]
          }
        ]
      })
    ).rejects.toThrow(/dependency not found/)
    await expect(
      runtime.applyProposalBatch({
        items: [
          { proposalId: "wcp_batch_invalid_a", dependsOn: ["wcp_batch_invalid_b"] },
          { proposalId: "wcp_batch_invalid_b", dependsOn: ["wcp_batch_invalid_a"] }
        ]
      })
    ).rejects.toThrow(/cycle/)

    await expect(readFile(join(rootDir, "invalid-a.txt"), "utf8")).rejects.toMatchObject(
      { code: "ENOENT" }
    )
    await expect(readFile(join(rootDir, "invalid-b.txt"), "utf8")).rejects.toMatchObject(
      { code: "ENOENT" }
    )
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly rootDir: string
  readonly storage: StorageTestStore
  readonly runtime: WorkspaceProposalApplyRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-proposal-apply-store-"))
  const rootDir = await mkdtemp(join(tmpdir(), "wanex-proposal-apply-root-"))
  tempDirs.push(storeDir, rootDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const workspace = new WorkspaceRuntime({
    storage,
    rootDir,
    workspaceId: "workspace_apply_runtime",
    principalId: "agent_apply_runtime"
  })
  const runtime = new WorkspaceProposalApplyRuntime({
    storage,
    workspace,
    actorId: "proposal_apply_runtime"
  })
  return { storeDir, rootDir, storage, runtime }
}

async function putRequestedCreateProposal(
  storage: StorageTestStore,
  input: {
    readonly proposalId: string
    readonly changeSetId: string
    readonly path: string
    readonly text: string
  }
): Promise<void> {
  await storage.putWorkspaceChangeSet({
    workspaceId: "workspace_apply_runtime",
    principalId: "agent_apply_runtime",
    changeSet: {
      id: input.changeSetId,
      changes: [
        {
          path: input.path,
          kind: "create",
          targetText: input.text
        }
      ]
    }
  })
  await putRequestedProposal(storage, {
    proposalId: input.proposalId,
    changeSetId: input.changeSetId
  })
}

async function putRequestedUpdateProposal(
  storage: StorageTestStore,
  input: {
    readonly proposalId: string
    readonly changeSetId: string
    readonly path: string
    readonly baseText: string
    readonly targetText: string
  }
): Promise<void> {
  await storage.putWorkspaceChangeSet({
    workspaceId: "workspace_apply_runtime",
    principalId: "agent_apply_runtime",
    changeSet: {
      id: input.changeSetId,
      changes: [
        {
          path: input.path,
          kind: "update",
          baseText: input.baseText,
          targetText: input.targetText
        }
      ]
    }
  })
  await putRequestedProposal(storage, {
    proposalId: input.proposalId,
    changeSetId: input.changeSetId
  })
}

async function putRequestedProposal(
  storage: StorageTestStore,
  input: {
    readonly proposalId: string
    readonly changeSetId: string
  }
): Promise<void> {
  await storage.putWorkspaceChangeProposal({
    id: input.proposalId,
    workspaceId: "workspace_apply_runtime",
    principalId: "agent_apply_runtime",
    changeSetId: input.changeSetId
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: input.proposalId,
    operation: "approve",
    actorId: "reviewer_apply_runtime"
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: input.proposalId,
    operation: "request_apply",
    actorId: "reviewer_apply_runtime"
  })
}
