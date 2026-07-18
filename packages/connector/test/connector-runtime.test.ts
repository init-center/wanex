import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  SecretResolver,
  StaticSecretProvider
} from "../src/host-security/index.js"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexWorker } from "@wanex/runtime/jobs"
import { ConnectorHost, ConnectorRuntime } from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
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

describe("@wanex/connector", () => {
  it("manages connector credential references and live session leases", async () => {
    const { runtime } = await createRuntime()

    const credential = await runtime.putCredentialRef({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "keychain://wanex/telegram/bot-main",
      metadata: { label: "bot main" },
      idempotencyKey: "runtime-connector-credential"
    })
    expect(credential).toMatchObject({
      connectorId: "connector.telegram",
      state: "active",
      secretRef: "keychain://wanex/telegram/bot-main"
    })

    const session = await runtime.startSession({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector-runtime-worker",
      leaseMs: 60_000,
      state: "connecting",
      metadata: { phase: "boot" }
    })
    expect(session).toMatchObject({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector-runtime-worker",
      state: "connecting",
      metadata: { phase: "boot" }
    })

    await expect(
      runtime.heartbeatSession({
        sessionId: session.id,
        ownerId: "other-worker",
        leaseToken: session.leaseToken,
        leaseMs: 60_000
      })
    ).rejects.toThrow(/lease owner mismatch/)

    await expect(
      runtime.heartbeatSession({
        sessionId: session.id,
        ownerId: "connector-runtime-worker",
        leaseToken: session.leaseToken,
        leaseMs: 60_000,
        state: "connected"
      })
    ).resolves.toMatchObject({
      id: session.id,
      state: "connected"
    })
    await expect(
      runtime.finishSession({
        sessionId: session.id,
        ownerId: "connector-runtime-worker",
        leaseToken: session.leaseToken,
        state: "disconnected"
      })
    ).resolves.toMatchObject({
      id: session.id,
      state: "disconnected"
    })
    await expect(
      runtime.listSessions({ connectorId: "connector.telegram" })
    ).resolves.toMatchObject([{ id: session.id }])
  })

  it("records channel ingress and delivery without concrete adapter code", async () => {
    const { runtime } = await createRuntime()

    const binding = await runtime.bindExternalIdentity({
      id: "bind_runtime_telegram_user",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_runtime_user",
      principalId: "principal_runtime_user",
      displayName: "Ada",
      idempotencyKey: "runtime-channel-binding"
    })
    expect(binding).toMatchObject({
      id: "bind_runtime_telegram_user",
      state: "active"
    })
    await expect(
      runtime.listBindings({ connectorId: "connector.telegram", state: "active" })
    ).resolves.toMatchObject([{ id: binding.id }])

    const inbound = await runtime.ingestEvent({
      id: "chin_runtime_telegram_1",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "telegram-runtime-update-1",
      externalThreadId: "telegram-runtime-chat",
      senderExternalIdentityId: "tg_runtime_user",
      payload: { message: { text: "hello" } },
      idempotencyKey: "telegram-runtime-update-1"
    })
    expect(inbound).toMatchObject({
      id: "chin_runtime_telegram_1",
      state: "received",
      principalId: "principal_runtime_user"
    })
    await expect(
      runtime.updateEventState(inbound.id, "projected", {
        projectedTo: "session.input"
      })
    ).resolves.toMatchObject({
      state: "projected",
      metadata: { projectedTo: "session.input" }
    })

    const delivery = await runtime.submitDelivery({
      id: "chdel_runtime_telegram_1",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_runtime_user",
      externalThreadId: "telegram-runtime-chat",
      principalId: "principal_runtime_user",
      payload: { text: "hi back" },
      jobId: "job_runtime_channel_delivery_1",
      idempotencyKey: "runtime-channel-delivery-1"
    })
    expect(delivery.delivery).toMatchObject({
      id: "chdel_runtime_telegram_1",
      state: "pending",
      schedulerJobId: "job_runtime_channel_delivery_1"
    })
    expect(delivery.job).toMatchObject({
      id: "job_runtime_channel_delivery_1",
      kind: "channel.delivery"
    })
  })

  it("registers a channel delivery worker handler with atomic acknowledgement", async () => {
    const { runtime, storage } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    const worker = new WanexWorker({
      session,
      workerId: "connector_runtime_worker_success",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    runtime.registerDeliveryHandler(worker, ({ delivery }) => {
      expect(delivery).toMatchObject({
        deliveryId: "chdel_runtime_worker_success",
        connectorId: "connector.telegram",
        payload: { text: "hello" }
      })
      return { externalMessageId: "runtime-message-1" }
    })

    await runtime.submitDelivery({
      id: "chdel_runtime_worker_success",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_runtime_user",
      principalId: "principal_runtime_user",
      payload: { text: "hello" },
      jobId: "job_runtime_worker_success",
      idempotencyKey: "runtime-worker-success"
    })

    const result = await worker.runOnce()
    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job).toMatchObject({
      id: "job_runtime_worker_success",
      state: "succeeded",
      result: { externalMessageId: "runtime-message-1" }
    })
    await expect(
      storage.listJobs({ state: "succeeded", kind: "channel.delivery" })
    ).resolves.toMatchObject([
      {
        id: "job_runtime_worker_success",
        result: { externalMessageId: "runtime-message-1" }
      }
    ])
  })

  it("registers retryable channel delivery failures atomically", async () => {
    const { runtime, storage } = await createRuntime()
    const session = new WanexSessionCore({ storage })
    const worker = new WanexWorker({
      session,
      workerId: "connector_runtime_worker_retry",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    runtime.registerDeliveryHandler(worker, () => {
      throw new Error("transient send failure")
    })

    await runtime.submitDelivery({
      id: "chdel_runtime_worker_retry",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_runtime_user",
      principalId: "principal_runtime_user",
      payload: { text: "retry" },
      jobId: "job_runtime_worker_retry",
      idempotencyKey: "runtime-worker-retry",
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 0,
        maxDelayMs: 0
      }
    })

    const first = await worker.runOnce()
    expect(first.status).toBe("failed")
    if (first.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(first.job?.state).toBe("retry_scheduled")

    const second = await worker.runOnce()
    expect(second.status).toBe("failed")
    if (second.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(second.job?.state).toBe("failed")
    await expect(
      storage.listJobs({ state: "failed", kind: "channel.delivery" })
    ).resolves.toMatchObject([
      {
        id: "job_runtime_worker_retry",
        lastError: {
          type: "connector.delivery_failed",
          message: "transient send failure"
        }
      }
    ])
  })

  it("projects connector events through the facade without choosing app policy", async () => {
    const { runtime, storage } = await createRuntime()
    await storage.createSession({
      id: "ses_connector_projection",
      title: "Connector Projection",
      kind: "chat"
    })
    const inbound = await runtime.ingestEvent({
      id: "chin_connector_projection",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "connector-projection-event",
      senderExternalIdentityId: "tg_connector_projection",
      principalId: "principal_connector_projection",
      payload: { message: { text: "run" } },
      idempotencyKey: "connector-projection-event"
    })

    const projection = await runtime.projectEvent({
      id: "chproj_connector_session",
      inboundEventId: inbound.id,
      target: {
        kind: "session.run",
        sessionId: "ses_connector_projection",
        principalId: "principal_connector_projection",
        inputId: "inp_connector_projection",
        jobId: "job_connector_projection",
        content: [{ type: "text", id: "part_connector_projection", text: "run" }]
      },
      idempotencyKey: "connector-projection-session"
    })

    expect(projection.projection).toMatchObject({
      id: "chproj_connector_session",
      targetKind: "session.run",
      targetId: "inp_connector_projection",
      targetJobId: "job_connector_projection"
    })
    expect(projection.job).toMatchObject({
      id: "job_connector_projection",
      kind: "session.run"
    })
    await expect(
      runtime.listProjections({ inboundEventId: inbound.id })
    ).resolves.toMatchObject([{ id: "chproj_connector_session" }])
  })

  it("hosts an sdk-agnostic connector session and ingests inbound events", async () => {
    const { runtime } = await createRuntime()
    const credential = await runtime.putCredentialRef({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "keychain://wanex/telegram/host",
      idempotencyKey: "host-credential"
    })
    const lifecycle: string[] = []
    const host = new ConnectorHost({
      runtime,
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector_host_worker",
      leaseMs: 60_000,
      heartbeatIntervalMs: 10,
      sessionId: "connses_host_success",
      idempotencyKey: "host-session-success",
      adapter: {
        async start(context) {
          lifecycle.push(`start:${context.session.state}`)
          await context.ingestEvent({
            id: "chin_host_inbound",
            channelKind: "telegram",
            channelId: "bot-main",
            externalEventId: "host-update-1",
            senderExternalIdentityId: "tg_host_user",
            principalId: "principal_host_user",
            payload: { message: { text: "hello from host" } },
            idempotencyKey: "host-update-1"
          })
          await context.heartbeat({ adapter: "ready" })
        },
        stop() {
          lifecycle.push("stop")
        }
      }
    })

    const run = await host.start()

    expect(run.session).toMatchObject({
      id: "connses_host_success",
      state: "connected",
      ownerId: "connector_host_worker"
    })
    await expect(
      runtime.listEvents({ connectorId: "connector.telegram", state: "received" })
    ).resolves.toMatchObject([{ id: "chin_host_inbound" }])
    await delay(20)
    const stopped = await run.stop()
    expect(stopped).toMatchObject({
      id: "connses_host_success",
      state: "disconnected"
    })
    expect(run.signal.aborted).toBe(true)
    expect(lifecycle).toContain("start:connecting")
    expect(lifecycle).toContain("stop")
  })

  it("hosts connector delivery handling through worker-core", async () => {
    const { runtime, storage } = await createRuntime()
    const credential = await runtime.putCredentialRef({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "keychain://wanex/telegram/host-delivery",
      idempotencyKey: "host-delivery-credential"
    })
    const session = new WanexSessionCore({ storage })
    const worker = new WanexWorker({
      session,
      workerId: "connector_host_delivery_worker",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    const host = new ConnectorHost({
      runtime,
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector_host_delivery",
      leaseMs: 60_000,
      sessionId: "connses_host_delivery",
      idempotencyKey: "host-session-delivery",
      worker,
      adapter: {
        start() {},
        deliver({ delivery, host }) {
          expect(host.session.state).toBe("connected")
          expect(delivery).toMatchObject({
            deliveryId: "chdel_host_delivery",
            connectorId: "connector.telegram",
            payload: { text: "send via host" }
          })
          return { externalMessageId: "host-message-1" }
        }
      }
    })
    const run = await host.start()
    await runtime.submitDelivery({
      id: "chdel_host_delivery",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_host_user",
      principalId: "principal_host_user",
      payload: { text: "send via host" },
      jobId: "job_host_delivery",
      idempotencyKey: "host-delivery-job"
    })

    const result = await run.runDeliveryOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected host delivery completion")
    }
    expect(result.job).toMatchObject({
      id: "job_host_delivery",
      state: "succeeded",
      result: { externalMessageId: "host-message-1" }
    })
    await run.stop()
  })

  it("marks connector host session failed when adapter startup fails", async () => {
    const { runtime } = await createRuntime()
    const credential = await runtime.putCredentialRef({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "keychain://wanex/telegram/host-failure",
      idempotencyKey: "host-failure-credential"
    })
    const host = new ConnectorHost({
      runtime,
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector_host_failure",
      leaseMs: 60_000,
      sessionId: "connses_host_failure",
      idempotencyKey: "host-session-failure",
      adapter: {
        start() {
          throw new Error("login failed")
        }
      }
    })

    await expect(host.start()).rejects.toThrow("login failed")

    await expect(
      runtime.listSessions({ connectorId: "connector.telegram", state: "failed" })
    ).resolves.toMatchObject([
      {
        id: "connses_host_failure",
        lastError: {
          type: "connector.host_failed",
          message: "login failed"
        }
      }
    ])
  })

  it("lets hosted adapters resolve credential refs without persisting secret values", async () => {
    const { runtime } = await createRuntime()
    const secretRef = "static://telegram/host-secret"
    const credential = await runtime.putCredentialRef({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef,
      idempotencyKey: "host-secret-credential"
    })
    const resolver = new SecretResolver([
      new StaticSecretProvider({
        values: {
          [secretRef]: "super-secret-token"
        }
      })
    ])
    const host = new ConnectorHost({
      runtime,
      connectorId: "connector.telegram",
      credentialId: credential.id,
      credentialSecretRef: credential.secretRef,
      secretResolver: resolver,
      ownerId: "connector_host_secret",
      leaseMs: 60_000,
      sessionId: "connses_host_secret",
      idempotencyKey: "host-session-secret",
      adapter: {
        async start(context) {
          const secret = await context.resolveCredentialSecret()
          expect(secret.reveal()).toBe("super-secret-token")
          secret.dispose()
          await context.ingestEvent({
            id: "chin_host_secret",
            channelKind: "telegram",
            channelId: "bot-main",
            externalEventId: "host-secret-event",
            senderExternalIdentityId: "tg_host_secret",
            principalId: "principal_host_secret",
            payload: { ok: true },
            idempotencyKey: "host-secret-event"
          })
        }
      }
    })

    const run = await host.start()
    await run.stop()

    const sessions = await runtime.listSessions({
      connectorId: "connector.telegram",
      limit: 20
    })
    const inbound = await runtime.listEvents({
      connectorId: "connector.telegram",
      limit: 20
    })
    expect(JSON.stringify(sessions)).not.toContain("super-secret-token")
    expect(JSON.stringify(inbound)).not.toContain("super-secret-token")
  })
})

async function createRuntime(): Promise<{
  readonly storage: StorageTestStore
  readonly runtime: ConnectorRuntime
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-connector-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new ConnectorRuntime({ storage })
  await storage.putPluginManifest({
    pluginId: "plugin.connector.telegram",
    version: "1.0.0",
    name: "Runtime Telegram Connector",
    entry: { kind: "test" },
    capabilities: ["channel.connect", "channel.receive", "channel.deliver"],
    metadata: { test: true },
    idempotencyKey: "runtime-plugin-connector-telegram"
  })
  const registration = await runtime.registerConnector({
    connectorId: "connector.telegram",
    pluginId: "plugin.connector.telegram",
    version: "1.0.0",
    metadata: { runtime: "connector-runtime-test" },
    idempotencyKey: "runtime-connector-telegram"
  })
  expect(registration).toMatchObject({
    connectorId: "connector.telegram",
    state: "active"
  })
  return { storage, runtime }
}
