import { mkdtemp, realpath, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { createWorkspaceAccessStore, type WorkspaceAccessStore } from "../src/workspace/access.js"
import { WorkspaceAccessCoordinator } from "../src/workspace/access-coordinator.js"
import { createToolRuntimeBinding, type ToolPermissionRequest } from "@wanex/runtime/tools"
import type { RootIdentity } from "../src/workspace/model.js"
import { digest } from "../src/workspace/store.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []

afterEach(async () => {
  while (stores.length > 0) await stores.pop()!.dispose()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  }
})

describe("Assistant Host workspace access store", () => {
  it("persists one request per root and makes duplicate creation idempotent", async () => {
    const { storage, access, root } = await createFixture()
    const input = {
      id: "wreq_access_one",
      hostId: "host_access",
      principalId: "principal_alice",
      sessionId: "ses_access_one",
      turnId: "turn_access_one",
      scope: "session" as const,
      root,
      reason: "Read the selected project",
      idempotencyKey: "input_access_one",
      now: 100,
      expiresAt: 200
    }

    const first = await access.createRequest(input)
    const retry = await access.createRequest({ ...input, now: 101 })
    expect(retry).toEqual(first)
    expect((await access.listRequests({ sessionId: input.sessionId }))).toEqual([first])
    await expect(access.createRequest({ ...input, reason: "different" })).rejects.toThrow(
      "idempotency key was reused with different input"
    )
  })

  it("approves, revokes, and expires grants through typed state transitions", async () => {
    const { storage, access, root } = await createFixture()
    const request = await access.createRequest({
      id: "wreq_access_two",
      hostId: "host_access",
      principalId: "principal_bob",
      sessionId: "ses_access_two",
      turnId: "turn_access_two",
      scope: "turn",
      root,
      reason: "Apply the requested change",
      idempotencyKey: "input_access_two",
      now: 100,
      expiresAt: 1_000
    })

    const approved = await access.decideRequest({
      requestId: request.id,
      expectedRevision: request.revision,
      actorId: "actor_user",
      decision: "approve",
      reason: "Approved for this turn",
      idempotencyKey: "decision_access_two",
      now: 200
    })
    expect(approved.request.state).toBe("approved")
    expect(approved.grant?.state).toBe("active")
    expect(approved.grant?.turnId).toBe(request.turnId)

    const retry = await access.decideRequest({
      requestId: request.id,
      expectedRevision: request.revision,
      actorId: "actor_user",
      decision: "approve",
      reason: "Retry",
      idempotencyKey: "decision_access_two",
      now: 201
    })
    expect(retry.grant?.id).toBe(approved.grant?.id)
    expect(retry.request.revision).toBe(approved.request.revision)

    const revoked = await access.revokeGrant({
      grantId: approved.grant!.id,
      expectedRevision: approved.grant!.revision,
      actorId: "actor_user",
      reason: "No longer needed",
      idempotencyKey: "revoke_access_two",
      now: 300
    })
    expect(revoked.state).toBe("revoked")
    await expect(access.revokeGrant({
      grantId: revoked.id,
      expectedRevision: revoked.revision,
      actorId: "actor_other",
      reason: "A second decision",
      idempotencyKey: "revoke_access_two",
      now: 301
    })).rejects.toThrow("already")

    const expiringRequest = await access.createRequest({
      id: "wreq_access_expire",
      hostId: "host_access",
      principalId: "principal_bob",
      sessionId: "ses_access_two",
      turnId: "turn_access_expire",
      scope: "session",
      root,
      reason: "Temporary access",
      idempotencyKey: "input_access_expire",
      now: 400,
      expiresAt: 500
    })
    expect(expiringRequest.state).toBe("pending")
    expect(await access.expire(500)).toEqual({ requests: 1, grants: 0 })
    expect((await access.getRequest(expiringRequest.id))?.state).toBe("expired")
  })

  it("uses CAS so concurrent decisions cannot both approve a request", async () => {
    const { storage, access, root } = await createFixture()
    const request = await access.createRequest({
      id: "wreq_access_race",
      hostId: "host_access",
      principalId: "principal_race",
      sessionId: "ses_access_race",
      turnId: "turn_access_race",
      scope: "session",
      root,
      reason: "Concurrent approval test",
      idempotencyKey: "input_access_race",
      now: 100
    })
    const results = await Promise.allSettled([
      access.decideRequest({
        requestId: request.id,
        expectedRevision: request.revision,
        actorId: "actor_one",
        decision: "approve",
        reason: "First",
        idempotencyKey: "decision_race_one",
        now: 200
      }),
      access.decideRequest({
        requestId: request.id,
        expectedRevision: request.revision,
        actorId: "actor_two",
        decision: "approve",
        reason: "Second",
        idempotencyKey: "decision_race_two",
        now: 201
      })
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
    expect((await access.getRequest(request.id))?.state).toBe("approved")
    expect((await access.listGrants({ sessionId: request.sessionId }))).toHaveLength(1)
  })

  it("fails closed when a persisted request is malformed", async () => {
    const { storage, access, root } = await createFixture()
    const requestId = "wreq_access_bad"
    const key = "assistant.workspace.host_access.access.request."
    await storage.putConfig(
      `${key}${digest(requestId)}`,
      { id: requestId, hostId: "host_access", state: "pending" }
    )
    void root
    await expect(access.getRequest(requestId)).rejects.toThrow("workspace access request")
  })

  it("bridges Tool approval to an identity-checked dynamic grant", async () => {
    const { storage, access } = await createFixture()
    const coordinator = new WorkspaceAccessCoordinator({
      hostId: "host_access",
      storage,
      accessStore: access,
      basePolicy: {
        snapshot: () => createToolRuntimeBinding({
          implementationId: "test.base-policy",
          implementationRevision: "1"
        }),
        authorize: async () => ({ status: "deny", reason: "not-this-tool" })
      }
    })
    const toolRequest = {
      principalId: "principal_coordinator",
      sessionId: "ses_coordinator",
      inputId: "inp_coordinator",
      turnId: "turn_coordinator",
      attemptId: "attempt_coordinator",
      call: {
        toolCallId: "call_coordinator",
        toolName: "workspace_request_access",
        input: {
          path: "/tmp",
          effects: ["read", "write"],
          scope: "turn",
          reason: "inspect a generated workspace"
        }
      },
      descriptor: {
        name: "workspace_request_access",
        description: "test",
        inputSchema: { type: "object" },
        risk: "mutating",
        idempotent: true,
        concurrency: "exclusive",
        resultMode: "immediate"
      }
    } as unknown as ToolPermissionRequest
    const permission = await coordinator.authorize(toolRequest)
    expect(permission.status).toBe("approval_required")
    if (permission.status !== "approval_required") throw new Error("expected approval")
    const request = (await access.listRequests({ sessionId: toolRequest.sessionId }))[0]
    expect(request?.state).toBe("pending")
    const execution = {
      id: "tool_coordinator",
      permission,
      updatedAt: 200
    } as unknown as import("@wanex/protocol").ToolExecutionRecord
    const approvalRequest = {
      executionId: execution.id,
      expectedApprovalRevision: 1,
      decision: "approve_once",
      principalId: toolRequest.principalId,
      reason: "approved by user",
      idempotencyKey: "approval_coordinator"
    } as const
    const receipt = {
      execution,
      approvalDecision: {
        id: "approval_coordinator",
        executionId: execution.id,
        approvalRevision: 2,
        decision: "approve_once",
        principalId: toolRequest.principalId,
        reason: approvalRequest.reason,
        idempotencyKey: approvalRequest.idempotencyKey,
        action: "turn_requeued",
        createdAt: 200
      }
    } as unknown as import("@wanex/protocol").ResolveToolExecutionApprovalReceipt
    await coordinator.continuation.afterDecision({
      request: approvalRequest,
      execution,
      receipt
    })
    await coordinator.continuation.afterDecision({
      request: approvalRequest,
      execution,
      receipt
    })
    const approved = await access.getRequest(request!.id)
    expect(approved?.state).toBe("approved")
    expect(approved?.grantId).toBeDefined()
    const root = await coordinator.requireGrant(
      {
        principalId: toolRequest.principalId,
        sessionId: toolRequest.sessionId,
        turnId: toolRequest.turnId
      },
      approved!.grantId!,
      ["read"]
    )
    expect(root.path).toBe(await realpath("/tmp"))
    await expect(coordinator.requireGrant(
      {
        principalId: "principal_other",
        sessionId: toolRequest.sessionId,
        turnId: toolRequest.turnId
      },
      approved!.grantId!,
      ["read"]
    )).rejects.toThrow("does not belong")
  })
})

async function createFixture(): Promise<{
  readonly storage: StorageTestStore
  readonly access: WorkspaceAccessStore
  readonly root: RootIdentity
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-workspace-access-"))
  tempDirs.push(storeDir)
  const rootPath = await mkdtemp(join(tmpdir(), "wanex-workspace-access-root-"))
  tempDirs.push(rootPath)
  const metadata = await stat(rootPath, { bigint: true })
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "oneshot", storeDir, serviceBin })
  stores.push(storage)
  return {
    storage,
    access: createWorkspaceAccessStore(storage, { hostId: "host_access" }),
    root: { id: "root_access", path: rootPath, effects: ["read", "write"], device: String(metadata.dev), inode: String(metadata.ino) }
  }
}
