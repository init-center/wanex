import { readFile, realpath } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import { codingRepositoryIdentity } from "../src/host/repository/identity.js"
import {
  CodingHostTestScope,
  WorkspaceEditProvider,
  executionOptions
} from "./support.js"

let scope: CodingHostTestScope

beforeEach(() => {
  scope = new CodingHostTestScope()
})

afterEach(async () => {
  await scope.dispose()
})

describe("trusted coding host Proposal review", () => {
  it("reviews, applies, undoes, and restores a durable Coding Proposal", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const otherRepositoryRoot = await scope.createRepository()
    const host = await environment.start(executionOptions(
      new WorkspaceEditProvider(),
      { toolPermissionPolicy: new AllowAllToolsPolicy() }
    ))
    const repository = await host.openRepository({ repositoryPath: repositoryRoot })
    const operation = repository.startTurn({
      idempotencyKey: "review-alpha",
      content: [{ type: "text", text: "create alpha" }],
      proposalTitle: "Create alpha"
    })
    const completed = await operation.result
    const proposalId = completed.task.proposalId
    if (proposalId === undefined) throw new Error("Coding Turn did not create a Proposal")

    const open = await repository.getProposal(proposalId)
    expect(open).toMatchObject({
      proposalId,
      state: "open",
      changeSetState: "submitted",
      incomplete: false,
      totalFileCount: 1,
      returnedFileCount: 1,
      omittedFileCount: 0,
      files: [{
        path: "alpha.txt",
        kind: "create",
        after: { text: "alpha\n", truncated: false }
      }]
    })
    const serialized = JSON.stringify(open)
    expect(serialized).not.toContain(repositoryRoot)
    expect(serialized).not.toContain(environment.dataDir)

    await expect(repository.applyProposal(proposalId)).resolves.toMatchObject({
      status: "not_ready",
      proposal: { state: "open" }
    })

    const approval = await repository.decideProposal({
      proposalId,
      decision: "approve",
      reason: "reviewed generated change",
      idempotencyKey: "approve-alpha"
    })
    const approvalReplay = await repository.decideProposal({
      proposalId,
      decision: "approve",
      reason: "reviewed generated change",
      idempotencyKey: "approve-alpha"
    })
    expect(approvalReplay.operationId).toBe(approval.operationId)
    expect(approvalReplay.proposal.state).toBe("approved")

    const applyRequest = await repository.requestProposalApply({
      proposalId,
      reason: "apply reviewed alpha",
      idempotencyKey: "request-alpha-apply"
    })
    const applyRequestReplay = await repository.requestProposalApply({
      proposalId,
      reason: "apply reviewed alpha",
      idempotencyKey: "request-alpha-apply"
    })
    expect(applyRequestReplay.operationId).toBe(applyRequest.operationId)

    const applied = await repository.applyProposal(proposalId)
    expect(applied).toMatchObject({
      status: "applied",
      proposal: { state: "applied", changeSetState: "applied" },
      operation: {
        kind: "apply",
        status: "applied",
        totalFileCount: 1,
        returnedFileCount: 1,
        omittedFileCount: 0,
        files: [{ path: "alpha.txt", kind: "create" }],
        conflicts: []
      }
    })
    await expect(readFile(join(repositoryRoot, "alpha.txt"), "utf8"))
      .resolves.toBe("alpha\n")

    const undone = await repository.undoProposal({
      proposalId,
      idempotencyKey: "undo-alpha"
    })
    const undoReplay = await repository.undoProposal({
      proposalId,
      idempotencyKey: "undo-alpha"
    })
    expect(undone).toMatchObject({
      status: "applied",
      replayed: false,
      proposal: { state: "applied", changeSetState: "undone" },
      operation: { kind: "undo", status: "applied" }
    })
    expect(undoReplay).toMatchObject({ replayed: true })
    expect(undoReplay.operation.operationId).toBe(undone.operation.operationId)
    await expect(readFile(join(repositoryRoot, "alpha.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" })

    const otherRepository = await host.openRepository({
      repositoryPath: otherRepositoryRoot
    })
    await expect(otherRepository.getProposal(proposalId)).resolves.toBeNull()
    const rejectedCrossRepositoryApply = otherRepository.applyProposal(proposalId)
    const closingOtherRepository = otherRepository.close()
    await expect(rejectedCrossRepositoryApply).rejects.toMatchObject({
      code: "proposal_unavailable"
    })
    await expect(closingOtherRepository).resolves.toBeUndefined()

    await host.close()
    const relaunched = await environment.start()
    try {
      const reopened = await relaunched.openRepository({ repositoryPath: repositoryRoot })
      await expect(reopened.getProposal(proposalId)).resolves.toMatchObject({
        state: "applied",
        changeSetState: "undone",
        operations: [
          { action: "approve" },
          { action: "request_apply" }
        ]
      })
    } finally {
      await relaunched.close()
      await environment.dispose()
    }
  }, 20_000)

  it("bounds Proposal file and UTF-8 preview projection", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const identity = codingRepositoryIdentity(await realpath(repositoryRoot))
    const changeSetId = "wcs_coding_bounded_projection"
    const proposalId = "wcp_coding_bounded_projection"
    await environment.storage.putWorkspaceChangeSet({
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      changeSet: {
        id: changeSetId,
        changes: Array.from({ length: 205 }, (_, index) => ({
          path: `generated/${String(index).padStart(3, "0")}.txt`,
          kind: "create" as const,
          targetText: `${"界".repeat(800)}\n`
        }))
      }
    })
    await environment.storage.putWorkspaceChangeProposal({
      id: proposalId,
      workspaceId: identity.workspaceId,
      principalId: "coding-agent",
      changeSetId,
      metadata: {
        incomplete: true,
        executionOutcome: "failed",
        privateRoot: repositoryRoot
      }
    })
    const host = await environment.start()
    try {
      const repository = await host.openRepository({ repositoryPath: repositoryRoot })
      const proposal = await repository.getProposal(proposalId)
      expect(proposal).toMatchObject({
        incomplete: true,
        executionOutcome: "failed",
        totalFileCount: 205,
        returnedFileCount: 200,
        omittedFileCount: 5
      })
      const previewBytes = proposal?.files.reduce(
        (sum, file) => sum + Buffer.byteLength(file.after?.text ?? "", "utf8"),
        0
      )
      expect(previewBytes).toBeLessThanOrEqual(256 * 1024)
      expect(JSON.stringify(proposal)).not.toContain(repositoryRoot)
      expect(proposal?.files.some((file) => file.after?.truncated === true)).toBe(true)
    } finally {
      await host.close()
      await environment.dispose()
    }
  })

  it("drains an admitted Proposal apply before repository close settles", async () => {
    const environment = await scope.createEnvironment()
    const repositoryRoot = await scope.createRepository()
    const host = await environment.start(executionOptions(
      new WorkspaceEditProvider(),
      { toolPermissionPolicy: new AllowAllToolsPolicy() }
    ))
    const repository = await host.openRepository({ repositoryPath: repositoryRoot })
    const turn = repository.startTurn({
      idempotencyKey: "review-beta",
      content: [{ type: "text", text: "create beta" }]
    })
    const proposalId = (await turn.result).task.proposalId!
    await repository.decideProposal({
      proposalId,
      decision: "approve",
      reason: "reviewed beta",
      idempotencyKey: "approve-beta-close"
    })
    await repository.requestProposalApply({
      proposalId,
      reason: "apply beta before close",
      idempotencyKey: "request-beta-close"
    })

    const applying = repository.applyProposal(proposalId)
    const closing = repository.close()
    await expect(applying).resolves.toMatchObject({ status: "applied" })
    await expect(closing).resolves.toBeUndefined()
    await expect(readFile(join(repositoryRoot, "beta.txt"), "utf8"))
      .resolves.toBe("beta\n")
    await host.close()
    await environment.dispose()
  })
})
