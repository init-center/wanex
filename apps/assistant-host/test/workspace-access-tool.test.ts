import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { NativeExecutionEnvironment } from "@wanex/runtime/execution"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { ToolInvocation, ToolPermissionRequest } from "@wanex/runtime/tools"
import { createToolRuntimeBinding } from "@wanex/runtime/tools"
import { createWorkspaceAccessStore } from "../src/workspace/access.js"
import { WorkspaceAccessCoordinator } from "../src/workspace/access-coordinator.js"
import { workspaceTools } from "../src/workspace/tools.js"
import type { WorkspaceGeneration } from "../src/workspace/model.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const stores: StorageTestStore[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (stores.length > 0) await stores.pop()!.dispose()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  }
})

describe("Workspace dynamic access tools", () => {
  it("requires and validates a grant before reading an unconfigured root", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-dynamic-access-store-"))
    const rootPath = await mkdtemp(join(tmpdir(), "wanex-dynamic-access-root-"))
    tempDirs.push(storeDir, rootPath)
    await writeFile(join(rootPath, "note.txt"), "dynamic workspace\n", "utf8")
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    stores.push(storage)
    const accessStore = createWorkspaceAccessStore(storage, { hostId: "host_dynamic" })
    const basePolicy = {
      snapshot: () => createToolRuntimeBinding({
        implementationId: "test.dynamic-base-policy",
        implementationRevision: "1"
      }),
      authorize: async () => ({ status: "deny" as const, reason: "not-used" })
    }
    const coordinator = new WorkspaceAccessCoordinator({
      hostId: "host_dynamic",
      storage,
      accessStore,
      basePolicy
    })
    const accessInput = {
      path: rootPath,
      effects: ["read"] as const,
      scope: "session" as const,
      reason: "read the unconfigured root"
    }
    const identity = {
      principalId: "principal_dynamic",
      sessionId: "ses_dynamic",
      inputId: "inp_dynamic",
      turnId: "turn_dynamic",
      attemptId: "attempt_dynamic",
      toolCallId: "call_access"
    }
    const permission = await coordinator.authorize({
      ...identity,
      call: { toolCallId: identity.toolCallId, toolName: "workspace_request_access", input: accessInput },
      descriptor: {
        name: "workspace_request_access",
        description: "request",
        inputSchema: { type: "object" },
        risk: "mutating",
        idempotent: true,
        concurrency: "exclusive",
        resultMode: "immediate"
      }
    } as unknown as ToolPermissionRequest)
    expect(permission.status).toBe("approval_required")
    if (permission.status !== "approval_required") throw new Error("expected approval")
    const request = (await accessStore.listRequests({ sessionId: identity.sessionId }))[0]!
    const decision = await accessStore.decideRequest({
      requestId: request.id,
      expectedRevision: request.revision,
      actorId: identity.principalId,
      decision: "approve",
      reason: "approved",
      idempotencyKey: "access-tool-approval",
      now: Date.now()
    })
    const environment = new NativeExecutionEnvironment({
      environmentId: "dynamic-access-test",
      strategy: { kind: "direct" }
    })
    const generation = {
      hostId: "host_dynamic",
      authority: {} as WorkspaceGeneration["authority"],
      selection: { rootIds: [] },
      conditions: [],
      roots: [],
      instructions: { status: "available", sources: [], diagnostics: [] },
      skills: { complete: true, sources: [] }
    } as unknown as WorkspaceGeneration
    const registry = workspaceTools({
      generation,
      generationKey: "generation_dynamic",
      environment,
      serviceBin,
      workspaceStore: {} as WorkspaceStore,
      accessStore,
      accessCoordinator: coordinator,
      assertAuthority: async () => {},
      mutationTools: []
    })
    try {
      const read = registry.get("workspace_read_text")
      expect(read).toBeDefined()
      const result = await read!.invoke({
        ...identity,
        input: { path: "note.txt", grantId: decision.grant!.id },
        idempotencyKey: "dynamic-read",
        toolName: "workspace_read_text",
        resources: {} as ToolInvocation["resources"]
      } as ToolInvocation)
      expect(result.outcome).toBe("succeeded")
      if (result.outcome !== "succeeded") throw new Error("expected a successful read")
      expect(JSON.stringify(result.content)).toContain("dynamic workspace")
    } finally {
      await environment.close()
    }
    const metadata = await stat(rootPath, { bigint: true })
    expect(String(metadata.ino)).toBe(request.root.inode)
  })
})
