import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { execPath } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import { PluginRuntime } from "@wanex/plugin"
import { createStorageHandle, type StorageHandle } from "@wanex/storage"
import { createPluginStore } from "@wanex/storage/plugin"
import {
  createProductAppCommandHost,
  pluginActionHandlerRef
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

describe("@wanex/product-app-command-host", () => {
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
    const { host, storage } = fixture

    try {
      expect(host.status()).toEqual({
        kind: "product-app-command-host.status",
        started: false,
        disposed: false,
        pluginCount: 1,
        completedCount: 0,
        failedCount: 0
      })
      const catalog = await host.client.readProductCommands()
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
        host.client.previewProductCommandInvocation({
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
        host.client.executeProductCommand({
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
        host.client.previewProductCommandInvocation({
          commandId: "plugin.command-host.echo",
          input: { text: "shared store" }
        })
      ).resolves.toMatchObject({ ok: true, value: { kind: "runnable" } })
      const execution = await host.client.executeProductCommand({
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
        host.client.readExecutionReference(job)
      ).resolves.toMatchObject({
        ok: true,
        value: { kind: "found", activity: { state: "ready" } }
      })

      await expect(host.runOnce()).resolves.toMatchObject({
        status: "completed",
        jobId: job.id
      })
      const activity = await host.client.readExecutionReference(job)
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
      await host.dispose()
    }
  })

  it("applies host-owned grants and retry policy", async () => {
    const { host } = await createFixture({
      grants: [
        {
          pluginId: "plugin.command-host",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["network.fetch"]
        }
      ]
    })

    try {
      const execution = await host.client.executeProductCommand({
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
        host.client.readExecutionReference(job)
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
      await host.dispose()
    }
  })
})

async function createFixture(request: {
  readonly grants: NonNullable<
    Parameters<typeof createProductAppCommandHost>[0]["worker"]["grants"]
  >
}) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-command-host-"))
  tempDirs.push(storeDir)
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  handles.push(handle)
  const storage = Object.assign(
    {},
    handle.core,
    createPluginStore(handle.transport)
  )
  const plugin = new PluginRuntime({ storage })
  await plugin.registerInstallPlan({
    plan: installPlan(),
    installIdempotencyKey: "product-command-host-install"
  })
  const handlerRef = pluginActionHandlerRef({
    kind: "plugin_action",
    pluginId: "plugin.command-host",
    version: "1.0.0",
    actionId: "echo",
    requiredCapability: "config.read"
  })
  const contribution: AppCommandContribution = {
    id: "plugin.command-host.echo",
    domain: "command",
    value: {
      name: "plugin.command-host.echo",
      title: "Plugin Echo",
      handlerRef,
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", minLength: 3 }
        },
        required: ["text"],
        additionalProperties: false
      }
    },
    provenance: {
      source: {
        kind: "plugin",
        scope: "user",
        id: "plugin.command-host",
        label: "Plugin Command Host",
        version: "1.0.0"
      },
      trust: "user_enabled"
    },
    privileged: true
  }
  const host = await createProductAppCommandHost({
    handle,
    extensionSnapshot: resolveAppExtensionContributions([contribution]),
    principalId: "principal_product_command_host",
    plugins: [
      { pluginId: "plugin.command-host", version: "1.0.0" }
    ],
    worker: {
      workerId: "worker_product_command_host",
      leaseMs: 60_000,
      grants: request.grants,
      loop: { idleIntervalMs: 5, errorIntervalMs: 5 }
    },
    submission: {
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 1
      }
    },
    productApp: {
      providerProfile: {
        id: "product-command-host-provider",
        modelId: "product-command-host-model"
      }
    }
  })
  return { host, storage }
}

function installPlan() {
  return {
    kind: "wanex.plugin.install-plan.v1",
    layout: {
      kind: "wanex.plugin.package.layout.v1",
      pluginId: "plugin.command-host",
      version: "1.0.0",
      name: "Plugin Command Host",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command: basename(execPath),
        args: [pluginHostFixture],
        timeoutMs: 1_000,
        actions: [{ actionId: "echo", capability: "config.read" }]
      },
      capabilities: ["config.read"]
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
