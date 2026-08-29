import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createShell,
  createSurfaceAdapter,
  type ApproveLocalPluginReviewRequest,
  type CancelLocalPluginReviewRequest,
  type PluginManagementEventListener,
  type PluginManagementMutationResult,
  type PluginManagementPort,
  type PluginManagementSnapshot,
  type RequestLocalPluginReviewResult,
  type SetPluginInstallStateRequest
} from "../src/index.js"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceClientTransport
} from "../src/surface/client.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("Assistant Plugin management boundary", () => {
  it("stays truthful when Plugin management is not configured", async () => {
    const shell = await createAssistant()
    try {
      await expect(shell.pluginManagement.read()).resolves.toEqual({
        kind: "assistant.plugin-management.unavailable",
        reason: "not_configured",
        message: "Plugin management is not configured."
      })
      await expect(shell.pluginManagement.requestLocalReview()).resolves
        .toMatchObject({ kind: "plugin.management.rejected", reason: "not_configured" })
      await expect(shell.pluginManagement.approveLocalReview({ reviewId: "review" }))
        .resolves.toMatchObject({ reason: "not_configured" })
      await expect(shell.pluginManagement.cancelLocalReview({ reviewId: "review" }))
        .resolves.toMatchObject({ reason: "not_configured" })
      await expect(shell.pluginManagement.setInstallState({
        pluginId: "plugin.example",
        version: "1.0.0",
        expectedState: "installed",
        state: "disabled"
      })).resolves.toMatchObject({ reason: "not_configured" })
      await expect(shell.pluginManagement.retryRefresh()).resolves
        .toMatchObject({ reason: "not_configured" })
    } finally {
      await shell.dispose()
    }
  })

  it("delegates one canonical state and isolates Assistant event listeners", async () => {
    const port = new FakePluginManagementPort()
    const shell = await createAssistant({ pluginManagement: port })
    const events: unknown[] = []
    shell.pluginManagementEvents.subscribePluginManagementEvents(() => {
      throw new Error("isolated presentation listener")
    })
    shell.pluginManagementEvents.subscribePluginManagementEvents((event) => {
      events.push(event)
    })
    try {
      expect(await shell.pluginManagement.read()).toBe(port.snapshot)
      expect(await shell.pluginManagement.requestLocalReview()).toBe(port.reviewResult)
      await shell.pluginManagement.approveLocalReview({
        reviewId: "review_plugin_example",
        reason: "Reviewed locally"
      })
      await shell.pluginManagement.cancelLocalReview({
        reviewId: "review_plugin_example"
      })
      await shell.pluginManagement.setInstallState({
        pluginId: "plugin.example",
        version: "1.0.0",
        expectedState: "installed",
        state: "disabled"
      })
      await shell.pluginManagement.retryRefresh()
      expect(port.requests).toEqual([
        ["request-review"],
        ["approve-review", {
          reviewId: "review_plugin_example",
          reason: "Reviewed locally"
        }],
        ["cancel-review", { reviewId: "review_plugin_example" }],
        ["set-state", {
          pluginId: "plugin.example",
          version: "1.0.0",
          expectedState: "installed",
          state: "disabled"
        }],
        ["retry-refresh"]
      ])

      port.emit("plugin-management:sha256:" + "b".repeat(64), 7_000)
      expect(events).toEqual([{
        kind: "assistant.plugin-management.invalidated",
        sequence: 1,
        at: 7_000,
        revision: "plugin-management:sha256:" + "b".repeat(64)
      }])
    } finally {
      await shell.dispose()
    }
    expect(port.unsubscribeCount).toBe(1)
    port.emit("plugin-management:sha256:" + "c".repeat(64), 8_000)
    expect(events).toHaveLength(1)
  })

  it("carries safe operations and revision invalidation through the strict Surface", async () => {
    const port = new FakePluginManagementPort()
    const shell = await createAssistant({ pluginManagement: port })
    const surface = createSurfaceAdapter(shell, {
      now: () => 9_000,
      streamId: "plugin-management-surface"
    })
    const transport = createInProcessSurfaceClientTransport(surface)
    const client = createSurfaceClient(transport)
    try {
      await expect(client.readPluginManagement()).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.snapshot" }
      })
      await expect(client.requestLocalPluginReview()).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.review-ready" }
      })
      await expect(client.approveLocalPluginReview({
        reviewId: "review_plugin_example",
        reason: "Approved"
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.applied", operation: "install" }
      })
      await expect(client.cancelLocalPluginReview({
        reviewId: "review_plugin_example"
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.review-cancelled" }
      })
      await expect(client.setPluginInstallState({
        pluginId: "plugin.example",
        version: "1.0.0",
        expectedState: "installed",
        state: "disabled"
      })).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.applied" }
      })
      await expect(client.retryPluginRefresh()).resolves.toMatchObject({
        ok: true,
        value: { kind: "plugin.management.applied" }
      })

      for (const [command, input, rejection] of [
        [
          "requestLocalPluginReview",
          { sourceDir: "/private/plugin" },
          "input must be omitted"
        ],
        ["approveLocalPluginReview", {
          reviewId: "review_plugin_example",
          installRootDir: "/private/install"
        }, "installRootDir"],
        ["cancelLocalPluginReview", {
          reviewId: "review_plugin_example",
          actorId: "principal_private"
        }, "actorId"],
        ["setPluginInstallState", {
          pluginId: "plugin.example",
          version: "1.0.0",
          expectedState: "installed",
          state: "disabled",
          trust: { sourceDir: "/private/source" }
        }, "trust"]
      ] as const) {
        await expect(surface.dispatchSurfaceCommand({ command, input })).resolves
          .toMatchObject({
            ok: false,
            error: {
              code: "validation_error",
              message: expect.stringContaining(rejection)
            }
          })
      }

      port.emit("plugin-management:sha256:" + "d".repeat(64), 9_001)
      expect(surface.readSurfaceEvents().events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "assistant.surface.plugin-management.invalidated",
            command: "readPluginManagement",
            pluginManagement: {
              kind: "assistant.plugin-management.invalidated",
              sequence: 1,
              at: 9_001,
              revision: "plugin-management:sha256:" + "d".repeat(64)
            }
          })
        ])
      )

      const forged = createSurfaceClient({
        ...transport,
        async dispatchSurfaceCommand(request) {
          const response = await transport.dispatchSurfaceCommand(request)
          if (request.command !== "readPluginManagement" || !response.ok) {
            return response
          }
          const value = structuredClone(response.value) as Record<string, any>
          value.installs[0].sourceDir = "/private/source-must-not-cross"
          return { ...response, value }
        }
      } satisfies SurfaceClientTransport)
      await expect(forged.readPluginManagement()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_transport_response" }
      })
    } finally {
      await surface.dispose()
      await shell.dispose()
    }
  })
})

class FakePluginManagementPort implements PluginManagementPort {
  readonly snapshot: PluginManagementSnapshot = {
    kind: "plugin.management.snapshot",
    revision: "plugin-management:sha256:" + "a".repeat(64),
    installs: [{
      pluginId: "plugin.example",
      displayName: "Example Plugin",
      version: "1.0.0",
      state: "installed",
      runtimeState: "loaded",
      capabilities: ["config.read"],
      sourceKind: "local",
      signatureStatus: "unsigned",
      artifactSha256: "e".repeat(64),
      totalBytes: 1_024,
      fileCount: 3,
      commandCount: 1,
      updatedAt: 6_000
    }]
  }
  readonly reviewResult: RequestLocalPluginReviewResult = {
    kind: "plugin.management.review-ready",
    review: {
      kind: "plugin.management.local-review",
      reviewId: "review_plugin_example",
      expiresAt: 60_000,
      pluginId: "plugin.example",
      displayName: "Example Plugin",
      version: "1.0.0",
      sourceKind: "local",
      signatureStatus: "unsigned",
      artifactSha256: "e".repeat(64),
      totalBytes: 1_024,
      fileCount: 3,
      capabilities: ["config.read"],
      commands: [{ id: "plugin.example.echo", title: "Echo" }],
      dependencies: [{
        name: "host-api",
        distribution: "peer",
        loading: "startup",
        observedBytes: 0
      }]
    }
  }
  readonly requests: unknown[] = []
  unsubscribeCount = 0
  private readonly listeners = new Set<PluginManagementEventListener>()

  async read(): Promise<PluginManagementSnapshot> {
    return this.snapshot
  }

  async requestLocalReview(): Promise<RequestLocalPluginReviewResult> {
    this.requests.push(["request-review"])
    return this.reviewResult
  }

  async approveLocalReview(
    request: ApproveLocalPluginReviewRequest
  ): Promise<PluginManagementMutationResult> {
    this.requests.push(["approve-review", request])
    return applied("install", this.snapshot)
  }

  async cancelLocalReview(request: CancelLocalPluginReviewRequest) {
    this.requests.push(["cancel-review", request])
    return { kind: "plugin.management.review-cancelled" as const }
  }

  async setInstallState(
    request: SetPluginInstallStateRequest
  ): Promise<PluginManagementMutationResult> {
    this.requests.push(["set-state", request])
    return applied("set_state", this.snapshot)
  }

  async retryRefresh(): Promise<PluginManagementMutationResult> {
    this.requests.push(["retry-refresh"])
    return applied("retry_refresh", this.snapshot)
  }

  subscribe(listener: PluginManagementEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.unsubscribeCount += 1
      this.listeners.delete(listener)
    }
  }

  emit(revision: string, at: number): void {
    for (const listener of this.listeners) {
      listener({
        kind: "plugin.management.invalidated",
        sequence: 1,
        at,
        revision
      })
    }
  }
}

function applied(
  operation: "install" | "set_state" | "retry_refresh",
  snapshot: PluginManagementSnapshot
): PluginManagementMutationResult {
  return {
    kind: "plugin.management.applied",
    operation,
    snapshot,
    catalogRevision: "plugin-catalog:sha256:empty"
  }
}

async function createAssistant(
  options: Partial<Parameters<typeof createShell>[0]> = {}
) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant-plugin-management-"))
  tempDirs.push(storeDir)
  return await createShell({
    storage: { kind: "local-system-service", storeDir },
    artifacts: { explicitPath: serviceBin },
    ...options
  })
}
