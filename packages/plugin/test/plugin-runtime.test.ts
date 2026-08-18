import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { execPath } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexWorker } from "@wanex/runtime/jobs"
import {
  createPluginActionWorker,
  createSubprocessPluginActionHost,
  createSubprocessPluginActionHostFromManifest,
  createTrustedSubprocessPluginActionHostFromInstall,
  createTrustedSubprocessPluginActionHostFromManifest,
  createPluginPermissionGrantGuard,
  createPluginSandboxGuard,
  pluginInstallPlanFromJson,
  pluginPackageTrustRecordFromJson,
  pluginPackageTrustRecordFromInstallPlan,
  pluginPackageLayoutFromJson,
  pluginSubprocessManifestEntryFromJson,
  registerPluginManifestRequestFromPackageLayout,
  resolveTrustedPluginCommand,
  type PluginActionHost,
  registerPluginActionJobHandler,
  PluginRuntime
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const pluginHostFixture = join(
  import.meta.dirname,
  "fixtures/plugin-host-fixture.mjs"
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []
let workerCounter = 0

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

describe("@wanex/plugin", () => {
  it("registers connector manifests and submits durable plugin action jobs", async () => {
    const { runtime } = await createRuntime()
    const manifest = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      entry: { kind: "process", command: "telegram-connector" },
      capabilities: [
        "channel.connect",
        "channel.receive",
        "channel.deliver",
        "team.conversation.write"
      ],
      metadata: { connector: true },
      idempotencyKey: "runtime-plugin-telegram"
    })
    const duplicate = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      entry: { kind: "process", command: "telegram-connector" },
      capabilities: manifest.capabilities,
      metadata: { connector: true },
      idempotencyKey: "runtime-plugin-telegram"
    })
    expect(duplicate.id).toBe(manifest.id)

    await expect(runtime.getManifest("connector.telegram")).resolves.toMatchObject(
      {
        id: manifest.id,
        state: "registered"
      }
    )
    await expect(
      runtime.listManifests({ capability: "channel.deliver" })
    ).resolves.toMatchObject([{ id: manifest.id }])

    const submitted = await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { chatId: "123", text: "hello" },
      requiredCapability: "channel.deliver",
      jobId: "job_runtime_plugin_deliver",
      jobIdempotencyKey: "runtime-plugin-deliver-job"
    })
    expect(submitted.job).toMatchObject({
      id: "job_runtime_plugin_deliver",
      kind: "plugin.action"
    })
    expect(submitted.job.payload).toMatchObject({
      pluginId: "connector.telegram",
      actionId: "deliver-message",
      payload: { text: "hello" }
    })

    await expect(
      runtime.submitAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "fetch-url",
        principalId: "principal_plugin_runtime",
        payload: {},
        requiredCapability: "network.fetch"
      })
    ).rejects.toThrow(/capability not declared/)

    await expect(
      runtime.updateManifestState("connector.telegram", "disabled", "1.0.0")
    ).resolves.toMatchObject({
      state: "disabled",
      disabledAt: expect.any(Number)
    })
  })

  it("executes plugin.action jobs only through the declared action catalog", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    const submitted = await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "hello" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_allowed"
    })
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "channel.deliver",
          handler: async ({ manifest, payload }) => ({
            delivered: true,
            pluginVersion: manifest.version,
            payload
          })
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed plugin action")
    }
    expect(result.job.id).toBe(submitted.job.id)
    expect(result.job.result).toMatchObject({
      delivered: true,
      pluginVersion: "1.0.0",
      payload: { text: "hello" }
    })
  })

  it("executes plugin.action jobs through an injected action host", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "hello" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_custom_host"
    })
    const calls: string[] = []
    const host: PluginActionHost = {
      resolve(request) {
        calls.push(`resolve:${request.pluginId}/${request.actionId}`)
        return {
          capability: "channel.deliver",
          version: "1.0.0"
        }
      },
      execute(request) {
        calls.push(`execute:${request.manifest.pluginId}/${request.actionId}`)
        return {
          hosted: true,
          capability: request.capability,
          payload: request.payload
        }
      }
    }
    workerCounter += 1
    const worker = createPluginActionWorker({
      storage,
      workerId: `worker_plugin_action_${workerCounter}`,
      leaseMs: 60_000,
      host
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed host action")
    }
    expect(calls).toEqual([
      "resolve:connector.telegram/deliver-message",
      "execute:connector.telegram/deliver-message"
    ])
    expect(result.job.result).toMatchObject({
      hosted: true,
      capability: "channel.deliver",
      payload: { text: "hello" }
    })
  })

  it("rejects plugin.action jobs missing a catalog handler", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_missing_catalog"
    })
    const worker = createPluginWorker(storage, {})

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed plugin action")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin action handler not registered"
    )
  })

  it("rechecks capability before executing plugin.action jobs", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_mismatch"
    })
    const mismatchWorker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "network.fetch",
          handler: () => ({ unreachable: true })
        }
      }
    })

    const mismatch = await mismatchWorker.runOnce()

    expect(mismatch.status).toBe("failed")
    if (mismatch.status !== "failed") {
      throw new Error("expected failed mismatch action")
    }
    expect(JSON.stringify(mismatch.job?.lastError)).toContain(
      "required capability mismatch"
    )
  })

  it("rechecks manifest state before executing plugin.action jobs", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_disabled"
    })
    await runtime.updateManifestState("connector.telegram", "disabled", "1.0.0")
    const disabledWorker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "channel.deliver",
          handler: () => ({ unreachable: true })
        }
      }
    })

    const disabled = await disabledWorker.runOnce()

    expect(disabled.status).toBe("failed")
    if (disabled.status !== "failed") {
      throw new Error("expected failed disabled action")
    }
    expect(JSON.stringify(disabled.job?.lastError)).toContain(
      "plugin manifest is not registered"
    )
  })

  it("fails queued actions closed when the exact install is disabled", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_install_disabled"
    })
    await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "installed",
      state: "disabled"
    })
    let called = false
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "channel.deliver",
          handler: () => {
            called = true
            return { unreachable: true }
          }
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(called).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected disabled install action to fail")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin install is not installed"
    )
  })

  it("allows actions already inside immutable host execution to complete", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_disable_while_running"
    })
    let signalStarted: () => void = () => undefined
    const started = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted
    })
    let releaseExecution: () => void = () => undefined
    const released = new Promise<void>((resolveReleased) => {
      releaseExecution = resolveReleased
    })
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "channel.deliver",
          async handler() {
            signalStarted()
            await released
            return { completedAfterDisable: true }
          }
        }
      }
    })

    const running = worker.runOnce()
    await started
    await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "installed",
      state: "disabled"
    })
    releaseExecution()
    const result = await running

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected admitted action to complete")
    }
    expect(result.job.result).toEqual({ completedAfterDisable: true })
  })

  it("rejects plugin.action handler results that are not JSON-safe", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_bad_result"
    })
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "deliver-message": {
          version: "1.0.0",
          capability: "channel.deliver",
          handler: () => ({ callback: () => "not json" }) as never
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed bad result action")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain("JSON-safe")
  })

  it("denies declared sandbox access by default before running handlers", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: { endpoint: "api.telegram.example" },
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_sandbox_default_deny"
    })
    let called = false
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "fetch-profile": {
          version: "1.0.0",
          capability: "network.fetch",
          sandbox: {
            networks: ["api.telegram.example"],
            resources: ["telegram:profile"],
            fileSystemPaths: ["/tmp/wanex/plugin-cache"]
          },
          handler: () => {
            called = true
            return { unreachable: true }
          }
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(called).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected failed sandbox denial")
    }
    const lastError = JSON.stringify(result.job?.lastError)
    expect(lastError).toContain("plugin sandbox denied")
    expect(lastError).not.toContain("api.telegram.example")
    expect(lastError).not.toContain("/tmp/wanex/plugin-cache")
  })

  it("allows sandboxed plugin.action jobs when policy permits requested access", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: { endpoint: "api.telegram.example" },
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_sandbox_allowed"
    })
    const worker = createPluginWorker(
      storage,
      {
        "connector.telegram": {
          "fetch-profile": {
            version: "1.0.0",
            capability: "network.fetch",
            sandbox: {
              networks: ["api.telegram.example"],
              resources: ["telegram:profile"],
              fileSystemPaths: ["/tmp/wanex/plugin-cache"],
              maxExecutionMs: 1_000
            },
            handler: ({ payload }) => ({ fetched: true, payload })
          }
        }
      },
      {
        sandbox: createPluginSandboxGuard({
          pluginId: "connector.telegram",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["network.fetch"],
          networks: ["api.telegram.example"],
          resources: ["telegram:profile"],
          fileSystemPaths: ["/tmp/wanex/plugin-cache"],
          maxExecutionMs: 2_000
        })
      }
    )

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed sandboxed action")
    }
    expect(result.job.result).toMatchObject({
      fetched: true,
      payload: { endpoint: "api.telegram.example" }
    })
  })

  it("allows plugin.action jobs when a permission grant matches requested access", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: { endpoint: "api.telegram.example" },
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_permission_grant_allowed"
    })
    const worker = createPluginWorker(
      storage,
      {
        "connector.telegram": {
          "fetch-profile": {
            version: "1.0.0",
            capability: "network.fetch",
            sandbox: {
              networks: ["api.telegram.example"],
              resources: ["telegram:profile"],
              maxExecutionMs: 500
            },
            handler: ({ payload }) => ({ granted: true, payload })
          }
        }
      },
      {
        sandbox: createPluginPermissionGrantGuard([
          {
            pluginId: "connector.telegram",
            version: "1.0.0",
            decision: "allow",
            capabilities: ["network.fetch"],
            networks: ["api.telegram.example"],
            resources: ["telegram:profile"],
            maxExecutionMs: 1_000
          }
        ])
      }
    )

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed permission grant action")
    }
    expect(result.job.result).toMatchObject({
      granted: true,
      payload: { endpoint: "api.telegram.example" }
    })
  })

  it("fails closed when no plugin permission grant matches requested access", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_permission_grant_denied"
    })
    let called = false
    const worker = createPluginWorker(
      storage,
      {
        "connector.telegram": {
          "fetch-profile": {
            version: "1.0.0",
            capability: "network.fetch",
            sandbox: {
              networks: ["api.telegram.example"]
            },
            handler: () => {
              called = true
              return { unreachable: true }
            }
          }
        }
      },
      {
        sandbox: createPluginPermissionGrantGuard([
          {
            pluginId: "connector.telegram",
            version: "1.0.0",
            decision: "allow",
            capabilities: ["network.fetch"],
            networks: ["api.other.example"]
          }
        ])
      }
    )

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(called).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected failed missing permission grant")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin sandbox denied"
    )
  })

  it("gives deny plugin permission grants precedence over allow grants", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_permission_grant_deny_precedence"
    })
    let called = false
    const worker = createPluginWorker(
      storage,
      {
        "connector.telegram": {
          "fetch-profile": {
            version: "1.0.0",
            capability: "network.fetch",
            sandbox: {
              networks: ["api.telegram.example"]
            },
            handler: () => {
              called = true
              return { unreachable: true }
            }
          }
        }
      },
      {
        sandbox: createPluginPermissionGrantGuard([
          {
            pluginId: "connector.telegram",
            decision: "allow",
            capabilities: ["network.fetch"],
            networks: ["api.telegram.example"]
          },
          {
            pluginId: "connector.telegram",
            decision: "deny",
            capabilities: ["network.fetch"],
            networks: ["api.telegram.example"],
            reason: "network temporarily blocked"
          }
        ])
      }
    )

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(called).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected failed deny precedence")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin sandbox denied"
    )
  })

  it("denies plugin.action jobs when the sandbox policy omits the action capability", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_sandbox_capability_denied"
    })
    let called = false
    const worker = createPluginWorker(
      storage,
      {
        "connector.telegram": {
          "fetch-profile": {
            version: "1.0.0",
            capability: "network.fetch",
            handler: () => {
              called = true
              return { unreachable: true }
            }
          }
        }
      },
      {
        sandbox: createPluginSandboxGuard({
          pluginId: "connector.telegram",
          version: "1.0.0",
          decision: "allow",
          capabilities: ["channel.deliver"]
        })
      }
    )

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(called).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected failed sandbox capability denial")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin sandbox denied"
    )
  })

  it("does not execute injected action hosts after sandbox denial", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_host_sandbox_denied"
    })
    let executed = false
    const host: PluginActionHost = {
      resolve: () => ({
        capability: "network.fetch",
        version: "1.0.0",
        sandbox: { networks: ["api.telegram.example"] }
      }),
      execute: () => {
        executed = true
        return { unreachable: true }
      }
    }
    const worker = createPluginWorker(storage, {}, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(executed).toBe(false)
    if (result.status !== "failed") {
      throw new Error("expected failed host sandbox denial")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin sandbox denied"
    )
  })

  it("executes plugin.action jobs through a subprocess action host", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "hello subprocess" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_subprocess"
    })
    const host = createSubprocessPluginActionHost({
      descriptors: [
        {
          pluginId: "connector.telegram",
          actionId: "deliver-message",
          version: "1.0.0",
          capability: "channel.deliver"
        }
      ],
      command: execPath,
      args: [pluginHostFixture]
    })
    const worker = createPluginWorker(storage, undefined, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed subprocess action")
    }
    expect(result.job.result).toMatchObject({
      subprocess: true,
      jobId: "job_plugin_action_subprocess",
      pluginId: "connector.telegram",
      actionId: "deliver-message",
      capability: "channel.deliver",
      payload: { text: "hello subprocess" }
    })
  })

  it("fails subprocess plugin.action jobs with safe non-zero exit errors", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_subprocess_exit"
    })
    const host = createFixtureSubprocessHost("exit")
    const worker = createPluginWorker(storage, undefined, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed subprocess exit")
    }
    const lastError = JSON.stringify(result.job?.lastError)
    expect(lastError).toContain("plugin subprocess exited with code 7")
    expect(lastError).toContain("planned child exit")
  })

  it("fails subprocess plugin.action jobs with invalid response errors", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_subprocess_invalid"
    })
    const host = createFixtureSubprocessHost("invalid-json")
    const worker = createPluginWorker(storage, undefined, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed subprocess invalid response")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin subprocess returned invalid JSON"
    )
  })

  it("kills subprocess plugin.action jobs that exceed host timeout", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_subprocess_timeout"
    })
    const host = createFixtureSubprocessHost("sleep", 50)
    const worker = createPluginWorker(storage, undefined, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed subprocess timeout")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin subprocess timed out after 50ms"
    )
  })

  it("fails subprocess actions whose protocol stdout exceeds the hard limit", async () => {
    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_subprocess_large_output"
    })
    const host = createFixtureSubprocessHost("large-output", 1_000, 128)
    const worker = createPluginWorker(storage, undefined, { host })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed subprocess stdout limit")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "plugin subprocess stdout exceeded 128 bytes"
    )
  })

  it("parses subprocess manifest entries with action sandbox declarations", () => {
    const entry = pluginSubprocessManifestEntryFromJson({
      kind: "wanex.plugin.host.subprocess.v1",
      command: execPath,
      args: [pluginHostFixture],
      timeoutMs: 1_000,
      actions: [
        {
          actionId: "fetch-profile",
          capability: "network.fetch",
          sandbox: {
            networks: ["api.telegram.example"],
            resources: ["telegram:profile"],
            maxExecutionMs: 500
          }
        }
      ]
    })

    expect(entry).toMatchObject({
      kind: "wanex.plugin.host.subprocess.v1",
      command: execPath,
      timeoutMs: 1_000,
      actions: [
        {
          actionId: "fetch-profile",
          capability: "network.fetch",
          sandbox: {
            networks: ["api.telegram.example"],
            resources: ["telegram:profile"],
            maxExecutionMs: 500
          }
        }
      ]
    })
  })

  it("rejects invalid subprocess manifest entries", () => {
    expect(() =>
      pluginSubprocessManifestEntryFromJson({
        kind: "wanex.plugin.host.subprocess.v1",
        command: execPath,
        actions: []
      })
    ).toThrow(/actions must not be empty/)

    expect(() =>
      pluginSubprocessManifestEntryFromJson({
        kind: "wanex.plugin.host.subprocess.v1",
        command: execPath,
        actions: [
          {
            actionId: "bad",
            capability: "unknown.capability"
          }
        ]
      })
    ).toThrow(/invalid plugin capability/)

    expect(() =>
      pluginSubprocessManifestEntryFromJson({
        kind: "wanex.plugin.host.subprocess.v1",
        command: execPath,
        actions: [
          {
            actionId: "legacy-versioned-action",
            capability: "channel.deliver",
            version: "1.0.0"
          }
        ]
      })
    ).toThrow(/package version is authoritative/)
  })

  it("creates subprocess action hosts from plugin manifest entries", async () => {
    const { runtime, storage } = await createRuntime()
    const manifest = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command: execPath,
        args: [pluginHostFixture],
        timeoutMs: 1_000,
        actions: [
          {
            actionId: "deliver-message",
            capability: "channel.deliver"
          }
        ]
      },
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "from manifest" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_manifest_subprocess"
    })
    const worker = createPluginWorker(storage, undefined, {
      host: createSubprocessPluginActionHostFromManifest(manifest)
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed manifest subprocess action")
    }
    expect(result.job.result).toMatchObject({
      subprocess: true,
      pluginId: "connector.telegram",
      actionId: "deliver-message",
      payload: { text: "from manifest" }
    })
  })

  it("parses plugin package trust records", () => {
    const trust = pluginPackageTrustRecordFromJson({
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      source: {
        kind: "archive",
        uri: "file:///plugins/connector-telegram.tgz",
        publisher: "wanex.example",
        revision: "rev_1"
      },
      integrity: {
        sha256: "a".repeat(64)
      },
      signature: {
        kind: "cosign",
        signer: "wanex.example",
        verified: true
      },
      install: {
        rootDir: "/tmp/wanex-plugin-connector-telegram"
      },
      decision: {
        status: "allow"
      }
    })

    expect(trust).toMatchObject({
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      source: { kind: "archive" },
      integrity: { sha256: "a".repeat(64) },
      signature: { verified: true },
      install: { rootDir: "/tmp/wanex-plugin-connector-telegram" },
      decision: { status: "allow" }
    })
  })

  it("rejects untrusted plugin package execution decisions", async () => {
    const { runtime } = await createRuntime()
    const manifest = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      entry: subprocessManifestEntry(relative(process.cwd(), pluginHostFixture)),
      capabilities: ["channel.deliver"]
    })

    expect(() =>
      createTrustedSubprocessPluginActionHostFromManifest({
        manifest,
        trust: trustRecord({ decision: "review-required" })
      })
    ).toThrow(/trust decision is not allow/)

    expect(() =>
      createTrustedSubprocessPluginActionHostFromManifest({
        manifest,
        trust: trustRecord({ signatureVerified: false })
      })
    ).toThrow(/signature is not verified/)
  })

  it("rejects plugin package trust records that do not match manifest identity", async () => {
    const { runtime } = await createRuntime()
    const manifest = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      entry: subprocessManifestEntry(relative(process.cwd(), pluginHostFixture)),
      capabilities: ["channel.deliver"]
    })

    expect(() =>
      createTrustedSubprocessPluginActionHostFromManifest({
        manifest,
        trust: trustRecord({ pluginId: "connector.other" })
      })
    ).toThrow(/pluginId does not match/)

    expect(() =>
      createTrustedSubprocessPluginActionHostFromManifest({
        manifest,
        trust: trustRecord({ version: "2.0.0" })
      })
    ).toThrow(/version does not match/)
  })

  it("resolves trusted plugin commands inside the install root", () => {
    const installRoot = resolve(tmpdir(), "wanex-plugin-test", "demo")

    expect(resolveTrustedPluginCommand(installRoot, "bin/plugin.mjs")).toBe(
      resolve(installRoot, "bin/plugin.mjs")
    )

    expect(() =>
      resolveTrustedPluginCommand(installRoot, execPath)
    ).toThrow(/must be relative/)

    expect(() =>
      resolveTrustedPluginCommand(installRoot, "../escape.mjs")
    ).toThrow(/escapes install root/)
  })

  it("creates trusted subprocess action hosts from installed plugin metadata", async () => {
    const { runtime, storage } = await createRuntime()
    const installRoot = dirname(execPath)
    const command = basename(execPath)
    const manifest = await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      entry: subprocessManifestEntry(command, [pluginHostFixture]),
      capabilities: ["channel.deliver"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "trusted manifest" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_trusted_manifest_subprocess"
    })
    const worker = createPluginWorker(storage, undefined, {
      host: createTrustedSubprocessPluginActionHostFromManifest({
        manifest,
        trust: trustRecord({ installRootDir: installRoot })
      })
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed trusted manifest subprocess action")
    }
    expect(result.job.result).toMatchObject({
      subprocess: true,
      pluginId: "connector.telegram",
      actionId: "deliver-message",
      payload: { text: "trusted manifest" }
    })
  })

  it("creates trusted subprocess action hosts from durable install records", async () => {
    const { runtime, storage } = await createRuntime()
    const installRoot = dirname(execPath)
    const command = basename(execPath)
    const registered = await runtime.activateInstallPlan({
      plan: {
        ...pluginInstallPlan(),
        layout: {
          ...pluginPackageLayout(),
          entry: subprocessManifestEntry(command, [pluginHostFixture])
        },
        source: {
          kind: "local",
          uri: "file:///plugins/connector.telegram"
        },
        install: {
          rootDir: installRoot
        }
      },
      installIdempotencyKey: "install-plan-telegram-durable-host"
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "durable install" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_durable_install_subprocess"
    })
    const worker = createPluginWorker(storage, undefined, {
      host: createTrustedSubprocessPluginActionHostFromInstall({
        manifest: registered.manifest,
        install: registered.install
      })
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed durable install subprocess action")
    }
    expect(result.job.result).toMatchObject({
      subprocess: true,
      pluginId: "connector.telegram",
      actionId: "deliver-message",
      cwd: installRoot,
      payload: { text: "durable install" }
    })
  })

  it("loads trusted subprocess action hosts from runtime storage", async () => {
    const { runtime, storage } = await createRuntime()
    const installRoot = dirname(execPath)
    const command = basename(execPath)
    await runtime.activateInstallPlan({
      plan: {
        ...pluginInstallPlan(),
        layout: {
          ...pluginPackageLayout(),
          entry: subprocessManifestEntry(command, [pluginHostFixture])
        },
        install: {
          rootDir: installRoot
        }
      },
      installIdempotencyKey: "install-plan-telegram-storage-host"
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_plugin_runtime",
      payload: { text: "storage host" },
      requiredCapability: "channel.deliver",
      jobId: "job_plugin_action_runtime_storage_host"
    })
    const worker = createPluginWorker(storage, undefined, {
      host: await runtime.createTrustedSubprocessActionHost(
        "connector.telegram",
        "1.0.0"
      )
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed storage-backed host action")
    }
    expect(result.job.result).toMatchObject({
      payload: { text: "storage host" }
    })
  })

  it("rejects trusted subprocess hosts for disabled or removed installs", async () => {
    const { runtime } = await createRuntime()
    const registered = await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      installIdempotencyKey: "install-plan-telegram-host-disabled"
    })
    const disabled = await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "installed",
      state: "disabled"
    })

    expect(() =>
      createTrustedSubprocessPluginActionHostFromInstall({
        manifest: registered.manifest,
        install: disabled
      })
    ).toThrow(/plugin install is not installed: disabled/)
    await expect(
      runtime.createTrustedSubprocessActionHost("connector.telegram", "1.0.0")
    ).rejects.toThrow(/plugin install is not installed: disabled/)

    const removed = await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "disabled",
      state: "removed"
    })
    expect(() =>
      createTrustedSubprocessPluginActionHostFromInstall({
        manifest: registered.manifest,
        install: removed
      })
    ).toThrow(/plugin install is not installed: removed/)
  })

  it("parses plugin package layouts and derives manifest registration requests", () => {
    const layout = pluginPackageLayoutFromJson(pluginPackageLayout())

    expect(layout).toMatchObject({
      kind: "wanex.plugin.package.layout.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["channel.deliver"],
      entry: {
        command: "bin/plugin-host.mjs",
        actions: [{ actionId: "deliver-message" }]
      },
      files: [
        {
          path: "bin/plugin-host.mjs",
          executable: true
        }
      ]
    })
    expect(registerPluginManifestRequestFromPackageLayout(layout)).toMatchObject({
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      capabilities: ["channel.deliver"],
      idempotencyKey: "plugin-package-layout:connector.telegram:1.0.0",
      entry: {
        kind: "wanex.plugin.host.subprocess.v1",
        command: "bin/plugin-host.mjs"
      }
    })
  })

  it("rejects plugin package layouts with undeclared action capabilities", () => {
    expect(() =>
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        capabilities: ["channel.receive"]
      })
    ).toThrow(/action capability is not declared/)
  })

  it("rejects plugin package layouts with unsafe package paths", () => {
    expect(() =>
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        entry: subprocessManifestEntry("/usr/bin/node")
      })
    ).toThrow(/entry command must be relative/)

    expect(() =>
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        files: [{ path: "../escape.mjs" }]
      })
    ).toThrow(/file path escapes package root/)
  })

  it("requires bundled runtime dependencies to stay lazy and budgeted", () => {
    expect(() =>
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        runtimeDependencies: [
          {
            name: "heavy-plugin-sdk",
            distribution: "bundled",
            loading: "startup",
            maxPackedBytes: 1024
          }
        ]
      })
    ).toThrow(/must be lazy-loaded/)

    expect(() =>
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        runtimeDependencies: [
          {
            name: "heavy-plugin-sdk",
            distribution: "bundled",
            loading: "lazy",
            maxPackedBytes: 0
          }
        ]
      })
    ).toThrow(/must declare maxPackedBytes/)

    expect(
      pluginPackageLayoutFromJson({
        ...pluginPackageLayout(),
        runtimeDependencies: [
          {
            name: "heavy-plugin-sdk",
            distribution: "bundled",
            loading: "lazy",
            maxPackedBytes: 1024
          }
        ]
      })
    ).toMatchObject({
      runtimeDependencies: [
        {
          name: "heavy-plugin-sdk",
          distribution: "bundled",
          loading: "lazy",
          maxPackedBytes: 1024
        }
      ]
    })
  })

  it("parses plugin install plans and derives trust records", () => {
    const plan = pluginInstallPlanFromJson(pluginInstallPlan())
    const trust = pluginPackageTrustRecordFromInstallPlan(plan)

    expect(plan.layout.pluginId).toBe("connector.telegram")
    expect(trust).toMatchObject({
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      source: { kind: "archive" },
      integrity: { sha256: "b".repeat(64) },
      signature: { verified: true },
      install: { rootDir: "/plugins/connector.telegram/1.0.0" },
      decision: { status: "allow" }
    })
  })

  it("registers plugin install plans as manifest and durable install records", async () => {
    const { runtime, storage } = await createRuntime()

    const registered = await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      manifestId: "manifest_connector_telegram_install_plan",
      manifestIdempotencyKey: "manifest-install-plan-telegram",
      installId: "install_connector_telegram_1_0_0",
      installIdempotencyKey: "install-plan-telegram"
    })

    expect(registered.manifest).toMatchObject({
      id: "manifest_connector_telegram_install_plan",
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      capabilities: ["channel.deliver"]
    })
    expect(registered.install).toMatchObject({
      id: "install_connector_telegram_1_0_0",
      pluginId: "connector.telegram",
      version: "1.0.0",
      state: "installed",
      installRootDir: "/plugins/connector.telegram/1.0.0",
      layout: {
        kind: "wanex.plugin.package.layout.v1",
        entry: {
          command: "bin/plugin-host.mjs"
        }
      },
      trust: {
        kind: "wanex.plugin.package.trust.v1",
        source: { kind: "archive" },
        signature: { verified: true }
      }
    })
    expect(registered.trust).toMatchObject({
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      decision: { status: "allow" }
    })

    await expect(
      storage.getPluginInstall({
        pluginId: "connector.telegram",
        version: "1.0.0"
      })
    ).resolves.toMatchObject({
      id: "install_connector_telegram_1_0_0",
      state: "installed"
    })
    await expect(storage.listPluginInstalls({ state: "installed" })).resolves
      .toHaveLength(1)
  })

  it("keeps plugin install plan registration idempotent", async () => {
    const { runtime } = await createRuntime()

    const first = await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      installIdempotencyKey: "install-plan-telegram-idempotent"
    })
    const second = await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      installIdempotencyKey: "install-plan-telegram-idempotent"
    })

    expect(second.manifest.id).toBe(first.manifest.id)
    expect(second.install.id).toBe(first.install.id)
  })

  it("updates plugin install lifecycle state through the runtime facade", async () => {
    const { runtime } = await createRuntime()
    const registered = await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      installIdempotencyKey: "install-plan-telegram-lifecycle"
    })

    const disabled = await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "installed",
      state: "disabled"
    })
    expect(disabled).toMatchObject({
      id: registered.install.id,
      state: "disabled"
    })
    expect(disabled.disabledAt).toEqual(expect.any(Number))
    expect(disabled.removedAt).toBeUndefined()

    const restored = await runtime.updateInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "disabled",
      state: "installed"
    })
    expect(restored).toMatchObject({
      id: registered.install.id,
      state: "installed"
    })
    expect(restored.disabledAt).toBeUndefined()
    expect(restored.removedAt).toBeUndefined()
  })

  it("rejects conflicting plugin install plans for the same plugin version", async () => {
    const { runtime } = await createRuntime()
    await runtime.activateInstallPlan({
      plan: pluginInstallPlan(),
      installIdempotencyKey: "install-plan-telegram-conflict"
    })

    await expect(
      runtime.activateInstallPlan({
        plan: {
          ...pluginInstallPlan(),
          install: {
            rootDir: "/plugins/connector.telegram/conflicting"
          }
        },
        installIdempotencyKey: "install-plan-telegram-conflict"
      })
    ).rejects.toThrow(/plugin install already exists with different content/)
  })

  it("validates plugin sandbox policies and action access requests", async () => {
    expect(() =>
      createPluginSandboxGuard({
        pluginId: "connector.telegram",
        decision: "allow",
        capabilities: ["network.fetch"],
        networks: [""]
      })
    ).toThrow(/entries must not be empty/)

    const { runtime, storage } = await createRuntime()
    await runtime.registerManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      capabilities: ["network.fetch"]
    })
    await runtime.submitAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "fetch-profile",
      principalId: "principal_plugin_runtime",
      payload: {},
      requiredCapability: "network.fetch",
      jobId: "job_plugin_action_sandbox_bad_request"
    })
    const worker = createPluginWorker(storage, {
      "connector.telegram": {
        "fetch-profile": {
          version: "1.0.0",
          capability: "network.fetch",
          sandbox: { maxExecutionMs: 0 },
          handler: () => ({ unreachable: true })
        }
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed sandbox request validation")
    }
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "maxExecutionMs must be positive"
    )
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: PluginRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-plugin-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new ExecutableFixturePluginRuntime(storage)
  return { storeDir, storage, runtime }
}

class ExecutableFixturePluginRuntime extends PluginRuntime {
  constructor(private readonly fixtureStorage: StorageTestStore) {
    super({ storage: fixtureStorage })
  }

  override async registerManifest(
    request: Parameters<PluginRuntime["registerManifest"]>[0]
  ) {
    const manifest = await super.registerManifest(request)
    const existing = await this.fixtureStorage.getPluginInstall({
      pluginId: manifest.pluginId,
      version: manifest.version
    })
    if (existing !== null) {
      return manifest
    }
    const installRootDir = process.cwd()
    await this.fixtureStorage.putPluginInstall({
      pluginId: manifest.pluginId,
      version: manifest.version,
      layout: {
        kind: "wanex.plugin.package.layout.v1",
        pluginId: manifest.pluginId,
        version: manifest.version
      },
      trust: {
        kind: "wanex.plugin.package.trust.v1",
        pluginId: manifest.pluginId,
        version: manifest.version,
        source: { kind: "local" },
        install: { rootDir: installRootDir },
        decision: { status: "allow" }
      },
      installRootDir,
      idempotencyKey: `plugin-test-install:${manifest.pluginId}:${manifest.version}`
    })
    return manifest
  }
}

function createPluginWorker(
  storage: StorageTestStore,
  catalog: Parameters<typeof registerPluginActionJobHandler>[1]["catalog"],
  options: Pick<
    Parameters<typeof registerPluginActionJobHandler>[1],
    "host" | "sandbox"
  > = {}
): WanexWorker {
  const session = new WanexSessionCore({ storage })
  workerCounter += 1
  const worker = new WanexWorker({
    session,
    workerId: `worker_plugin_action_${workerCounter}`,
    leaseMs: 60_000,
    kinds: ["plugin.action"]
  })
  registerPluginActionJobHandler(worker, {
    storage,
    ...(catalog === undefined ? {} : { catalog }),
    ...options
  })
  return worker
}

function createFixtureSubprocessHost(
  mode: string,
  timeoutMs = 1_000,
  stdoutLimitBytes?: number
): PluginActionHost {
  return createSubprocessPluginActionHost({
    descriptors: [
      {
        pluginId: "connector.telegram",
        actionId: "deliver-message",
        version: "1.0.0",
        capability: "channel.deliver"
      }
    ],
    command: execPath,
    args: [pluginHostFixture],
    env: {
      WANEX_PLUGIN_FIXTURE_MODE: mode
    },
    timeoutMs,
    ...(stdoutLimitBytes === undefined ? {} : { stdoutLimitBytes })
  })
}

function subprocessManifestEntry(
  command: string,
  args: readonly string[] = []
): JsonValue {
  return {
    kind: "wanex.plugin.host.subprocess.v1",
    command,
    args,
    timeoutMs: 1_000,
    actions: [
      {
        actionId: "deliver-message",
        capability: "channel.deliver"
      }
    ]
  }
}

function trustRecord(
  overrides: {
    readonly pluginId?: string
    readonly version?: string
    readonly installRootDir?: string
    readonly decision?: "allow" | "deny" | "review-required"
    readonly signatureVerified?: boolean
  } = {}
): JsonValue {
  return {
    kind: "wanex.plugin.package.trust.v1",
    pluginId: overrides.pluginId ?? "connector.telegram",
    version: overrides.version ?? "1.0.0",
    source: {
      kind: "local",
      uri: "file:///plugins/connector-telegram"
    },
    signature: {
      kind: "local-dev",
      verified: overrides.signatureVerified ?? true
    },
    install: {
      rootDir: overrides.installRootDir ?? process.cwd()
    },
    decision: {
      status: overrides.decision ?? "allow"
    }
  }
}

function pluginPackageLayout(): Record<string, JsonValue> {
  return {
    kind: "wanex.plugin.package.layout.v1",
    pluginId: "connector.telegram",
    version: "1.0.0",
    name: "Telegram Connector",
    packageName: "@wanex/plugin-connector-telegram",
    entry: subprocessManifestEntry("bin/plugin-host.mjs"),
    capabilities: ["channel.deliver"],
    runtimeDependencies: [
      {
        name: "grammy",
        version: "^2.0.0",
        loading: "lazy",
        distribution: "optional",
        platforms: ["darwin", "linux", "win32"]
      }
    ],
    files: [
      {
        path: "bin/plugin-host.mjs",
        sha256: "c".repeat(64),
        executable: true,
        bytes: 1200
      }
    ],
    metadata: {
      connector: true
    }
  }
}

function pluginInstallPlan(): Record<string, JsonValue> {
  return {
    kind: "wanex.plugin.install-plan.v1",
    layout: pluginPackageLayout(),
    source: {
      kind: "archive",
      uri: "file:///plugins/connector.telegram-1.0.0.tgz",
      publisher: "wanex.example"
    },
    integrity: {
      sha256: "b".repeat(64)
    },
    signature: {
      kind: "cosign",
      signer: "wanex.example",
      verified: true
    },
    install: {
      rootDir: "/plugins/connector.telegram/1.0.0"
    },
    decision: {
      status: "allow"
    }
  }
}
