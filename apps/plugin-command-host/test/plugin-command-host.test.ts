import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { execPath } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import {
  createTrustedSubprocessPluginActionHostFromInstall,
  PluginRuntime,
} from "@wanex/plugin"
import { createShell, createSurfaceAdapter } from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceEvent
} from "@wanex/product/surface"
import { createStorageHandle, type StorageHandle } from "@wanex/storage"
import { createPluginStore } from "@wanex/storage/plugin"
import {
  createPluginCommandComposition,
  createPluginCommandHost,
  parsePluginActionHandlerRef,
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const pluginHostFixture = join(
  import.meta.dirname,
  "../../../packages/plugin/test/fixtures/plugin-host-fixture.mjs"
)
const tempDirs: string[] = []
const handles: StorageHandle[] = []

afterEach(async () => {
  while (handles.length > 0) {
    await handles.pop()?.dispose()
  }
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("@wanex/plugin-command-host", () => {
  it("starts with an empty durable catalog and one idle claim owner", async () => {
    const handle = await createHandle("wanex-plugin-command-host-empty-")
    const host = await createPluginCommandHost({
      handle,
      principalId: "principal_empty_plugin_host",
      worker: {
        workerId: "worker_empty_plugin_host",
        leaseMs: 60_000,
      },
    })

    try {
      expect(host.management).toBeUndefined()
      expect(host.productBinding.pluginManagement).toBeUndefined()
      expect(host.status()).toMatchObject({
        started: false,
        disposed: false,
        activePluginCount: 0,
        commandCount: 0,
        executionHostCount: 0,
        catalogRevision: expect.stringMatching(/^plugin-catalog:sha256:/u),
        lastRefresh: {
          status: "succeeded",
          activePluginCount: 0,
          commandCount: 0,
          changed: false,
        },
      })
      await expect(host.runOnce()).resolves.toEqual({ status: "idle" })
      expect(host.start().started).toBe(true)
      await expect(host.stop()).resolves.toMatchObject({ started: false })
    } finally {
      await host.dispose()
    }
  })

  it("provides a composition port without an upper-app dependency", async () => {
    const handle = await createHandle("wanex-plugin-local-composition-")
    const storage = Object.assign(
      {},
      handle.core,
      createPluginStore(handle.transport),
    )
    const plugin = new PluginRuntime({ storage })
    await plugin.activateInstallPlan({
      plan: installPlan(),
      installIdempotencyKey: "plugin-local-composition-install",
    })
    const composition = createPluginCommandComposition({
      principalId: "principal_local_plugin_composition",
      worker: {
        workerId: "worker_local_plugin_composition",
        leaseMs: 60_000,
        grants: [{
          pluginId: "plugin.command-host",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["config.read"],
        }],
      },
    })
    const binding = await composition.prepare({ handle })

    expect(
      binding.productBinding.extensions.source
        .current()
        .snapshot.byDomain.command.byId.has("plugin.command-host.echo"),
    ).toBe(true)
    await binding.start()
    await binding.stop()
    await binding.dispose()
  })

  it("runs catalog, submission, worker, and activity through one store", async () => {
    const fixture = await createFixture({
      grants: [
        {
          pluginId: "plugin.command-host",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["config.read"]
        }
      ]
    })
    const { host, client, storage } = fixture

    try {
      expect(host.status()).toEqual({
        kind: "plugin-command-host.status",
        started: false,
        disposed: false,
        activePluginCount: 1,
        commandCount: 1,
        executionHostCount: 1,
        catalogRevision: expect.stringMatching(/^plugin-catalog:sha256:/u),
        completedCount: 0,
        failedCount: 0,
        lastRefresh: {
          status: "succeeded",
          revision: expect.stringMatching(/^plugin-catalog:sha256:/u),
          activePluginCount: 1,
          commandCount: 1,
          changed: true,
          listenerErrorCount: 0
        }
      })
      const catalog = await client.readProductCommands()
      expect(catalog).toMatchObject({
        ok: true,
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "plugin.command-host.echo",
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string", minLength: 3 }
                },
                required: ["text"],
                additionalProperties: false
              }
            })
          ])
        }
      })
      await expect(
        client.previewProductCommandInvocation({
          commandId: "plugin.command-host.echo",
          input: { text: "x" }
        })
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "rejected",
          reason: "invalid_input",
          inputValidation: {
            source: "schema",
            issues: [{ path: "/text", keyword: "minLength" }]
          }
        }
      })
      await expect(
        client.executeProductCommand({
          commandId: "plugin.command-host.echo",
          input: { text: "x" }
        })
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "rejected",
          reason: "invalid_input",
          inputValidation: {
            source: "schema",
            issues: [{ path: "/text", keyword: "minLength" }]
          }
        }
      })
      await expect(
        client.previewProductCommandInvocation({
          commandId: "plugin.command-host.echo",
          input: { text: "shared store" }
        })
      ).resolves.toMatchObject({ ok: true, value: { kind: "runnable" } })
      const execution = await client.executeProductCommand({
        commandId: "plugin.command-host.echo",
        input: { text: "shared store" }
      })
      expect(execution).toMatchObject({
        ok: true,
        value: {
          kind: "completed",
          summary: {
            valueKind: "plugin-action.submitted",
            references: [expect.objectContaining({ kind: "job" })]
          }
        }
      })
      if (!execution.ok || execution.value.kind !== "completed") {
        throw new Error("expected completed command submission")
      }
      const job = execution.value.summary.references.find(
        (reference) => reference.kind === "job"
      )
      if (job === undefined) {
        throw new Error("expected plugin action job reference")
      }
      await expect(
        client.readExecutionReference(job)
      ).resolves.toMatchObject({
        ok: true,
        value: { kind: "found", activity: { state: "ready" } }
      })

      await expect(host.runOnce()).resolves.toMatchObject({
        status: "completed",
        jobId: job.id
      })
      const activity = await client.readExecutionReference(job)
      expect(activity).toMatchObject({
        ok: true,
        value: {
          kind: "found",
          activity: {
            jobKind: "plugin.action",
            state: "succeeded"
          }
        }
      })
      expect(JSON.stringify(activity)).not.toContain("shared store")
      expect(host.status()).toMatchObject({
        completedCount: 1,
        failedCount: 0,
        lastWorkerStatus: "completed"
      })

      expect(host.start().started).toBe(true)
      expect(host.start().started).toBe(true)
      expect((await host.stop()).started).toBe(false)
      expect((await host.dispose()).disposed).toBe(true)
      await expect(storage.getJob({ jobId: job.id })).resolves.toMatchObject({
        state: "succeeded"
      })
      await expect(host.runOnce()).rejects.toThrow("disposed")
    } finally {
      await fixture.dispose()
    }
  })

  it("applies host-owned grants and retry policy", async () => {
    const fixture = await createFixture({
      grants: [
        {
          pluginId: "plugin.command-host",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["network.fetch"]
        }
      ]
    })

    const { host, client } = fixture

    try {
      const execution = await client.executeProductCommand({
        commandId: "plugin.command-host.echo",
        input: { text: "denied then retry" }
      })
      if (!execution.ok || execution.value.kind !== "completed") {
        throw new Error("expected durable denied command submission")
      }
      const job = execution.value.summary.references.find(
        (reference) => reference.kind === "job"
      )
      if (job === undefined) {
        throw new Error("expected retry job reference")
      }

      await expect(host.runOnce()).resolves.toMatchObject({
        status: "failed",
        jobId: job.id
      })
      await expect(
        client.readExecutionReference(job)
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "found",
          activity: {
            state: "retry_scheduled",
            failureCategory: "retry_pending"
          }
        }
      })
      expect(host.status()).toMatchObject({
        completedCount: 0,
        failedCount: 1,
        lastWorkerStatus: "failed"
      })
    } finally {
      await fixture.dispose()
    }
  })

  it("hot-switches exact versions and reconstructs the same durable revision", async () => {
    const grants = ["1.0.0", "2.0.0"].map((version) => ({
      pluginId: "plugin.command-host",
      version,
      decision: "allow" as const,
      capabilities: ["config.read" as const],
    }))
    const fixture = await createFixture({ grants, maxAttempts: 1 })
    const { host, client, storage, plugin } = fixture

    try {
      const initialRevision = host.status().catalogRevision
      const oldExecution = await client.executeProductCommand({
        commandId: "plugin.command-host.echo",
        input: { text: "queued on version one" },
      })
      if (!oldExecution.ok || oldExecution.value.kind !== "completed") {
        throw new Error("expected old Plugin command submission")
      }
      const oldJob = oldExecution.value.summary.references.find(
        (reference) => reference.kind === "job",
      )
      if (oldJob === undefined) {
        throw new Error("expected old Plugin action job")
      }

      await plugin.activateInstallPlan({
        plan: installPlan("2.0.0"),
        installIdempotencyKey: "product-command-host-install-v2",
      })
      const refreshed = await host.refresh()
      expect(refreshed).toMatchObject({
        status: "succeeded",
        changed: true,
        activePluginCount: 1,
        commandCount: 1,
      })
      expect(refreshed.revision).not.toBe(initialRevision)
      expect(host.status()).toMatchObject({
        activePluginCount: 1,
        commandCount: 1,
        executionHostCount: 2,
        catalogRevision: refreshed.revision,
      })
      expect(activeCommandVersion(host)).toBe("2.0.0")

      await expect(host.runOnce()).resolves.toMatchObject({
        status: "failed",
        jobId: oldJob.id,
      })
      await expect(storage.getJob({ jobId: oldJob.id })).resolves.toMatchObject({
        state: "failed",
      })

      const newExecution = await client.executeProductCommand({
        commandId: "plugin.command-host.echo",
        input: { text: "executed on version two" },
      })
      if (!newExecution.ok || newExecution.value.kind !== "completed") {
        throw new Error("expected new Plugin command submission")
      }
      const newJob = newExecution.value.summary.references.find(
        (reference) => reference.kind === "job",
      )
      if (newJob === undefined) {
        throw new Error("expected new Plugin action job")
      }
      await expect(host.runOnce()).resolves.toMatchObject({
        status: "completed",
        jobId: newJob.id,
      })

      const relaunched = await createPluginCommandHost({
        handle: fixture.handle,
        principalId: "principal_product_command_host_relaunch",
        worker: {
          workerId: "worker_product_command_host_relaunch",
          leaseMs: 60_000,
          grants,
        },
      })
      try {
        expect(relaunched.status()).toMatchObject({
          activePluginCount: 1,
          commandCount: 1,
          executionHostCount: 1,
          catalogRevision: refreshed.revision,
        })
        expect(activeCommandVersion(relaunched)).toBe("2.0.0")
      } finally {
        await relaunched.dispose()
      }
    } finally {
      await fixture.dispose()
    }
  })

  it("keeps the published generation when a new execution host cannot be built", async () => {
    let failingVersion: string | undefined
    const fixture = await createFixture({
      grants: ["1.0.0", "2.0.0"].map((version) => ({
        pluginId: "plugin.command-host",
        version,
        decision: "allow" as const,
        capabilities: ["config.read" as const],
      })),
      createActionHost(request) {
        if (request.manifest.version === failingVersion) {
          throw new Error(`/private/install/${request.manifest.version}`)
        }
        return createTrustedSubprocessPluginActionHostFromInstall(request)
      },
    })
    const oldRevision = fixture.host.status().catalogRevision
    const catalogEvents: SurfaceEvent[] = []
    const unsubscribe = fixture.client.subscribeSurfaceEvents((event) => {
      if (event.type === "product.surface.command-catalog.invalidated") {
        catalogEvents.push(event)
      }
    })

    try {
      await expect(fixture.client.readProductCommands()).resolves.toMatchObject({
        ok: true,
        value: { extensionRevision: oldRevision }
      })
      failingVersion = "2.0.0"
      await fixture.plugin.activateInstallPlan({
        plan: installPlan("2.0.0"),
        installIdempotencyKey: "product-command-host-failing-v2",
      })
      const failed = await fixture.host.refresh()
      expect(failed).toEqual({
        status: "failed",
        revision: oldRevision,
        activePluginCount: 1,
        commandCount: 1,
        diagnostic: {
          code: "host_creation_failed",
          message: "host_creation_failed",
        },
      })
      expect(JSON.stringify(fixture.host.status())).not.toContain("/private")
      expect(fixture.host.status()).toMatchObject({
        catalogRevision: oldRevision,
        executionHostCount: 1,
      })
      expect(activeCommandVersion(fixture.host)).toBe("1.0.0")
      expect(catalogEvents).toEqual([])
      await expect(fixture.client.readProductCommands()).resolves.toMatchObject({
        ok: true,
        value: {
          extensionRevision: oldRevision,
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "plugin.command-host.echo",
              handlerRef: expect.stringContaining("version=1.0.0")
            })
          ])
        }
      })

      failingVersion = undefined
      const recovered = await fixture.host.refresh()
      expect(recovered).toMatchObject({
        status: "succeeded",
        changed: true,
        activePluginCount: 1,
      })
      expect(catalogEvents).toEqual([
        expect.objectContaining({
          type: "product.surface.command-catalog.invalidated",
          commandCatalog: expect.objectContaining({
            revision: recovered.revision
          })
        })
      ])
      expect(fixture.host.status().executionHostCount).toBe(2)
      expect(activeCommandVersion(fixture.host)).toBe("2.0.0")
    } finally {
      unsubscribe()
      await fixture.dispose()
    }
  })

  it("serializes and coalesces concurrent refresh requests", async () => {
    let releaseVersionTwo!: () => void
    let enteredVersionTwo!: () => void
    const versionTwoEntered = new Promise<void>((resolve) => {
      enteredVersionTwo = resolve
    })
    const versionTwoReleased = new Promise<void>((resolve) => {
      releaseVersionTwo = resolve
    })
    let versionTwoFactoryCalls = 0
    const fixture = await createFixture({
      grants: ["1.0.0", "2.0.0"].map((version) => ({
        pluginId: "plugin.command-host",
        version,
        decision: "allow" as const,
        capabilities: ["config.read" as const],
      })),
      async createActionHost(request) {
        if (request.manifest.version === "2.0.0") {
          versionTwoFactoryCalls += 1
          enteredVersionTwo()
          await versionTwoReleased
        }
        return createTrustedSubprocessPluginActionHostFromInstall(request)
      },
    })

    try {
      await fixture.plugin.activateInstallPlan({
        plan: installPlan("2.0.0"),
        installIdempotencyKey: "product-command-host-coalesced-v2",
      })
      const first = fixture.host.refresh()
      await versionTwoEntered
      const second = fixture.host.refresh()
      expect(second).toBe(first)
      releaseVersionTwo()
      const [left, right] = await Promise.all([first, second])
      expect(left).toEqual(right)
      expect(left).toMatchObject({
        status: "succeeded",
        changed: true,
        activePluginCount: 1,
      })
      expect(versionTwoFactoryCalls).toBe(1)
      expect(fixture.host.status().executionHostCount).toBe(2)
    } finally {
      releaseVersionTwo()
      await fixture.dispose()
    }
  })
})

async function createFixture(request: {
  readonly grants: NonNullable<
    Parameters<typeof createPluginCommandHost>[0]["worker"]["grants"]
  >
  readonly maxAttempts?: number
  readonly createActionHost?: NonNullable<
    Parameters<typeof createPluginCommandHost>[0]["createActionHost"]
  >
}) {
  const handle = await createHandle("wanex-plugin-command-host-")
  const storage = Object.assign(
    {},
    handle.core,
    createPluginStore(handle.transport)
  )
  const plugin = new PluginRuntime({ storage })
  await plugin.activateInstallPlan({
    plan: installPlan(),
    installIdempotencyKey: "product-command-host-install"
  })
  const host = await createPluginCommandHost({
    handle,
    principalId: "principal_product_command_host",
    ...(request.createActionHost === undefined
      ? {}
      : { createActionHost: request.createActionHost }),
    worker: {
      workerId: "worker_product_command_host",
      leaseMs: 60_000,
      grants: request.grants,
      loop: { idleIntervalMs: 5, errorIntervalMs: 5 }
    },
    submission: {
      maxAttempts: request.maxAttempts ?? 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 1
      }
    }
  })
  const shell = await createShell({
    storage: { kind: "injected", handle },
    ...host.productBinding,
    modelEndpoint: {
      id: "product-command-host-provider",
      connection: {
        id: "product-command-host-provider",
        providerId: "fake"
      },
      protocol: { id: "fake" },
      model: {
        id: "product-command-host-model",
        operations: ["conversation"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        catalog: {
          source: "builtin",
          catalogId: "product-command-host.fake",
          revision: "1"
        }
      }
    }
  })
  const surface = createSurfaceAdapter(shell)
  const client = createSurfaceClient(
    createInProcessSurfaceClientTransport(surface)
  )
  let disposePromise: Promise<void> | undefined
  return {
    host,
    handle,
    client,
    storage,
    plugin,
    dispose() {
      disposePromise ??= (async () => {
        await host.dispose()
        await surface.dispose()
        await shell.dispose()
      })()
      return disposePromise
    }
  }
}

async function createHandle(prefix: string): Promise<StorageHandle> {
  const storeDir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(storeDir)
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin,
  })
  handles.push(handle)
  return handle
}

function activeCommandVersion(host: Awaited<ReturnType<typeof createPluginCommandHost>>) {
  const command = host.productBinding.extensions.source
    .current()
    .snapshot.byDomain.command.byId.get("plugin.command-host.echo")
  if (command === undefined) {
    throw new Error("active Plugin command was not published")
  }
  const handler = parsePluginActionHandlerRef(command.value.handlerRef)
  if (handler === undefined) {
    throw new Error("active Plugin command handler is invalid")
  }
  return handler.version
}

function installPlan(version = "1.0.0") {
  return {
    kind: "wanex.plugin.install-plan.v1",
    layout: {
      kind: "wanex.plugin.package.layout.v1",
      pluginId: "plugin.command-host",
      version,
      name: "Plugin Command Host",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command: basename(execPath),
        args: [pluginHostFixture],
        timeoutMs: 1_000,
        actions: [{ actionId: "echo", capability: "config.read" }]
      },
      capabilities: ["config.read"],
      contributes: {
        commands: [
          {
            id: "plugin.command-host.echo",
            name: "plugin.command-host.echo",
            title: "Plugin Echo",
            category: "plugin",
            paletteVisibility: "visible",
            actionId: "echo",
            inputSchema: {
              type: "object",
              properties: {
                text: { type: "string", minLength: 3 }
              },
              required: ["text"],
              additionalProperties: false
            }
          }
        ]
      }
    },
    source: {
      kind: "local",
      uri: "file:///plugins/plugin.command-host"
    },
    signature: { kind: "local-dev", verified: true },
    install: { rootDir: dirname(execPath) },
    decision: { status: "allow" }
  } as const
}
