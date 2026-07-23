import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WorkspaceProposalRuntime } from "../../src/review/index.js"

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

describe("@wanex/workspace-review", () => {
  it("creates an idempotent proposal and records approve/apply intent history", async () => {
    const { runtime, storage } = await createRuntime()
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_review_runtime",
      principalId: "agent_review_runtime",
      changeSet: {
        id: "cs_review_runtime",
        title: "Runtime review",
        changes: [
          {
            path: "runtime.txt",
            kind: "create",
            targetText: "runtime\n"
          }
        ]
      }
    })

    const proposal = await runtime.createProposal({
      id: "wcp_runtime",
      changeSetId: "cs_review_runtime",
      title: "Runtime proposal",
      summary: "Review before apply",
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-proposal-key"
    })
    const duplicate = await runtime.createProposal({
      changeSetId: "cs_review_runtime",
      title: "Runtime proposal",
      summary: "Review before apply",
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-proposal-key"
    })

    expect(duplicate.id).toBe(proposal.id)
    expect(proposal.state).toBe("open")

    await expect(
      runtime.approveProposal({
        proposalId: proposal.id,
        actorId: "reviewer_runtime",
        reason: "approved"
      })
    ).resolves.toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved"
    })

    await expect(
      runtime.requestApply({
        proposalId: proposal.id,
        actorId: "reviewer_runtime",
        metadata: { target: "workspace" }
      })
    ).resolves.toMatchObject({
      operation: "request_apply",
      fromState: "approved",
      toState: "apply_requested"
    })

    await expect(runtime.getProposal(proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      state: "apply_requested"
    })
    await expect(
      runtime.listProposals({ state: "apply_requested" })
    ).resolves.toHaveLength(1)

    const history = await runtime.getHistory(proposal.id)
    expect(history?.changeSet?.id).toBe("cs_review_runtime")
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "approve",
      "request_apply"
    ])
  })

  it("records terminal reject and withdraw decisions without apply intent", async () => {
    const { runtime, storage } = await createRuntime()
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_review_runtime",
      principalId: "agent_review_runtime",
      changeSet: {
        id: "cs_reject_runtime",
        changes: [
          {
            path: "reject.txt",
            kind: "create",
            targetText: "reject\n"
          }
        ]
      }
    })
    await storage.putWorkspaceChangeSet({
      workspaceId: "workspace_review_runtime",
      principalId: "agent_review_runtime",
      changeSet: {
        id: "cs_withdraw_runtime",
        changes: [
          {
            path: "withdraw.txt",
            kind: "create",
            targetText: "withdraw\n"
          }
        ]
      }
    })

    const rejected = await runtime.createProposal({
      id: "wcp_reject_runtime",
      changeSetId: "cs_reject_runtime"
    })
    const withdrawn = await runtime.createProposal({
      id: "wcp_withdraw_runtime",
      changeSetId: "cs_withdraw_runtime"
    })

    await expect(
      runtime.rejectProposal({
        proposalId: rejected.id,
        actorId: "reviewer_runtime",
        reason: "not safe"
      })
    ).resolves.toMatchObject({
      operation: "reject",
      fromState: "open",
      toState: "rejected"
    })
    await expect(
      runtime.withdrawProposal({
        proposalId: withdrawn.id,
        actorId: "agent_review_runtime",
        reason: "superseded"
      })
    ).resolves.toMatchObject({
      operation: "withdraw",
      fromState: "open",
      toState: "withdrawn"
    })

    await expect(runtime.getProposal(rejected.id)).resolves.toMatchObject({
      state: "rejected",
      closedAt: expect.any(Number)
    })
    await expect(runtime.getProposal(withdrawn.id)).resolves.toMatchObject({
      state: "withdrawn",
      closedAt: expect.any(Number)
    })
    await expect(
      runtime.requestApply({
        proposalId: rejected.id,
        actorId: "reviewer_runtime"
      })
    ).rejects.toThrow(/invalid workspace proposal transition/)
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: WorkspaceProposalRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-change-proposal-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new WorkspaceProposalRuntime({
    storage,
    workspaceId: "workspace_review_runtime",
    principalId: "agent_review_runtime"
  })
  return { storeDir, storage, runtime }
}
