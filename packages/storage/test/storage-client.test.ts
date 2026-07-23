import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddressInfo } from "node:net"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  createRuntimeEvent,
  type JsonValue,
  type RuntimeEvent
} from "@wanex/protocol"
import {
  createCoreStore,
  createStorageHandle,
  createStorageHandleFromTransport,
  normalizeLocalStoreProfileId,
  OneShotSystemServiceStorageWireTransport,
  PersistentSystemServiceStorageWireTransport,
  resolveLocalStore,
  StorageTransportError,
  SystemServiceClientError,
  type CoreStore,
  type StorageRpcCommand,
  type StorageRpcRequestEnvelope,
  type StorageTransport
} from "../src/index.js"
import {
  createStorageTestStore,
  type StorageTestStore
} from "../src/testing.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const expectedSchemaVersion = 1

const tempDirs: string[] = []
const servers: Server[] = []

function testTurnBinding(label: string) {
  const profile = {
    id: "profile_" + label,
    kind: "fake",
    capabilities: { input: ["text"], output: ["text"] },
    providerId: "fake",
    modelId: "model_" + label
  } as const
  const provider = {
    profileId: profile.id,
    profileDigest: digestJson(profile),
    adapterId: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities
  } as const
  const binding = {
    createdAt: 1,
    provider,
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  return { digest: digestJson(binding), ...binding }
}

function testMediaGenerationBinding(label: string) {
  return {
    profileId: `media_profile_${label}`,
    profileDigest: `media_profile_digest_${label}`,
    adapterId: "fake-media-adapter",
    providerId: "fake-media-provider",
    modelId: `fake-media-model-${label}`,
    request: {
      prompt: `media prompt ${label}`,
      outputModality: "image" as const,
      inputResources: [],
      options: null
    },
    requestDigest: `media_request_digest_${label}`
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}

beforeAll(async () => {
  // The test intentionally uses the real Rust binary. Build is handled by the
  // package test script so the client never talks to SQLite directly.
})

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/storage", () => {
  it("runs media generation operation state through one-shot storage", async () => {
    const client = await createClient()
    const submitted = await client.submitMediaGenerationOperation({
      principalId: "media_storage_user",
      idempotencyKey: "media_storage_oneshot",
      binding: testMediaGenerationBinding("oneshot")
    })
    const repeated = await client.submitMediaGenerationOperation({
      principalId: "media_storage_user",
      idempotencyKey: "media_storage_oneshot",
      binding: testMediaGenerationBinding("oneshot")
    })
    expect(repeated.operation.id).toBe(submitted.operation.id)
    expect(repeated.job.id).toBe(submitted.job.id)
    expect(submitted.job.kind).toBe("media.generate")

    const claimed = await client.claimJob({
      workerId: "media_storage_worker",
      leaseMs: 60_000,
      kinds: ["media.generate"]
    })
    expect(claimed).not.toBeNull()
    const leaseToken = claimed!.leaseToken!
    await expect(
      client.beginMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_worker",
        leaseToken
      })
    ).resolves.toMatchObject({
      action: "started",
      operation: { state: "submitting" }
    })
    await expect(
      client.acceptMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_worker",
        leaseToken,
        externalOperationId: "external-storage-operation",
        providerCheckpoint: { cursor: 1 }
      })
    ).resolves.toMatchObject({
      state: "polling",
      externalOperationId: "external-storage-operation"
    })
    await client.checkpointMediaGenerationOperation({
      operationId: submitted.operation.id,
      workerId: "media_storage_worker",
      leaseToken,
      providerCheckpoint: { cursor: 2 },
      progress: { percent: 50 }
    })
    await expect(
      client.requestMediaGenerationCancel({
        operationId: submitted.operation.id,
        reason: "storage test cancellation"
      })
    ).resolves.toMatchObject({ state: "cancel_requested" })
    await expect(
      client.settleMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_worker",
        leaseToken,
        outcome: "cancelled",
        reason: "storage test cancellation"
      })
    ).resolves.toMatchObject({ state: "cancelled" })
    await expect(
      client.listMediaGenerationOperations({
        principalId: "media_storage_user"
      })
    ).resolves.toMatchObject([{ id: submitted.operation.id, state: "cancelled" }])
  })

  it("uses media generation operations over persistent storage", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-media-persistent-"))
    tempDirs.push(storeDir)
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    try {
      await exerciseMediaGenerationTransport(handle.core, "persistent")
    } finally {
      await handle.dispose()
    }
  })

  it("uses media generation operations over remote HTTP storage", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-media-remote-"))
    tempDirs.push(rootDir)
    const endpoint = await startRemoteStorageFixture({
      "media-token": join(rootDir, "media-store")
    })
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "media-token"
    })
    try {
      await exerciseMediaGenerationTransport(handle.core, "remote")
    } finally {
      await handle.dispose()
    }
  })

  it("appends and queries events through the system-service process", async () => {
    const client = await createClient()
    const event = createRuntimeEvent({
      id: "evt_node_1",
      type: "session.input.admitted",
      scope: { sessionId: "ses_node_1", inputId: "inp_node_1" },
      payload: { text: "from node" },
      occurredAt: 10
    })

    await client.appendEvent(event)
    const events = await client.queryEvents({
      scope: { sessionId: "ses_node_1" },
      limit: 10
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual(event)
  })

  it("queries events with a stable occurredAt and eventId cursor", async () => {
    const client = await createClient()
    for (const id of ["evt_cursor_a", "evt_cursor_b", "evt_cursor_c"]) {
      await client.appendEvent(
        createRuntimeEvent({
          id,
          type: "cursor.event",
          scope: { sessionId: "ses_cursor_node" },
          payload: { id },
          occurredAt: 100
        })
      )
    }

    const first = await client.queryEvents({
      scope: { sessionId: "ses_cursor_node" },
      limit: 1
    })
    expect(first.map((event) => event.id)).toEqual(["evt_cursor_a"])

    const next = await client.queryEvents({
      scope: { sessionId: "ses_cursor_node" },
      after: {
        occurredAt: first[0]!.occurredAt,
        eventId: first[0]!.id
      },
      limit: 10
    })
    expect(next.map((event) => event.id)).toEqual([
      "evt_cursor_b",
      "evt_cursor_c"
    ])
  })

  it("stores config and writes files through the system-service process", async () => {
    const client = await createClient()

    await client.putConfig("provider.default", { id: "deepseek" })
    await expect(client.getConfig("provider.default")).resolves.toEqual({
      id: "deepseek"
    })
    const configEvents = await client.queryEvents({
      limit: 10
    })
    const configEvent = configEvents.find(
      (event) => event.type === "config.updated"
    )
    expect(configEvent?.payload).toMatchObject({
      key: "provider.default"
    })
    expect(JSON.stringify(configEvent?.payload)).not.toContain("deepseek")

    const file = await client.writeAtomicFile({
      logicalPath: "node/output.txt",
      content: new TextEncoder().encode("hello node")
    })

    expect(file.logicalPath).toBe("node/output.txt")
    expect(file.sizeBytes).toBe(10)
    expect(file.resourceId.startsWith("res_")).toBe(true)
    await expect(
      readFile(join(client.storeDir, "files/node/output.txt"), "utf8")
    ).resolves.toBe("hello node")

    const ticket = await client.createResourceTicket({
      principalId: "user_node",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 123
    })
    expect(ticket.resourceId).toBe(file.resourceId)
  })

  it("cleans up expired resource tickets through the system-service process", async () => {
    const client = await createClient()
    const file = await client.writeAtomicFile({
      logicalPath: "node/cleanup.txt",
      content: new TextEncoder().encode("cleanup")
    })
    const expired = await client.createResourceTicket({
      principalId: "user_expired",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 100
    })
    await client.createResourceTicket({
      principalId: "user_future",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 1_000
    })

    const receipt = await client.cleanupExpiredResourceTickets({
      nowMs: 500,
      limit: 10
    })

    expect(receipt).toEqual({
      revokedCount: 1,
      revokedTicketIds: [expired.id],
      nowMs: 500
    })
    await expect(
      client.cleanupExpiredResourceTickets({ nowMs: 500, limit: 10 })
    ).resolves.toMatchObject({ revokedCount: 0 })

    const events = await client.queryEvents({ limit: 10 })
    expect(events.map((event) => event.type)).toContain(
      "resource.ticket.cleanup"
    )
  })

  it("ingests gets and lists rich resources through the system-service process", async () => {
    const client = await createClient()
    const content = new TextEncoder().encode("fake png from provider")

    const resource = await client.ingestResource({
      id: "res_storage_image",
      logicalPath: "resources/image/storage.png",
      content,
      mediaType: "image/png",
      kind: "image",
      origin: "model_output",
      label: "storage preview",
      source: {
        provider: "openai",
        providerFileId: "file_storage"
      },
      metadata: {
        prompt: "storage-client resource"
      },
      width: 640,
      height: 480
    })

    expect(resource).toMatchObject({
      id: "res_storage_image",
      logicalPath: "resources/image/storage.png",
      kind: "image",
      origin: "model_output",
      state: "available",
      mediaType: "image/png",
      label: "storage preview",
      sizeBytes: content.byteLength,
      source: {
        provider: "openai",
        providerFileId: "file_storage"
      },
      metadata: {
        prompt: "storage-client resource"
      },
      width: 640,
      height: 480
    })
    await expect(
      readFile(join(client.storeDir, "files/resources/image/storage.png"), "utf8")
    ).resolves.toBe("fake png from provider")

    const fetched = await client.getResource({
      resourceId: "res_storage_image"
    })
    expect(fetched?.sha256).toBe(resource.sha256)
    expect(fetched?.source?.providerFileId).toBe("file_storage")

    const firstChunk = await client.readResourceContent({
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      offset: 0,
      limit: 5
    })
    expect(new TextDecoder().decode(firstChunk?.content)).toBe("fake ")
    expect(firstChunk).toMatchObject({
      resourceId: resource.id,
      sha256: resource.sha256,
      totalSizeBytes: content.byteLength,
      offset: 0,
      eof: false
    })
    const secondChunk = await client.readResourceContent({
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      offset: firstChunk!.content.byteLength,
      limit: 1024
    })
    expect(
      new TextDecoder().decode(
        Uint8Array.from([...firstChunk!.content, ...secondChunk!.content])
      )
    ).toBe("fake png from provider")
    expect(secondChunk?.eof).toBe(true)

    await expect(
      client.ingestResource({
        id: resource.id,
        logicalPath: resource.logicalPath,
        content: new TextEncoder().encode("replacement"),
        ...(resource.mediaType === undefined
          ? {}
          : { mediaType: resource.mediaType }),
        kind: resource.kind,
        origin: resource.origin
      })
    ).rejects.toThrow(/resource snapshots are immutable/)
    await expect(
      readFile(join(client.storeDir, "files/resources/image/storage.png"), "utf8")
    ).resolves.toBe("fake png from provider")

    const listed = await client.listResources({
      kind: "image",
      origin: "model_output",
      state: "available"
    })
    expect(listed.map((item) => item.id)).toContain("res_storage_image")

    const events = await client.queryEvents({ limit: 10 })
    const event = events.find((item) => item.type === "resource.ingested")
    expect(event?.scope.resourceId).toBe("res_storage_image")
    expect(JSON.stringify(event?.payload)).not.toContain(
      "fake png from provider"
    )
  })

  it("returns doctor status through the system-service process", async () => {
    const client = await createClient()
    const report = await client.doctor()

    expect(report.schemaVersion).toBe(expectedSchemaVersion)
    expect(report.checks.some((check) => check.name === "sqlite.quick_check"))
      .toBe(true)
  })

  it("persists exact durable turns and canonical ordering through the process boundary", async () => {
    const client = await createClient()
    await client.createSession({
      id: "ses_storage_turn",
      title: "Storage turn",
      kind: "agent"
    })
    const first = await client.submitSessionTurn({
      id: "inp_storage_turn_a",
      turnId: "turn_storage_a",
      sessionId: "ses_storage_turn",
      principalId: "user_storage",
      idempotencyKey: "idem_storage_a",
      content: [{
        type: "text",
        id: "part_storage_a",
        text: "first"
      }],
      jobId: "job_storage_a",
      executionBinding: testTurnBinding("storage_a"),
      maxSteps: 4
    })
    const second = await client.submitSessionTurn({
      id: "inp_storage_turn_b",
      turnId: "turn_storage_b",
      sessionId: "ses_storage_turn",
      principalId: "user_storage",
      idempotencyKey: "idem_storage_b",
      content: [{
        type: "text",
        id: "part_storage_b",
        text: "second"
      }],
      jobId: "job_storage_b",
      executionBinding: testTurnBinding("storage_b"),
      maxSteps: 4
    })
    await expect(
      client.listSessionMessages({ sessionId: "ses_storage_turn" })
    ).resolves.toEqual([])

    const firstJob = await client.claimJob({
      workerId: "worker_storage_a",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    expect(firstJob?.id).toBe(first.job.id)
    await expect(
      client.claimJob({
        workerId: "worker_storage_blocked",
        leaseMs: 60_000,
        kinds: ["session.turn"]
      })
    ).resolves.toBeNull()
    const firstStarted = await client.startSessionTurnAttempt({
      sessionId: first.turn.sessionId,
      turnId: first.turn.id,
      inputId: first.admission.inputId,
      jobId: firstJob!.id,
      workerId: "worker_storage_a",
      leaseToken: firstJob!.leaseToken!
    })
    const inputsWhileRunning = await client.listSessionInputs({
      sessionId: "ses_storage_turn"
    })
    expect(
      inputsWhileRunning.find((input) => input.id === second.admission.inputId)
        ?.status
    ).toBe("admitted")
    const firstInvocation = await client.beginProviderInvocation({
      sessionId: first.turn.sessionId,
      turnId: first.turn.id,
      attemptId: firstStarted.attempt.id,
      inputId: first.admission.inputId,
      jobId: firstJob!.id,
      workerId: "worker_storage_a",
      leaseToken: firstJob!.leaseToken!,
      step: 1,
      invocationNumber: 1,
      requestDigest: "storage-turn-a-request"
    })

    const firstSettled = await client.settleSessionTurn({
      sessionId: first.turn.sessionId,
      turnId: first.turn.id,
      attemptId: firstStarted.attempt.id,
      inputId: first.admission.inputId,
      jobId: firstJob!.id,
      workerId: "worker_storage_a",
      leaseToken: firstJob!.leaseToken!,
      outcome: "succeeded",
      providerInvocationId: firstInvocation.id,
      assistantMessage: [{
        type: "text",
        id: "assistant_storage_a",
        text: "reply a"
      }],
      providerState: [{
        providerId: "fake",
        modelId: "model_storage_a",
        stateKind: "opaque",
        replayPolicy: "optional",
        payload: { token: "a" }
      }],
      result: { steps: 1 }
    })
    expect(firstSettled.job.state).toBe("succeeded")

    const secondJob = await client.claimJob({
      workerId: "worker_storage_b",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    expect(secondJob?.id).toBe(second.job.id)
    const secondStarted = await client.startSessionTurnAttempt({
      sessionId: second.turn.sessionId,
      turnId: second.turn.id,
      inputId: second.admission.inputId,
      jobId: secondJob!.id,
      workerId: "worker_storage_b",
      leaseToken: secondJob!.leaseToken!
    })
    const secondInvocation = await client.beginProviderInvocation({
      sessionId: second.turn.sessionId,
      turnId: second.turn.id,
      attemptId: secondStarted.attempt.id,
      inputId: second.admission.inputId,
      jobId: secondJob!.id,
      workerId: "worker_storage_b",
      leaseToken: secondJob!.leaseToken!,
      step: 1,
      invocationNumber: 1,
      requestDigest: "storage-turn-b-request"
    })
    await client.settleSessionTurn({
      sessionId: second.turn.sessionId,
      turnId: second.turn.id,
      attemptId: secondStarted.attempt.id,
      inputId: second.admission.inputId,
      jobId: secondJob!.id,
      workerId: "worker_storage_b",
      leaseToken: secondJob!.leaseToken!,
      outcome: "succeeded",
      providerInvocationId: secondInvocation.id,
      assistantMessage: [{
        type: "text",
        id: "assistant_storage_b",
        text: "reply b"
      }]
    })

    const messages = await client.listSessionMessages({
      sessionId: "ses_storage_turn"
    })
    expect(
      messages.map((message) => [
        message.sequence,
        message.turnId,
        message.role
      ])
    ).toEqual([
      [1, "turn_storage_a", "user"],
      [2, "turn_storage_a", "assistant"],
      [3, "turn_storage_b", "user"],
      [4, "turn_storage_b", "assistant"]
    ])
    expect(messages[1]?.providerState?.[0]?.payload).toEqual({ token: "a" })
  })

  it("persists turn controls and running cancellation without premature completion", async () => {
    const client = await createClient()
    await client.createSession({ id: "ses_storage_control", kind: "agent" })
    const submitted = await client.submitSessionTurn({
      id: "inp_storage_control",
      turnId: "turn_storage_control",
      sessionId: "ses_storage_control",
      principalId: "user_storage_control",
      idempotencyKey: "idem_storage_control",
      content: [{
        type: "text",
        id: "part_storage_control",
        text: "long task"
      }],
      jobId: "job_storage_control",
      executionBinding: testTurnBinding("storage_control")
    })
    const job = await client.claimJob({
      workerId: "worker_storage_control",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    const started = await client.startSessionTurnAttempt({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!
    })

    await expect(
      client.steerSessionTurn({
        sessionId: submitted.turn.sessionId,
        principalId: "user_storage_control",
        expectedTurnId: submitted.turn.id,
        expectedAttemptId: "attempt_wrong",
        idempotencyKey: "steer_wrong",
        content: [{
          type: "text",
          id: "part_steer_wrong",
          text: "wrong"
        }]
      })
    ).rejects.toBeInstanceOf(SystemServiceClientError)

    await client.steerSessionTurn({
      sessionId: submitted.turn.sessionId,
      principalId: "user_storage_control",
      expectedTurnId: submitted.turn.id,
      expectedAttemptId: started.attempt.id,
      idempotencyKey: "steer_valid",
      content: [{
        type: "text",
        id: "part_steer_valid",
        text: "focus tests"
      }]
    })
    const [steer] = await client.listSessionTurnControls({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      kind: "steer",
      status: "pending"
    })
    const applied = await client.applySessionTurnControl({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      controlId: steer!.id,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!
    })
    expect(applied?.effect).toBe("steer_promoted_input")

    const cancel = await client.requestSessionTurnCancel({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: submitted.job.id,
      reason: "cancel at safe point"
    })
    expect(cancel.status).toBe("cancel_requested")
    expect(cancel.turn?.state).toBe("cancel_requested")
    expect(cancel.job?.state).toBe("running")
    const controlEvents = await client.queryEvents({
      scope: { sessionId: submitted.turn.sessionId },
      limit: 20
    })
    expect(controlEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "session.turn.steer_accepted",
        "session.turn.control_applied",
        "session.turn.cancel_requested"
      ])
    )

    const settled = await client.settleSessionTurn({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!,
      outcome: "cancelled",
      reason: "cancel at safe point"
    })
    expect(settled.turn.state).toBe("cancelled")
    expect(settled.job.state).toBe("cancelled")
  })

  it("atomically cancels queued turns and fails claimed unstarted turns", async () => {
    const client = await createClient()
    await client.createSession({ id: "ses_storage_queued", kind: "agent" })
    const cancelledTurn = await client.submitSessionTurn({
      id: "inp_storage_cancelled",
      turnId: "turn_storage_cancelled",
      sessionId: "ses_storage_queued",
      principalId: "user_storage_queued",
      idempotencyKey: "idem_storage_cancelled",
      content: [{
        type: "text",
        id: "part_storage_cancelled",
        text: "cancel"
      }],
      jobId: "job_storage_cancelled",
      executionBinding: testTurnBinding("storage_cancelled")
    })
    const cancelled = await client.requestSessionTurnCancel({
      sessionId: cancelledTurn.turn.sessionId,
      turnId: cancelledTurn.turn.id,
      inputId: cancelledTurn.admission.inputId,
      jobId: cancelledTurn.job.id,
      reason: "cancel before start"
    })
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.turn?.state).toBe("cancelled")
    expect(cancelled.job?.state).toBe("cancelled")

    const failedTurn = await client.submitSessionTurn({
      id: "inp_storage_failed",
      turnId: "turn_storage_failed",
      sessionId: "ses_storage_queued",
      principalId: "user_storage_queued",
      idempotencyKey: "idem_storage_failed",
      content: [{
        type: "text",
        id: "part_storage_failed",
        text: "fail before promotion"
      }],
      jobId: "job_storage_failed",
      executionBinding: testTurnBinding("storage_failed")
    })
    const claimed = await client.claimJob({
      workerId: "worker_storage_failed",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    const failedJob = await client.failJob({
      jobId: claimed!.id,
      workerId: "worker_storage_failed",
      leaseToken: claimed!.leaseToken!,
      error: { message: "invalid handler payload" }
    })
    expect(failedJob?.state).toBe("failed")
    const turns = await client.listSessionTurns({
      sessionId: failedTurn.turn.sessionId
    })
    expect(turns.find((turn) => turn.id === failedTurn.turn.id)?.state).toBe(
      "failed"
    )
    const inputs = await client.listSessionInputs({
      sessionId: failedTurn.turn.sessionId
    })
    expect(
      inputs.find((input) => input.id === failedTurn.admission.inputId)?.status
    ).toBe("failed")
  })

  it("reserves commits releases and denies budget through the process boundary", async () => {
    const client = await createClient()
    const scope = {
      kind: "session" as const,
      ownerId: "ses_budget_node"
    }
    const limit = {
      tokens: 100,
      costMicros: 1_000,
      toolCalls: 4
    }
    const first = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 60,
        costMicros: 200,
        toolCalls: 1
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_1"
    })
    const duplicate = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 60,
        costMicros: 200,
        toolCalls: 1
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_1"
    })
    expect(duplicate.id).toBe(first.id)

    await expect(
      client.reserveBudget({
        scope,
        limit,
        requested: {
          tokens: 50,
          costMicros: 100,
          toolCalls: 1
        },
        principalId: "user_budget_node",
        reason: "agent.turn",
        idempotencyKey: "idem_budget_node_denied"
      })
    ).rejects.toBeInstanceOf(SystemServiceClientError)

    await client.recordBudgetUsage({
      grantId: first.id,
      usage: {
        tokens: 55,
        costMicros: 180,
        toolCalls: 1
      },
      source: "test",
      sourceId: "budget-node-test",
      idempotencyKey: "usage-budget-node-test"
    })
    await expect(client.commitBudget({ grantId: first.id })).resolves.toMatchObject({
      state: "committed"
    })

    const second = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 40,
        costMicros: 100,
        toolCalls: 1
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_2"
    })
    await expect(client.releaseBudget({ grantId: second.id })).resolves.toMatchObject({
      state: "released"
    })
  })

  it("enqueues claims retries completes and lists scheduler jobs", async () => {
    const client = await createClient()
    const enqueued = await client.enqueueJob({
      id: "job_node_1",
      kind: "memory.compaction",
      principalId: "user_node",
      payload: { sessionId: "ses_node" },
      priority: 5,
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 0,
        maxDelayMs: 0
      },
      idempotencyKey: "idem_job_node"
    })
    const duplicate = await client.enqueueJob({
      id: "job_node_duplicate",
      kind: "memory.compaction",
      principalId: "user_node",
      payload: { sessionId: "ignored" },
      idempotencyKey: "idem_job_node"
    })

    expect(duplicate.id).toBe(enqueued.id)
    const claim = await client.claimJob({
      workerId: "worker_node",
      leaseMs: 60_000,
      kinds: ["memory.compaction"]
    })
    expect(claim?.id).toBe(enqueued.id)
    expect(claim?.state).toBe("running")

    const retry = await client.failJob({
      jobId: claim!.id,
      workerId: "worker_node",
      leaseToken: claim!.leaseToken!,
      error: { type: "provider.timeout" }
    })
    expect(retry?.state).toBe("retry_scheduled")

    const second = await client.claimJob({
      workerId: "worker_node_2",
      leaseMs: 60_000
    })
    expect(second?.attempt).toBe(2)
    const completed = await client.completeJob({
      jobId: second!.id,
      workerId: "worker_node_2",
      leaseToken: second!.leaseToken!,
      result: { ok: true }
    })
    expect(completed?.state).toBe("succeeded")
    expect(completed?.result).toEqual({ ok: true })
    expect(completed?.lastError).toBeUndefined()

    await expect(client.getJob({ jobId: enqueued.id })).resolves.toMatchObject({
      id: enqueued.id,
      state: "succeeded",
      result: { ok: true }
    })
    await expect(client.getJob({ jobId: "job_node_missing" })).resolves.toBeNull()

    const jobs = await client.listJobs({ state: "succeeded" })
    expect(jobs.map((job) => job.id)).toContain(enqueued.id)
  })

  it("enqueues claims and completes workspace.task jobs through the process boundary", async () => {
    const client = await createClient()
    const enqueued = await client.enqueueJob({
      id: "job_node_workspace_task",
      kind: "workspace.task",
      principalId: "user_node",
      payload: {
        handlerId: "handler.node",
        taskId: "wtsk_node",
        workspaceId: "workspace_node"
      }
    })

    expect(enqueued.kind).toBe("workspace.task")
    expect(enqueued.payload).toEqual({
      handlerId: "handler.node",
      taskId: "wtsk_node",
      workspaceId: "workspace_node"
    })

    const claim = await client.claimJob({
      workerId: "worker_node_workspace_task",
      leaseMs: 60_000,
      kinds: ["workspace.task"]
    })
    expect(claim?.id).toBe("job_node_workspace_task")
    expect(claim?.kind).toBe("workspace.task")
    expect(claim?.state).toBe("running")

    const completed = await client.completeJob({
      jobId: claim!.id,
      workerId: "worker_node_workspace_task",
      leaseToken: claim!.leaseToken!,
      result: {
        taskId: "wtsk_node",
        status: "succeeded",
        resourceIds: []
      }
    })
    expect(completed?.state).toBe("succeeded")
    expect(completed?.result).toMatchObject({
      taskId: "wtsk_node",
      status: "succeeded"
    })

    await expect(
      client.listJobs({ kind: "workspace.task", state: "succeeded" })
    ).resolves.toHaveLength(1)
  })

  it("reuses one persistent system-service process for multiple commands", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-"))
    tempDirs.push(storeDir)
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const client = handle.core
    try {
      const report = await client.doctor()
      expect(report.schemaVersion).toBe(expectedSchemaVersion)

      const session = await client.createSession({
        id: "ses_persistent",
        kind: "agent"
      })
      expect(session.id).toBe("ses_persistent")

      const events = await client.queryEvents({
        scope: { sessionId: "ses_persistent" },
        limit: 10
      })
      expect(events.map((event) => event.type)).toContain("session.created")
    } finally {
      await handle.dispose()
    }
  })

  it("creates one-shot local storage clients through the factory", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-factory-one-"))
    tempDirs.push(storeDir)
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const client = handle.core

    const report = await client.doctor()
    expect(report.schemaVersion).toBe(expectedSchemaVersion)
    await client.appendEvent(
      createRuntimeEvent({
        id: "evt_factory_one",
        type: "factory.oneshot",
        scope: { sessionId: "ses_factory_one" },
        payload: { ok: true },
        occurredAt: 1
      })
    )
    await expect(
      client.queryEvents({ scope: { sessionId: "ses_factory_one" } })
    ).resolves.toHaveLength(1)
    await handle.dispose()
  })

  it("creates persistent local storage clients through the factory", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-factory-persistent-"))
    tempDirs.push(storeDir)
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const client = handle.core
    try {
      const session = await client.createSession({
        id: "ses_factory_persistent",
        kind: "agent"
      })
      expect(session.id).toBe("ses_factory_persistent")
      await expect(
        client.queryEvents({ scope: { sessionId: "ses_factory_persistent" } })
      ).resolves.toHaveLength(1)
    } finally {
      await handle.dispose()
    }
  })

  it("resolves local profile stores under an isolated profiles root", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-profile-root-"))
    tempDirs.push(rootDir)

    expect(resolveLocalStore({ rootDir, profileId: "work" })).toEqual({
      kind: "local-store",
      rootDir,
      profileId: "work",
      storeDir: join(rootDir, "profiles/work")
    })
    expect(resolveLocalStore({ rootDir })).toEqual({
      kind: "local-store",
      rootDir,
      profileId: "default",
      storeDir: join(rootDir, "profiles/default")
    })
  })

  it("rejects unsafe local profile ids", () => {
    for (const profileId of ["../x", "x/y", ".hidden", "-bad", "con", "nul"]) {
      expect(() => normalizeLocalStoreProfileId(profileId)).toThrow(
        "local store profile id"
      )
    }
  })

  it("creates isolated local profile stores through the factory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-profile-isolation-"))
    tempDirs.push(rootDir)
    const workHandle = createStorageHandle({
      kind: "local-profile",
      mode: "oneshot",
      rootDir,
      profileId: "work",
      serviceBin
    })
    const personalHandle = createStorageHandle({
      kind: "local-profile",
      mode: "oneshot",
      rootDir,
      profileId: "personal",
      serviceBin
    })
    const work = workHandle.core
    const personal = personalHandle.core

    await work.putConfig("profile.marker", { profile: "work" })

    await expect(work.getConfig("profile.marker")).resolves.toEqual({
      profile: "work"
    })
    await expect(personal.getConfig("profile.marker")).resolves.toBeNull()
    await expect(work.doctor()).resolves.toMatchObject({
      storePath: join(rootDir, "profiles/work/state.db")
    })
    await expect(personal.doctor()).resolves.toMatchObject({
      storePath: join(rootDir, "profiles/personal/state.db")
    })
    await workHandle.dispose()
    await personalHandle.dispose()
  })

  it("uses remote HTTP transport with server-derived store resolution", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-remote-"))
    tempDirs.push(rootDir)
    const alphaStore = join(rootDir, "alpha")
    const betaStore = join(rootDir, "beta")
    const endpoint = await startRemoteStorageFixture({
      "token-alpha": alphaStore,
      "token-beta": betaStore
    })

    const alphaHandle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "token-alpha"
    })
    const betaHandle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "token-beta"
    })
    const alpha = alphaHandle.core
    const beta = betaHandle.core

    await alpha.putConfig("profile.marker", { profile: "alpha" })

    await expect(alpha.getConfig("profile.marker")).resolves.toEqual({
      profile: "alpha"
    })
    await expect(beta.getConfig("profile.marker")).resolves.toBeNull()
    await expect(alpha.doctor()).resolves.toMatchObject({
      storePath: join(alphaStore, "state.db")
    })
    await expect(beta.doctor()).resolves.toMatchObject({
      storePath: join(betaStore, "state.db")
    })
    await alphaHandle.dispose()
    await betaHandle.dispose()
  })

  it("fails closed for unauthorized remote HTTP storage tokens", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-remote-deny-"))
    tempDirs.push(rootDir)
    const endpoint = await startRemoteStorageFixture({
      "token-alpha": join(rootDir, "alpha")
    })
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "unknown"
    })

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_status",
      message: "remote storage request failed with HTTP 401"
    } satisfies Partial<StorageTransportError>)
    await handle.dispose()
  })

  it("fails closed when remote HTTP storage returns invalid JSON", async () => {
    const server = createServer((_, response) => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end("not json")
    })
    const endpoint = await startServer(server)
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token"
    })

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_invalid_json",
      message: "remote storage returned invalid JSON"
    } satisfies Partial<StorageTransportError>)
    await handle.dispose()
  })

  it("times out stalled remote HTTP storage calls without leaking tokens", async () => {
    const server = createServer(() => {
      // Intentionally keep the request open until the client aborts it.
    })
    const endpoint = await startServer(server)
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token",
      timeoutMs: 25
    })

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_timeout",
      message: "remote storage request timed out"
    } satisfies Partial<StorageTransportError>)
    await expect(handle.core.doctor()).rejects.not.toThrow("secret-token")
    await handle.dispose()
  })

  it("classifies remote HTTP network failures without leaking tokens", async () => {
    const endpoint = "http://127.0.0.1:1/storage"
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token",
      timeoutMs: 250
    })

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_network",
      message: "remote storage network request failed"
    } satisfies Partial<StorageTransportError>)
    await expect(handle.core.doctor()).rejects.not.toThrow("secret-token")
    await handle.dispose()
  })

  it("does not let remote HTTP clients override the server-derived store", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-remote-override-"))
    tempDirs.push(rootDir)
    const allowedStore = join(rootDir, "allowed")
    const forbiddenStore = join(rootDir, "forbidden")
    const endpoint = await startRemoteStorageFixture({
      token: allowedStore
    })

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        storeDir: forbiddenStore,
        request: wireRequest({ command: "doctor" })
      })
    })
    const envelope = await response.json() as {
      readonly ok: boolean
      readonly value?: {
        readonly store_path?: string
      }
    }

    expect(response.ok).toBe(true)
    expect(envelope.ok).toBe(true)
    expect(envelope.value?.store_path).toBe(join(allowedStore, "state.db"))
    await expect(readFile(join(forbiddenStore, "state.db"))).rejects.toThrow()
  })

  it("uses an injected storage transport", async () => {
    const calls: unknown[] = []
    const transport: StorageTransport = {
      async call(request) {
        calls.push(request)
        return {
          storage_rpc_version: 1,
          request_id: "injected",
          ok: true,
          value: {
            store_path: "/virtual/store/state.db",
            schema_version: 2,
            checks: []
          }
        }
      }
    }
    const handle = createStorageHandleFromTransport(transport, {
      ownership: "borrowed"
    })

    await expect(handle.core.doctor()).resolves.toMatchObject({
      storePath: "/virtual/store/state.db",
      schemaVersion: 2
    })
    expect(calls).toEqual([{ command: "doctor" }])
  })

  it("retries transient sqlite lock envelopes at the storage boundary", async () => {
    const calls: unknown[] = []
    const transport: StorageTransport = {
      async call(request) {
        calls.push(request)
        if (calls.length < 3) {
          return {
            storage_rpc_version: 1,
            request_id: "retry",
            ok: false,
            error: {
              code: "sqlite",
              message: "sqlite error: database is locked"
            }
          }
        }
        return {
          storage_rpc_version: 1,
          request_id: "retry",
          ok: true,
          value: {
            store_path: "/virtual/store/state.db",
            schema_version: expectedSchemaVersion,
            checks: []
          }
        }
      }
    }
    const client = createCoreStore(transport)

    await expect(client.doctor()).resolves.toMatchObject({
      storePath: "/virtual/store/state.db",
      schemaVersion: expectedSchemaVersion
    })
    expect(calls).toEqual([
      { command: "doctor" },
      { command: "doctor" },
      { command: "doctor" }
    ])
  })

  it("does not retry non-transient sqlite envelopes", async () => {
    let calls = 0
    const transport: StorageTransport = {
      async call() {
        calls += 1
        return {
          storage_rpc_version: 1,
          request_id: "non-transient",
          ok: false,
          error: {
            code: "sqlite",
            message: "sqlite error: UNIQUE constraint failed"
          }
        }
      }
    }
    const client = createCoreStore(transport)

    await expect(client.doctor()).rejects.toMatchObject({
      name: "SystemServiceClientError",
      code: "sqlite"
    } satisfies Partial<SystemServiceClientError>)
    expect(calls).toBe(1)
  })

  it("classifies one-shot local transport spawn and invalid JSON failures", async () => {
    const invalidJsonBin = await createFakeSystemServiceBin(`
const input = await new Promise((resolve) => {
  let data = ""
  process.stdin.on("data", (chunk) => data += chunk)
  process.stdin.on("end", () => resolve(data))
})
void input
process.stdout.write("not json")
`)
    const invalidJsonTransport = new OneShotSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin: invalidJsonBin
    })

    await expect(invalidJsonTransport.exchange(wireRequest({ command: "doctor" }))).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_oneshot_invalid_json"
    } satisfies Partial<StorageTransportError>)

    const missingTransport = new OneShotSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin: join(tmpdir(), "wanex-missing-system-service")
    })
    await expect(missingTransport.exchange(wireRequest({ command: "doctor" }))).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_oneshot_spawn"
    } satisfies Partial<StorageTransportError>)
  })

  it("classifies persistent local malformed stdout and recovers on the next call", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const storeIndex = process.argv.indexOf("--store")
const storeDir = process.argv[storeIndex + 1]
const stateFile = join(storeDir, "attempt.txt")
let attempt = 0
try {
  attempt = Number(readFileSync(stateFile, "utf8"))
} catch {}
writeFileSync(stateFile, String(attempt + 1))
process.stdin.setEncoding("utf8")
process.stdin.on("data", () => {
  if (attempt === 0) {
    process.stdout.write("not json\\n")
    return
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    value: {
      store_path: join(storeDir, "state.db"),
      schema_version: 1,
      checks: []
    }
  }) + "\\n")
})
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-invalid-"))
    tempDirs.push(storeDir)
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      restartBackoffMs: 0
    })

    await expect(transport.exchange(wireRequest({ command: "doctor" }))).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_invalid_json"
    } satisfies Partial<StorageTransportError>)
    await expect(transport.exchange(wireRequest({ command: "doctor" }))).resolves.toMatchObject({
      ok: true,
      value: {
        schema_version: 1
      }
    })
    await transport.close()
  })

  it("classifies unexpected persistent local process close and recovers with bounded backoff", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const storeIndex = process.argv.indexOf("--store")
const storeDir = process.argv[storeIndex + 1]
const stateFile = join(storeDir, "attempt.txt")
let attempt = 0
try {
  attempt = Number(readFileSync(stateFile, "utf8"))
} catch {}
writeFileSync(stateFile, String(attempt + 1))
if (attempt === 0) {
  process.exit(0)
}
process.stdin.setEncoding("utf8")
process.stdin.on("data", () => {
  process.stdout.write(JSON.stringify({
    ok: true,
    value: {
      store_path: join(storeDir, "state.db"),
      schema_version: 1,
      checks: []
    }
  }) + "\\n")
})
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-close-"))
    tempDirs.push(storeDir)
    const sleeps: number[] = []
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      restartBackoffMs: 7,
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })

    await expect(transport.exchange(wireRequest({ command: "doctor" }))).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_closed"
    } satisfies Partial<StorageTransportError>)
    await expect(transport.exchange(wireRequest({ command: "doctor" }))).resolves.toMatchObject({
      ok: true,
      value: {
        schema_version: 1
      }
    })
    expect(sleeps).toEqual([7])
    await transport.close()
  })

  it("classifies persistent local spawn failures", async () => {
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin: join(tmpdir(), "wanex-missing-persistent-system-service"),
      restartBackoffMs: 0
    })

    await expect(transport.exchange(wireRequest({ command: "doctor" }))).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_spawn"
    } satisfies Partial<StorageTransportError>)
  })

  it("closes pending persistent calls and never restarts after close", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
process.stdin.resume()
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-dispose-"))
    tempDirs.push(storeDir)
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      restartBackoffMs: 0
    })

    const pending = transport.exchange(wireRequest({ command: "doctor" }))
    const pendingRejection = expect(pending).rejects.toMatchObject({
      code: "local_persistent_transport_closed"
    } satisfies Partial<StorageTransportError>)
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBe(1))
    await transport.close()

    await pendingRejection
    await expect(
      transport.exchange(wireRequest({ command: "doctor" }))
    ).rejects.toMatchObject({
      code: "local_persistent_transport_closed"
    } satisfies Partial<StorageTransportError>)
    expect(transport.connectionEpoch()).toBeNull()
  })

  it("times out an unresponsive persistent request and cleans its child", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
process.stdin.resume()
setInterval(() => {}, 1000)
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-timeout-"))
    tempDirs.push(storeDir)
    let terminations = 0
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      requestTimeoutMs: 20,
      cleanupTimeoutMs: 500,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child }) {
          terminations += 1
          child.kill("SIGKILL")
        }
      }
    })

    await expect(
      transport.exchange(wireRequest({ command: "doctor" }))
    ).rejects.toMatchObject({
      code: "local_persistent_request_timeout"
    } satisfies Partial<StorageTransportError>)
    await vi.waitFor(() => expect(terminations).toBe(1))
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBeNull())
    await transport.close()
  })

  it("uses one injected Windows tree cleanup for concurrent close calls", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
process.stdin.resume()
process.stdin.on("end", () => {})
setInterval(() => {}, 1000)
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-win-close-"))
    tempDirs.push(storeDir)
    const platforms: NodeJS.Platform[] = []
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      platform: "win32",
      requestTimeoutMs: 5_000,
      shutdownGraceMs: 20,
      cleanupTimeoutMs: 500,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child, platform }) {
          platforms.push(platform)
          child.kill("SIGKILL")
        }
      }
    })

    const pending = transport.exchange(wireRequest({ command: "doctor" }))
    const rejected = expect(pending).rejects.toMatchObject({
      code: "local_persistent_transport_closed"
    } satisfies Partial<StorageTransportError>)
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBe(1))
    await Promise.all([transport.close(), transport.close()])

    await rejected
    expect(platforms).toEqual(["win32"])
    expect(transport.connectionEpoch()).toBeNull()
  })

  it("reports a bounded process-tree cleanup failure without an unhandled rejection", async () => {
    const fakeBin = await createFakeSystemServiceBin(`
process.stdin.resume()
setInterval(() => {}, 1000)
`)
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-cleanup-timeout-"))
    tempDirs.push(storeDir)
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      serviceBin: fakeBin,
      requestTimeoutMs: 20,
      cleanupTimeoutMs: 20,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child }) {
          await new Promise((resolve) => setTimeout(resolve, 60))
          child.kill("SIGKILL")
        }
      }
    })

    await expect(
      transport.exchange(wireRequest({ command: "doctor" }))
    ).rejects.toMatchObject({
      code: "local_persistent_request_timeout"
    } satisfies Partial<StorageTransportError>)
    await new Promise((resolve) => setTimeout(resolve, 40))
    await expect(transport.close()).rejects.toMatchObject({
      code: "local_persistent_cleanup_timeout"
    } satisfies Partial<StorageTransportError>)
  })

  it("rejects invalid persistent lifecycle deadlines", () => {
    expect(() => new PersistentSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin,
      requestTimeoutMs: 0
    })).toThrow("requestTimeoutMs must be a positive integer")
    expect(() => new PersistentSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin,
      cleanupTimeoutMs: -1
    })).toThrow("cleanupTimeoutMs must be a positive integer")
  })

  it("persists and lists context replacements through system-service", async () => {
    const client = await createClient()
    await client.createSession({
      id: "ses_context_storage",
      kind: "agent"
    })
    const epoch = await client.putContextEpoch({
      id: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      metadata: { source: "storage-test" }
    })
    expect(epoch).toMatchObject({
      id: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      state: "building"
    })

    const first = await client.putContextReplacement({
      id: "ctxrep_storage",
      epochId: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      messageId: "msg_storage",
      partId: "part_storage",
      tier: "tier1_snip",
      originalTokenEstimate: 100,
      replacementTokenEstimate: 8,
      replacement: {
        type: "text",
        id: "part_storage",
        text: "short"
      }
    })
    expect(first.id).toBe("ctxrep_storage")

    const second = await client.putContextReplacement({
      id: "ctxrep_storage_ignored",
      epochId: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      messageId: "msg_storage",
      partId: "part_storage",
      tier: "tier2_placeholder",
      originalTokenEstimate: 100,
      replacementTokenEstimate: 3,
      replacement: {
        type: "text",
        id: "part_storage",
        text: "[compacted]"
      },
      metadata: { source: "storage-test" }
    })
    expect(second.id).toBe("ctxrep_storage")
    expect(second.tier).toBe("tier2_placeholder")

    const listed = await client.listContextReplacements({
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      epochId: "ctxepoch_storage"
    })
    expect(listed).toHaveLength(1)
    expect(listed[0]?.replacement).toMatchObject({
      type: "text",
      id: "part_storage",
      text: "[compacted]"
    })
    expect(listed[0]?.metadata).toEqual({ source: "storage-test" })

    const finalized = await client.putContextEpoch({
      id: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      policyVersion: "policy_storage",
      tokenEstimateBefore: 100,
      tokenEstimateAfter: 3,
      tokenSavings: 97,
      replacementCount: 1,
      metadata: { source: "storage-test", finalized: true }
    })
    expect(finalized).toMatchObject({
      id: "ctxepoch_storage",
      state: "building",
      replacementCount: 1,
      metadata: { source: "storage-test", finalized: true }
    })
    await expect(
      client.getActiveContextEpoch({
        sessionId: "ses_context_storage",
        policyVersion: "policy_storage"
      })
    ).resolves.toBeNull()
    const active = await client.activateContextEpoch({
      epochId: "ctxepoch_storage"
    })
    expect(active).toMatchObject({
      id: "ctxepoch_storage",
      state: "active",
      replacementCount: 1
    })
    await expect(
      client.getActiveContextEpoch({
        sessionId: "ses_context_storage",
        policyVersion: "policy_storage"
      })
    ).resolves.toMatchObject({
      id: "ctxepoch_storage",
      state: "active"
    })
    await expect(
      client.putContextReplacement({
        id: "ctxrep_storage_after_active",
        epochId: "ctxepoch_storage",
        sessionId: "ses_context_storage",
        policyVersion: "policy_storage",
        messageId: "msg_storage",
        partId: "part_storage_after_active",
        tier: "tier1_snip",
        originalTokenEstimate: 10,
        replacementTokenEstimate: 5,
        replacement: {
          type: "text",
          id: "part_storage_after_active",
          text: "short"
        }
      })
    ).rejects.toThrow(/building epoch/)
  })

  it("clones and prunes context epochs through system-service", async () => {
    const client = await createClient()
    await client.createSession({
      id: "ses_context_maintenance_storage",
      kind: "agent"
    })

    async function createActiveEpoch(epochId: string, partId: string) {
      await client.putContextEpoch({
        id: epochId,
        sessionId: "ses_context_maintenance_storage",
        policyVersion: "policy_maintenance_storage",
        tokenEstimateBefore: 100,
        tokenEstimateAfter: 5,
        tokenSavings: 95,
        replacementCount: 1
      })
      await client.putContextReplacement({
        id: `ctxrep_${partId}`,
        epochId,
        sessionId: "ses_context_maintenance_storage",
        policyVersion: "policy_maintenance_storage",
        messageId: `msg_${partId}`,
        partId,
        tier: "tier2_placeholder",
        originalTokenEstimate: 100,
        replacementTokenEstimate: 5,
        replacement: {
          type: "text",
          id: partId,
          text: "[compacted]"
        }
      })
      return await client.activateContextEpoch({ epochId })
    }

    await createActiveEpoch("ctxepoch_storage_maintenance_one", "part_one")
    await createActiveEpoch("ctxepoch_storage_maintenance_two", "part_two")
    await createActiveEpoch("ctxepoch_storage_maintenance_three", "part_three")

    await expect(
      client.activateContextEpoch({
        epochId: "ctxepoch_storage_maintenance_one"
      })
    ).rejects.toThrow(/superseded/)

    const cloned = await client.cloneContextEpoch({
      sourceEpochId: "ctxepoch_storage_maintenance_one",
      id: "ctxepoch_storage_maintenance_clone",
      metadata: { reason: "restore" }
    })
    expect(cloned).toMatchObject({
      id: "ctxepoch_storage_maintenance_clone",
      state: "building",
      replacementCount: 1,
      metadata: { reason: "restore" }
    })
    const clonedReplacements = await client.listContextReplacements({
      sessionId: "ses_context_maintenance_storage",
      policyVersion: "policy_maintenance_storage",
      epochId: "ctxepoch_storage_maintenance_clone"
    })
    expect(clonedReplacements).toHaveLength(1)
    expect(clonedReplacements[0]?.partId).toBe("part_one")
    expect(clonedReplacements[0]?.id).not.toBe("ctxrep_part_one")

    await client.activateContextEpoch({
      epochId: "ctxepoch_storage_maintenance_clone"
    })
    await expect(
      client.getActiveContextEpoch({
        sessionId: "ses_context_maintenance_storage",
        policyVersion: "policy_maintenance_storage"
      })
    ).resolves.toMatchObject({
      id: "ctxepoch_storage_maintenance_clone"
    })

    const dryRun = await client.pruneContextEpochs({
      sessionId: "ses_context_maintenance_storage",
      policyVersion: "policy_maintenance_storage",
      keepLastSuperseded: 1,
      dryRun: true
    })
    expect(dryRun).toMatchObject({
      sessionId: "ses_context_maintenance_storage",
      policyVersion: "policy_maintenance_storage",
      scannedCount: 3,
      deletedReplacementCount: 2,
      dryRun: true
    })
    await expect(
      client.listContextEpochs({
        sessionId: "ses_context_maintenance_storage",
        policyVersion: "policy_maintenance_storage",
        state: "superseded"
      })
    ).resolves.toHaveLength(3)

    const pruned = await client.pruneContextEpochs({
      sessionId: "ses_context_maintenance_storage",
      policyVersion: "policy_maintenance_storage",
      keepLastSuperseded: 1
    })
    expect(pruned).toMatchObject({
      deletedReplacementCount: 2,
      dryRun: false
    })
    expect(pruned.deletedEpochIds).toHaveLength(2)
    const remaining = await client.listContextEpochs({
      sessionId: "ses_context_maintenance_storage",
      policyVersion: "policy_maintenance_storage"
    })
    expect(remaining.map((epoch) => epoch.state).sort()).toEqual([
      "active",
      "superseded"
    ])
  })

  it("persists workspace changesets and operation receipts through system-service", async () => {
    const client = await createClient()
    const changeSet = await client.putWorkspaceChangeSet({
      workspaceId: "workspace_storage",
      principalId: "agent_storage",
      changeSet: {
        id: "cs_storage_workspace",
        title: "Storage workspace",
        changes: [
          {
            path: "file.txt",
            kind: "update",
            baseText: "before\n",
            targetText: "after\n"
          }
        ]
      }
    })

    expect(changeSet.currentState).toBe("submitted")
    expect(changeSet.changeSet.title).toBe("Storage workspace")

    const operation = await client.recordWorkspaceChangeOperation({
      changeSetId: changeSet.id,
      operation: "apply",
      receipt: {
        changeSetId: changeSet.id,
        status: "applied",
        files: [
          {
            path: "file.txt",
            kind: "update",
            beforeText: "before\n",
            afterText: "after\n",
            merged: false
          }
        ],
        conflicts: []
      }
    })

    expect(operation.status).toBe("applied")
    const fetched = await client.getWorkspaceChangeSet({
      changeSetId: changeSet.id
    })
    expect(fetched?.currentState).toBe("applied")

    const listed = await client.listWorkspaceChangeSets({
      workspaceId: "workspace_storage",
      state: "applied"
    })
    expect(listed.map((record) => record.id)).toEqual([changeSet.id])

    const operations = await client.listWorkspaceChangeOperations({
      changeSetId: changeSet.id
    })
    expect(operations).toHaveLength(1)
    expect(operations[0]?.receipt.files[0]).toMatchObject({
      path: "file.txt",
      afterText: "after\n"
    })
  })

  it("persists workspace change proposal review operations through system-service", async () => {
    const client = await createClient()
    const changeSet = await client.putWorkspaceChangeSet({
      workspaceId: "workspace_proposal_storage",
      principalId: "agent_proposal_storage",
      changeSet: {
        id: "cs_storage_proposal",
        title: "Storage proposal",
        changes: [
          {
            path: "proposal.txt",
            kind: "create",
            targetText: "proposal\n"
          }
        ]
      }
    })

    const proposal = await client.putWorkspaceChangeProposal({
      id: "wcp_storage",
      workspaceId: "workspace_proposal_storage",
      principalId: "agent_proposal_storage",
      changeSetId: changeSet.id,
      title: "Review storage proposal",
      summary: "Needs review",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "proposal-storage-key"
    })
    const duplicate = await client.putWorkspaceChangeProposal({
      workspaceId: "workspace_proposal_storage",
      principalId: "agent_proposal_storage",
      changeSetId: changeSet.id,
      title: "Review storage proposal",
      summary: "Needs review",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "proposal-storage-key"
    })

    expect(duplicate.id).toBe(proposal.id)
    expect(proposal.state).toBe("open")

    const approval = await client.recordWorkspaceChangeProposalOperation({
      id: "wcpo_storage_approve",
      proposalId: proposal.id,
      operation: "approve",
      actorId: "user_storage",
      reason: "approved in storage test"
    })
    expect(approval).toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved"
    })

    const requestApply = await client.recordWorkspaceChangeProposalOperation({
      id: "wcpo_storage_apply",
      proposalId: proposal.id,
      operation: "request_apply",
      actorId: "user_storage",
      metadata: { target: "workspace" }
    })
    expect(requestApply).toMatchObject({
      operation: "request_apply",
      fromState: "approved",
      toState: "apply_requested"
    })

    await expect(
      client.getWorkspaceChangeProposal({ proposalId: proposal.id })
    ).resolves.toMatchObject({
      id: proposal.id,
      state: "apply_requested",
      metadata: { source: "storage-client-test" }
    })
    await expect(
      client.listWorkspaceChangeProposals({
        workspaceId: "workspace_proposal_storage",
        state: "apply_requested"
      })
    ).resolves.toHaveLength(1)
    await expect(
      client.listWorkspaceChangeProposalOperations({
        proposalId: proposal.id
      })
    ).resolves.toHaveLength(2)
  })

  it("persists plan proposal lifecycle through system-service", async () => {
    const client = await createClient()
    await client.createSession({
      id: "ses_plan_storage",
      kind: "agent",
      title: "Plan source"
    })
    await client.putWorkspaceChangeSet({
      workspaceId: "workspace_plan_storage",
      principalId: "agent_plan_storage",
      changeSet: {
        id: "cs_plan_storage",
        changes: [
          {
            path: "plan-storage.txt",
            kind: "create",
            targetText: "plan\n"
          }
        ]
      }
    })
    await client.putWorkspaceChangeProposal({
      id: "wcp_plan_storage",
      workspaceId: "workspace_plan_storage",
      principalId: "agent_plan_storage",
      changeSetId: "cs_plan_storage",
      title: "Workspace dependency",
      summary: "Referenced by plan"
    })

    const proposal = await client.putPlanProposal({
      id: "planp_storage",
      principalId: "agent_plan_storage",
      title: "Plan storage",
      summary: "Durable plan proposal",
      steps: [
        { id: "step_1", title: "Inspect", status: "pending" },
        {
          id: "step_2",
          title: "Implement",
          detail: "storage boundary"
        }
      ],
      references: [
        { kind: "session", id: "ses_plan_storage", role: "source" },
        {
          kind: "workspace_change_proposal",
          id: "wcp_plan_storage",
          role: "related"
        }
      ],
      metadata: { source: "storage-client-test" },
      idempotencyKey: "plan-storage-key"
    })
    const duplicate = await client.putPlanProposal({
      id: "ignored_plan_storage",
      principalId: "agent_plan_storage",
      title: "Plan storage",
      summary: "Durable plan proposal",
      steps: [
        { id: "step_1", title: "Inspect", status: "pending" },
        {
          id: "step_2",
          title: "Implement",
          detail: "storage boundary"
        }
      ],
      references: [
        { kind: "session", id: "ses_plan_storage", role: "source" },
        {
          kind: "workspace_change_proposal",
          id: "wcp_plan_storage",
          role: "related"
        }
      ],
      metadata: { source: "storage-client-test" },
      idempotencyKey: "plan-storage-key"
    })

    expect(duplicate.id).toBe(proposal.id)
    expect(proposal).toMatchObject({
      id: "planp_storage",
      principalId: "agent_plan_storage",
      state: "open",
      metadata: { source: "storage-client-test" }
    })
    expect(proposal.references.map((reference) => reference.id)).toEqual([
      "ses_plan_storage",
      "wcp_plan_storage"
    ])

    await expect(
      client.recordPlanProposalOperation({
        id: "planop_storage_invalid",
        proposalId: proposal.id,
        operation: "request_execution",
        actorId: "user_plan_storage"
      })
    ).rejects.toThrow("invalid plan proposal transition")

    const approved = await client.recordPlanProposalOperation({
      id: "planop_storage_approve",
      proposalId: proposal.id,
      operation: "approve",
      actorId: "user_plan_storage",
      reason: "approved in storage test"
    })
    expect(approved).toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved"
    })

    const executionRequested = await client.recordPlanProposalOperation({
      id: "planop_storage_request_execution",
      proposalId: proposal.id,
      operation: "request_execution",
      actorId: "user_plan_storage",
      metadata: { target: "runtime" }
    })
    expect(executionRequested).toMatchObject({
      operation: "request_execution",
      fromState: "approved",
      toState: "execution_requested"
    })

    const executed = await client.recordPlanProposalOperation({
      id: "planop_storage_mark_executed",
      proposalId: proposal.id,
      operation: "mark_executed",
      actorId: "runtime_plan_storage",
      metadata: { jobId: "job_plan_storage" }
    })
    expect(executed).toMatchObject({
      operation: "mark_executed",
      fromState: "execution_requested",
      toState: "executed"
    })

    await expect(
      client.getPlanProposal({ proposalId: proposal.id })
    ).resolves.toMatchObject({
      id: proposal.id,
      state: "executed",
      metadata: { source: "storage-client-test" }
    })

    await expect(
      client.listPlanProposals({
        referenceKind: "session",
        referenceId: "ses_plan_storage",
        state: "executed"
      })
    ).resolves.toEqual([expect.objectContaining({ id: proposal.id })])

    await expect(
      client.listPlanProposalOperations({ proposalId: proposal.id })
    ).resolves.toEqual([
      expect.objectContaining({ operation: "approve" }),
      expect.objectContaining({ operation: "request_execution" }),
      expect.objectContaining({ operation: "mark_executed" })
    ])

    const events = await client.queryEvents({
      scope: { planProposalId: proposal.id },
      limit: 10
    })
    expect(events.map((event) => event.type)).toEqual([
      "plan.proposal.created",
      "plan.proposal.operation_recorded",
      "plan.proposal.operation_recorded",
      "plan.proposal.operation_recorded"
    ])
    expect(events.every((event) => event.scope.planProposalId === proposal.id))
      .toBe(true)
  })

  it("persists objective run lifecycle through system-service", async () => {
    const client = await createClient()
    await client.createSession({
      id: "ses_objective_storage",
      kind: "agent",
      title: "Objective source"
    })

    const objective = await client.putObjectiveRun({
      id: "objective_storage",
      principalId: "agent_objective_storage",
      objective: "Reduce login LCP below 2.5s",
      scope: "apps/web",
      constraints: [
        "do not change public auth API",
        "run verification before success"
      ],
      successCriteria: ["npm test passes"],
      stopPolicy: {
        maxAttempts: 3,
        maxElapsedMs: 600_000,
        repeatedBlockThreshold: 2,
        requireVerification: true
      },
      references: [
        {
          kind: "session",
          id: "ses_objective_storage",
          role: "source",
          metadata: { order: 1 }
        }
      ],
      metadata: { source: "storage-client-test" },
      idempotencyKey: "objective-storage-key"
    })
    const duplicate = await client.putObjectiveRun({
      id: "ignored_objective_storage",
      principalId: "agent_objective_storage",
      objective: "Reduce login LCP below 2.5s",
      scope: "apps/web",
      constraints: [
        "do not change public auth API",
        "run verification before success"
      ],
      successCriteria: ["npm test passes"],
      stopPolicy: {
        maxAttempts: 3,
        maxElapsedMs: 600_000,
        repeatedBlockThreshold: 2,
        requireVerification: true
      },
      references: [
        {
          kind: "session",
          id: "ses_objective_storage",
          role: "source",
          metadata: { order: 1 }
        }
      ],
      metadata: { source: "storage-client-test" },
      idempotencyKey: "objective-storage-key"
    })

    expect(duplicate.id).toBe(objective.id)
    expect(objective).toMatchObject({
      id: "objective_storage",
      principalId: "agent_objective_storage",
      objective: "Reduce login LCP below 2.5s",
      state: "open",
      stopPolicy: {
        maxAttempts: 3,
        requireVerification: true
      },
      metadata: { source: "storage-client-test" }
    })
    expect(objective.references).toEqual([
      {
        kind: "session",
        id: "ses_objective_storage",
        role: "source",
        metadata: { order: 1 }
      }
    ])

    await expect(
      client.recordObjectiveRunOperation({
        id: "objectiveop_storage_invalid",
        objectiveId: objective.id,
        operation: "mark_succeeded",
        actorId: "user_objective_storage"
      })
    ).rejects.toThrow("invalid objective run transition")

    const started = await client.recordObjectiveRunOperation({
      id: "objectiveop_storage_start",
      objectiveId: objective.id,
      operation: "start",
      actorId: "user_objective_storage",
      reason: "approved"
    })
    expect(started).toMatchObject({
      operation: "start",
      fromState: "open",
      toState: "running"
    })

    const blocked = await client.recordObjectiveRunOperation({
      id: "objectiveop_storage_blocked",
      objectiveId: objective.id,
      operation: "record_blocked",
      actorId: "runtime_objective_storage",
      reason: "needs credentials",
      metadata: { source: "storage-client-test" }
    })
    expect(blocked).toMatchObject({
      operation: "record_blocked",
      fromState: "running",
      toState: "blocked",
      metadata: { source: "storage-client-test" }
    })

    const restarted = await client.recordObjectiveRunOperation({
      id: "objectiveop_storage_restart",
      objectiveId: objective.id,
      operation: "start",
      actorId: "user_objective_storage",
      reason: "credentials provided"
    })
    expect(restarted).toMatchObject({
      operation: "start",
      fromState: "blocked",
      toState: "running"
    })

    const attempt = await client.putObjectiveAttempt({
      id: "objectiveatt_storage_1",
      objectiveId: objective.id,
      attemptNumber: 1,
      state: "succeeded",
      sessionId: "ses_objective_storage",
      sessionInputId: "inp_objective_storage",
      sessionTurnId: "turn_objective_storage",
      schedulerJobId: "job_objective_storage",
      summary: "Verified LCP target",
      result: { lcpMs: 2300 },
      metadata: { attempt: 1 },
      startedAt: 100,
      finishedAt: 200,
      idempotencyKey: "objective-storage-attempt-key"
    })
    const duplicateAttempt = await client.putObjectiveAttempt({
      id: "ignored_objectiveatt_storage",
      objectiveId: objective.id,
      attemptNumber: 1,
      state: "succeeded",
      sessionId: "ses_objective_storage",
      sessionInputId: "inp_objective_storage",
      sessionTurnId: "turn_objective_storage",
      schedulerJobId: "job_objective_storage",
      summary: "Verified LCP target",
      result: { lcpMs: 2300 },
      metadata: { attempt: 1 },
      startedAt: 100,
      finishedAt: 200,
      idempotencyKey: "objective-storage-attempt-key"
    })
    expect(duplicateAttempt.id).toBe(attempt.id)
    expect(attempt).toMatchObject({
      id: "objectiveatt_storage_1",
      objectiveId: objective.id,
      attemptNumber: 1,
      state: "succeeded",
      result: { lcpMs: 2300 }
    })

    const verification = await client.putObjectiveVerification({
      id: "objectivever_storage_1",
      objectiveId: objective.id,
      attemptId: attempt.id,
      kind: "script",
      state: "passed",
      reason: "test command passed",
      evidence: { command: "npm test", exitCode: 0 },
      verifierRef: "local-script",
      idempotencyKey: "objective-storage-verification-key"
    })
    expect(verification).toMatchObject({
      id: "objectivever_storage_1",
      objectiveId: objective.id,
      attemptId: attempt.id,
      state: "passed",
      evidence: { command: "npm test", exitCode: 0 }
    })

    const succeeded = await client.recordObjectiveRunOperation({
      id: "objectiveop_storage_succeeded",
      objectiveId: objective.id,
      operation: "mark_succeeded",
      actorId: "runtime_objective_storage",
      reason: "verification passed",
      metadata: { verificationId: verification.id }
    })
    expect(succeeded).toMatchObject({
      operation: "mark_succeeded",
      fromState: "running",
      toState: "succeeded"
    })

    await expect(
      client.getObjectiveRun({ objectiveId: objective.id })
    ).resolves.toMatchObject({
      id: objective.id,
      state: "succeeded",
      closedAt: expect.any(Number)
    })
    await expect(
      client.listObjectiveRuns({
        state: "succeeded",
        referenceKind: "session",
        referenceId: "ses_objective_storage"
      })
    ).resolves.toEqual([expect.objectContaining({ id: objective.id })])
    await expect(
      client.listObjectiveRunOperations({ objectiveId: objective.id })
    ).resolves.toEqual([
      expect.objectContaining({ operation: "start" }),
      expect.objectContaining({ operation: "record_blocked" }),
      expect.objectContaining({ operation: "start" }),
      expect.objectContaining({ operation: "mark_succeeded" })
    ])
    await expect(
      client.listObjectiveAttempts({
        objectiveId: objective.id,
        state: "succeeded"
      })
    ).resolves.toEqual([expect.objectContaining({ id: attempt.id })])
    await expect(
      client.listObjectiveVerifications({
        objectiveId: objective.id,
        attemptId: attempt.id,
        state: "passed"
      })
    ).resolves.toEqual([expect.objectContaining({ id: verification.id })])

    const events = await client.queryEvents({
      scope: { objectiveId: objective.id },
      limit: 20
    })
    expect(events.map((event) => event.type)).toEqual([
      "objective.run.created",
      "objective.run.operation_recorded",
      "objective.run.operation_recorded",
      "objective.run.operation_recorded",
      "objective.attempt.recorded",
      "objective.verification.recorded",
      "objective.run.operation_recorded"
    ])
    expect(events.every((event) => event.scope.objectiveId === objective.id))
      .toBe(true)
  })

  it("persists delegation graph topology through the system-service process", async () => {
    const client = await createClient()
    const graph = await client.putDelegationGraph({
      principalId: "controller_storage",
      title: "Storage delegation graph",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "delegation-storage-graph"
    })
    const duplicateGraph = await client.putDelegationGraph({
      id: "ignored_graph_id",
      principalId: "controller_storage",
      title: "Storage delegation graph",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "delegation-storage-graph"
    })
    expect(duplicateGraph.id).toBe(graph.id)
    expect(graph.state).toBe("open")

    const source = await client.putDelegationGraphNode({
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { prompt: "inspect storage runtime" },
      idempotencyKey: "delegation-storage-source"
    })
    const target = await client.putDelegationGraphNode({
      id: "node_storage_aggregate",
      graphId: graph.id,
      kind: "aggregation",
      principalId: "controller_storage",
      payload: { mode: "merge" },
      metadata: { lane: "summary" }
    })
    const duplicateSource = await client.putDelegationGraphNode({
      id: "ignored_node_id",
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { prompt: "inspect storage runtime" },
      idempotencyKey: "delegation-storage-source"
    })
    expect(duplicateSource.id).toBe(source.id)
    await expect(
      client.getDelegationGraphNode({ nodeId: source.id })
    ).resolves.toMatchObject({
      id: source.id,
      graphId: graph.id,
      kind: "agent_task"
    })
    await expect(
      client.getDelegationGraphNode({ nodeId: "node_storage_missing" })
    ).resolves.toBeNull()

    const dependency = await client.putDelegationGraphDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: target.id
    })
    expect(dependency.kind).toBe("after_success")

    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 })
    ).resolves.toMatchObject([{ id: source.id }])

    await expect(
      client.attachDelegationGraphNodeJob({
        nodeId: source.id,
        schedulerJobId: "job_storage_source"
      })
    ).resolves.toMatchObject({
      id: source.id,
      schedulerJobId: "job_storage_source"
    })

    await client.updateDelegationGraphState({
      graphId: graph.id,
      state: "running"
    })
    await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "running"
    })
    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 })
    ).resolves.toEqual([])

    const succeededSource = await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "succeeded",
      metadata: { result: "done" }
    })
    expect(succeededSource.finishedAt).toEqual(expect.any(Number))
    expect(succeededSource.metadata).toEqual({ result: "done" })

    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 })
    ).resolves.toMatchObject([{ id: target.id }])
    await expect(
      client.listDelegationGraphs({
        principalId: "controller_storage",
        state: "running"
      })
    ).resolves.toMatchObject([{ id: graph.id }])
    await expect(
      client.listDelegationGraphNodes({
        graphId: graph.id,
        state: "succeeded"
      })
    ).resolves.toMatchObject([{ id: source.id }])
    await expect(
      client.listDelegationGraphDependencies({ graphId: graph.id })
    ).resolves.toMatchObject([{ id: dependency.id }])
    await expect(
      client.getDelegationGraph({ graphId: graph.id })
    ).resolves.toMatchObject({
      id: graph.id,
      state: "running",
      metadata: { source: "storage-client-test" }
    })

    const closed = await client.updateDelegationGraphState({
      graphId: graph.id,
      state: "succeeded"
    })
    expect(closed.closedAt).toEqual(expect.any(Number))
  })

  it("materializes one ready delegation node into a scheduler job atomically", async () => {
    const client = await createClient()
    const graph = await client.putDelegationGraph({
      id: "graph_storage_materialize",
      principalId: "controller_storage"
    })
    const source = await client.putDelegationGraphNode({
      id: "node_storage_materialize_source",
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { handlerId: "handler.storage.materialize" }
    })
    const target = await client.putDelegationGraphNode({
      id: "node_storage_materialize_target",
      graphId: graph.id,
      kind: "workspace_task",
      principalId: "agent_storage_b",
      payload: { handlerId: "merge" }
    })
    await client.putDelegationGraphDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: target.id
    })

    const first = await client.materializeReadyDelegationGraphNode({
      graphId: graph.id,
      workerId: "orchestrator_storage",
      jobId: "job_storage_materialized_source",
      jobKind: "workspace.task",
      priority: 7
    })
    expect(first?.node).toMatchObject({
      id: source.id,
      state: "running",
      schedulerJobId: "job_storage_materialized_source"
    })
    expect(first?.job).toMatchObject({
      id: "job_storage_materialized_source",
      kind: "workspace.task",
      priority: 7
    })
    expect(first?.job.payload).toMatchObject({
      delegationGraphId: graph.id,
      delegationNodeId: source.id,
      nodeKind: "agent_task",
      payload: { handlerId: "handler.storage.materialize" }
    })

    await expect(
      client.materializeReadyDelegationGraphNode({
        graphId: graph.id,
        nodeId: source.id,
        workerId: "orchestrator_storage",
        jobId: "job_storage_duplicate",
        jobKind: "workspace.task"
      })
    ).resolves.toBeNull()
    await expect(
      client.materializeReadyDelegationGraphNode({
        graphId: graph.id,
        nodeId: target.id,
        workerId: "orchestrator_storage",
        jobId: "job_storage_target_early",
        jobKind: "workspace.task"
      })
    ).resolves.toBeNull()

    await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "succeeded"
    })
    const second = await client.materializeReadyDelegationGraphNode({
      graphId: graph.id,
      nodeId: target.id,
      workerId: "orchestrator_storage",
      jobId: "job_storage_materialized_target",
      jobKind: "workspace.task",
      jobPayload: { handlerId: "override" },
      jobIdempotencyKey: "storage-materialized-target-key"
    })
    expect(second?.node).toMatchObject({
      id: target.id,
      state: "running",
      schedulerJobId: "job_storage_materialized_target"
    })
    expect(second?.job.payload).toMatchObject({
      delegationNodeId: target.id,
      payload: { handlerId: "override" }
    })
  })

  it("persists team conversations participants and turns through system-service", async () => {
    const client = await createClient()
    const conversation = await client.putTeamConversation({
      principalId: "team_owner_storage",
      title: "Storage team",
      mode: "hybrid",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "team-storage-conversation"
    })
    const duplicate = await client.putTeamConversation({
      id: "ignored_team_id",
      principalId: "team_owner_storage",
      title: "Storage team",
      mode: "hybrid",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "team-storage-conversation"
    })
    expect(duplicate.id).toBe(conversation.id)

    const user = await client.putTeamParticipant({
      id: "team_storage_user",
      conversationId: conversation.id,
      principalId: "user_storage",
      kind: "user",
      displayName: "User",
      role: "requester",
      idempotencyKey: "team-storage-user"
    })
    const agent = await client.putTeamParticipant({
      id: "team_storage_agent",
      conversationId: conversation.id,
      principalId: "agent_storage",
      kind: "agent",
      displayName: "Agent",
      role: "reviewer",
      metadata: { profile: "coder" }
    })

    const turn = await client.appendTeamTurn({
      id: "team_storage_turn_one",
      conversationId: conversation.id,
      speakerParticipantId: user.id,
      audienceParticipantIds: [agent.id],
      kind: "message",
      content: [
        {
          type: "text",
          id: "part_team_storage_1",
          text: "Please review."
        }
      ],
      metadata: { source: "storage-client-test" }
    })
    expect(turn).toMatchObject({
      id: "team_storage_turn_one",
      conversationId: conversation.id,
      speakerParticipantId: user.id,
      audienceParticipantIds: [agent.id],
      kind: "message"
    })

    await expect(
      client.listTeamConversations({
        principalId: "team_owner_storage",
        state: "open",
        mode: "hybrid"
      })
    ).resolves.toMatchObject([{ id: conversation.id }])
    await expect(
      client.listTeamParticipants({
        conversationId: conversation.id,
        state: "active"
      })
    ).resolves.toHaveLength(2)
    await expect(
      client.listTeamTurns({ conversationId: conversation.id })
    ).resolves.toMatchObject([
      {
        id: turn.id,
        content: [{ text: "Please review." }]
      }
    ])

    await client.updateTeamParticipantState({
      participantId: agent.id,
      state: "muted"
    })
    await expect(
      client.appendTeamTurn({
        conversationId: conversation.id,
        speakerParticipantId: agent.id,
        content: [{ type: "text", id: "part_team_muted", text: "Muted." }]
      })
    ).rejects.toThrow(/speaker must be active/)

    await expect(
      client.updateTeamConversationState({
        conversationId: conversation.id,
        state: "closed"
      })
    ).resolves.toMatchObject({
      id: conversation.id,
      closedAt: expect.any(Number)
    })
    await expect(client.getTeamConversation(conversation.id)).resolves.toMatchObject({
      state: "closed"
    })
    await expect(
      client.appendTeamTurn({
        conversationId: conversation.id,
        speakerParticipantId: user.id,
        content: [{ type: "text", id: "part_team_closed", text: "Closed." }]
      })
    ).rejects.toThrow(/not open/)
  })

  it("persists plugin manifests and submits plugin action jobs", async () => {
    const client = await createClient()
    const manifest = await client.putPluginManifest({
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      entry: { kind: "process", command: "telegram-connector" },
      capabilities: [
        "channel.connect",
        "channel.receive",
        "channel.deliver",
        "resource.write",
        "team.conversation.write"
      ],
      metadata: { connector: true },
      idempotencyKey: "plugin-storage-telegram"
    })
    const duplicate = await client.putPluginManifest({
      id: "ignored_plugin_manifest",
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      entry: { kind: "process", command: "telegram-connector" },
      capabilities: manifest.capabilities,
      metadata: { connector: true },
      idempotencyKey: "plugin-storage-telegram"
    })
    expect(duplicate.id).toBe(manifest.id)
    expect(manifest.capabilities).toContain("channel.deliver")

    await expect(
      client.getPluginManifest({ pluginId: "connector.telegram" })
    ).resolves.toMatchObject({
      id: manifest.id,
      state: "registered"
    })
    await expect(
      client.listPluginManifests({
        state: "registered",
        capability: "channel.deliver"
      })
    ).resolves.toMatchObject([{ id: manifest.id }])

    const layout = {
      kind: "wanex.plugin.package.layout.v1",
      pluginId: "connector.telegram",
      version: "1.0.0"
    }
    const trust = {
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      decision: { status: "allow" }
    }
    const install = await client.putPluginInstall({
      pluginId: "connector.telegram",
      version: "1.0.0",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0",
      metadata: { source: "storage-test" },
      idempotencyKey: "plugin-storage-telegram-install"
    })
    expect(install).toMatchObject({
      pluginId: "connector.telegram",
      version: "1.0.0",
      state: "installed",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0"
    })
    const duplicateInstall = await client.putPluginInstall({
      id: "ignored_plugin_install",
      pluginId: "connector.telegram",
      version: "1.0.0",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0",
      metadata: { source: "storage-test" },
      idempotencyKey: "plugin-storage-telegram-install"
    })
    expect(duplicateInstall.id).toBe(install.id)
    await expect(
      client.getPluginInstall({ pluginId: "connector.telegram", version: "1.0.0" })
    ).resolves.toMatchObject({ id: install.id })
    await expect(
      client.listPluginInstalls({ pluginId: "connector.telegram", state: "installed" })
    ).resolves.toMatchObject([{ id: install.id }])
    const disabledInstall = await client.updatePluginInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      state: "disabled"
    })
    expect(disabledInstall).toMatchObject({
      id: install.id,
      state: "disabled"
    })
    expect(disabledInstall.disabledAt).toEqual(expect.any(Number))
    expect(disabledInstall.removedAt).toBeUndefined()
    const removedInstall = await client.updatePluginInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      state: "removed"
    })
    expect(removedInstall).toMatchObject({
      id: install.id,
      state: "removed"
    })
    expect(removedInstall.disabledAt).toBeUndefined()
    expect(removedInstall.removedAt).toEqual(expect.any(Number))
    await expect(
      client.updatePluginInstallState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        state: "installed"
      })
    ).resolves.toEqual(expect.objectContaining({
      id: install.id,
      state: "installed"
    }))
    const restoredInstall = await client.getPluginInstall({
      pluginId: "connector.telegram",
      version: "1.0.0"
    })
    expect(restoredInstall?.disabledAt).toBeUndefined()
    expect(restoredInstall?.removedAt).toBeUndefined()

    const submission = await client.submitPluginAction({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      principalId: "principal_channel_storage",
      payload: { chatId: "123", text: "hello" },
      requiredCapability: "channel.deliver",
      jobId: "job_storage_plugin_deliver",
      jobIdempotencyKey: "storage-plugin-deliver-job",
      priority: 4,
      maxAttempts: 2
    })
    expect(submission.job).toMatchObject({
      id: "job_storage_plugin_deliver",
      kind: "plugin.action",
      priority: 4
    })
    expect(submission.job.payload).toMatchObject({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      requiredCapability: "channel.deliver",
      payload: { text: "hello" }
    })

    const registration = await client.putConnectorRegistration({
      connectorId: "connector.telegram",
      pluginId: "connector.telegram",
      version: "1.0.0",
      metadata: { runtime: "storage-test" },
      idempotencyKey: "storage-connector-telegram"
    })
    expect(registration).toMatchObject({
      connectorId: "connector.telegram",
      pluginId: "connector.telegram",
      pluginVersion: "1.0.0",
      state: "active",
      metadata: { runtime: "storage-test" }
    })
    await expect(
      client.listConnectorRegistrations({ connectorId: "connector.telegram" })
    ).resolves.toMatchObject([{ id: registration.id }])

    const credential = await client.putConnectorCredential({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "env://TELEGRAM_BOT_TOKEN",
      metadata: { scope: "bot-main" },
      idempotencyKey: "storage-connector-credential"
    })
    expect(credential).toMatchObject({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "env://TELEGRAM_BOT_TOKEN",
      state: "active",
      metadata: { scope: "bot-main" }
    })
    await expect(
      client.listConnectorCredentials({ connectorId: "connector.telegram" })
    ).resolves.toMatchObject([{ id: credential.id }])

    const session = await client.startConnectorSession({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector-worker-storage",
      leaseMs: 60_000,
      state: "connecting",
      metadata: { phase: "connect" },
      idempotencyKey: "storage-connector-session"
    })
    expect(session).toMatchObject({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      state: "connecting",
      ownerId: "connector-worker-storage",
      metadata: { phase: "connect" }
    })
    expect(session.leaseToken).toMatch(/^lease_/)
    await expect(
      client.heartbeatConnectorSession({
        sessionId: session.id,
        ownerId: "connector-worker-storage",
        leaseToken: session.leaseToken,
        leaseMs: 60_000,
        state: "connected",
        metadata: { phase: "connected" }
      })
    ).resolves.toMatchObject({
      id: session.id,
      state: "connected",
      metadata: { phase: "connected" }
    })
    await expect(
      client.finishConnectorSession({
        sessionId: session.id,
        ownerId: "connector-worker-storage",
        leaseToken: session.leaseToken,
        state: "disconnected",
        metadata: { reason: "test complete" }
      })
    ).resolves.toMatchObject({
      id: session.id,
      state: "disconnected",
      finishedAt: expect.any(Number)
    })
    await expect(
      client.revokeConnectorCredential({ credentialId: credential.id })
    ).resolves.toMatchObject({
      id: credential.id,
      state: "revoked",
      revokedAt: expect.any(Number)
    })

    await expect(
      client.updateConnectorRegistrationState({
        connectorId: "connector.telegram",
        state: "disabled"
      })
    ).resolves.toMatchObject({
      state: "disabled",
      disabledAt: expect.any(Number)
    })

    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "fetch-url",
        principalId: "principal_channel_storage",
        payload: { url: "https://example.com" },
        requiredCapability: "network.fetch"
      })
    ).rejects.toThrow(/capability not declared/)

    await expect(
      client.updatePluginManifestState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        state: "disabled"
      })
    ).resolves.toMatchObject({
      state: "disabled",
      disabledAt: expect.any(Number)
    })
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver"
      })
    ).rejects.toThrow(/disabled/)
  })

  it("persists channel bindings, inbound events, and delivery jobs", async () => {
    const client = await createClient()
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver"
    ])

    const binding = await client.putChannelBinding({
      id: "bind_storage_telegram_user",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      displayName: "Ada",
      metadata: { locale: "en" },
      idempotencyKey: "storage-channel-binding"
    })
    expect(binding).toMatchObject({
      id: "bind_storage_telegram_user",
      state: "active",
      principalId: "principal_storage_user"
    })

    const duplicateBinding = await client.putChannelBinding({
      id: "ignored_binding",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      idempotencyKey: "storage-channel-binding"
    })
    expect(duplicateBinding.id).toBe(binding.id)

    await expect(
      client.listChannelBindings({
        connectorId: "connector.telegram",
        channelKind: "telegram",
        channelId: "bot-main",
        state: "active"
      })
    ).resolves.toMatchObject([{ id: binding.id }])

    const inbound = await client.ingestChannelInboundEvent({
      id: "chin_storage_telegram_1",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "telegram-update-storage-1",
      externalThreadId: "telegram-chat-storage",
      senderExternalIdentityId: "tg_user_storage",
      payload: { message: { text: "hello" } },
      metadata: { transport: "polling" },
      receivedAt: 10,
      idempotencyKey: "telegram-update-storage-1"
    })
    expect(inbound).toMatchObject({
      id: "chin_storage_telegram_1",
      state: "received",
      principalId: "principal_storage_user"
    })

    const duplicateInbound = await client.ingestChannelInboundEvent({
      id: "ignored_inbound",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "telegram-update-storage-1",
      senderExternalIdentityId: "tg_user_storage",
      payload: { message: { text: "hello" } },
      idempotencyKey: "telegram-update-storage-1"
    })
    expect(duplicateInbound.id).toBe(inbound.id)

    await expect(
      client.updateChannelInboundEventState({
        eventId: inbound.id,
        state: "projected",
        metadata: { projectedTo: "team.turn" }
      })
    ).resolves.toMatchObject({
      state: "projected",
      metadata: { projectedTo: "team.turn" }
    })

    const delivery = await client.submitChannelDelivery({
      id: "chdel_storage_telegram_1",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_user_storage",
      externalThreadId: "telegram-chat-storage",
      principalId: "principal_storage_user",
      payload: { text: "hi back" },
      metadata: { replyTo: "telegram-update-storage-1" },
      jobId: "job_storage_channel_delivery_1",
      idempotencyKey: "storage-channel-delivery-1",
      priority: 5,
      maxAttempts: 3
    })
    expect(delivery.delivery).toMatchObject({
      id: "chdel_storage_telegram_1",
      schedulerJobId: "job_storage_channel_delivery_1",
      state: "pending"
    })
    expect(delivery.job).toMatchObject({
      id: "job_storage_channel_delivery_1",
      kind: "channel.delivery",
      priority: 5
    })
    expect(delivery.job.payload).toMatchObject({
      deliveryId: "chdel_storage_telegram_1",
      connectorId: "connector.telegram",
      payload: { text: "hi back" }
    })

    const duplicateDelivery = await client.submitChannelDelivery({
      id: "ignored_delivery",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      payload: { text: "hi back" },
      jobId: "ignored_job",
      idempotencyKey: "storage-channel-delivery-1"
    })
    expect(duplicateDelivery.delivery.id).toBe(delivery.delivery.id)
    expect(duplicateDelivery.job.id).toBe(delivery.job.id)

    await expect(
      client.revokeChannelBinding({ bindingId: binding.id })
    ).resolves.toMatchObject({
      state: "revoked",
      revokedAt: expect.any(Number)
    })
  })

  it("acknowledges channel deliveries atomically with scheduler jobs", async () => {
    const client = await createClient()
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver"
    ])

    const success = await client.submitChannelDelivery({
      id: "chdel_storage_ack_success",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_storage_ack",
      principalId: "principal_storage_ack",
      payload: { text: "success" },
      jobId: "job_storage_ack_success",
      idempotencyKey: "storage-ack-success"
    })
    const claimed = await client.claimJob({
      workerId: "storage_connector_success",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    expect(claimed?.id).toBe(success.job.id)
    const ack = await client.completeChannelDelivery({
      deliveryId: success.delivery.id,
      workerId: "storage_connector_success",
      leaseToken: claimed?.leaseToken ?? "",
      result: { externalMessageId: "telegram-storage-message-1" },
      metadata: { transport: "sendMessage" }
    })
    expect(ack?.delivery).toMatchObject({
      id: success.delivery.id,
      state: "sent",
      metadata: { transport: "sendMessage" }
    })
    expect(ack?.job).toMatchObject({
      id: success.job.id,
      state: "succeeded",
      result: { externalMessageId: "telegram-storage-message-1" }
    })

    const retryable = await client.submitChannelDelivery({
      id: "chdel_storage_ack_retry",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      principalId: "principal_storage_ack",
      payload: { text: "retry" },
      jobId: "job_storage_ack_retry",
      idempotencyKey: "storage-ack-retry",
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 0,
        maxDelayMs: 0
      }
    })
    const retryClaim = await client.claimJob({
      workerId: "storage_connector_retry",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    expect(retryClaim?.id).toBe(retryable.job.id)
    const retryAck = await client.failChannelDelivery({
      deliveryId: retryable.delivery.id,
      workerId: "storage_connector_retry",
      leaseToken: retryClaim?.leaseToken ?? "",
      error: { type: "network", message: "timeout" },
      metadata: { attempt: 1 }
    })
    expect(retryAck?.delivery).toMatchObject({
      id: retryable.delivery.id,
      state: "pending",
      metadata: { attempt: 1 }
    })
    expect(retryAck?.job).toMatchObject({
      id: retryable.job.id,
      state: "retry_scheduled"
    })

    const terminalClaim = await client.claimJob({
      workerId: "storage_connector_terminal",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    expect(terminalClaim?.id).toBe(retryable.job.id)
    const terminalAck = await client.failChannelDelivery({
      deliveryId: retryable.delivery.id,
      workerId: "storage_connector_terminal",
      leaseToken: terminalClaim?.leaseToken ?? "",
      error: { type: "platform", message: "blocked" },
      metadata: { attempt: 2 }
    })
    expect(terminalAck?.delivery).toMatchObject({
      id: retryable.delivery.id,
      state: "failed",
      finishedAt: expect.any(Number)
    })
    expect(terminalAck?.job).toMatchObject({
      id: retryable.job.id,
      state: "failed"
    })

    const stale = await client.submitChannelDelivery({
      id: "chdel_storage_ack_stale",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      principalId: "principal_storage_ack",
      payload: { text: "stale" },
      jobId: "job_storage_ack_stale",
      idempotencyKey: "storage-ack-stale"
    })
    const staleClaim = await client.claimJob({
      workerId: "storage_connector_stale",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    expect(staleClaim?.id).toBe(stale.job.id)
    await expect(
      client.completeChannelDelivery({
        deliveryId: stale.delivery.id,
        workerId: "storage_connector_stale",
        leaseToken: "wrong_lease",
        result: { externalMessageId: "should-not-commit" }
      })
    ).resolves.toBeNull()
  })

  it("projects channel inbound events into runtime primitives", async () => {
    const client = await createClient()
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver"
    ])
    await client.createSession({
      id: "ses_storage_projection",
      title: "Storage Projection",
      kind: "chat"
    })
    const inbound = await client.ingestChannelInboundEvent({
      id: "chin_storage_projection_session",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "storage-projection-session-event",
      senderExternalIdentityId: "tg_storage_projection",
      principalId: "principal_storage_projection",
      payload: { message: { text: "run this" } },
      idempotencyKey: "storage-projection-session-event"
    })

    const projection = await client.projectChannelInboundEvent({
      id: "chproj_storage_session",
      inboundEventId: inbound.id,
      target: {
        kind: "session.turn",
        sessionId: "ses_storage_projection",
        principalId: "principal_storage_projection",
        inputId: "inp_storage_projection",
        turnId: "turn_storage_projection",
        jobId: "job_storage_projection",
        executionBinding: testTurnBinding("storage_projection"),
        content: [
          {
            type: "text",
            id: "part_storage_projection",
            text: "run this"
          }
        ],
        maxSteps: 2
      },
      metadata: { source: "storage-test" },
      idempotencyKey: "storage-projection-session-key"
    })
    expect(projection.projection).toMatchObject({
      id: "chproj_storage_session",
      inboundEventId: inbound.id,
      targetKind: "session.turn",
      targetId: "turn_storage_projection",
      targetJobId: "job_storage_projection",
      state: "projected"
    })
    expect(projection.job).toMatchObject({
      id: "job_storage_projection",
      kind: "session.turn"
    })

    const duplicate = await client.projectChannelInboundEvent({
      id: "ignored_projection",
      inboundEventId: inbound.id,
      target: {
        kind: "session.turn",
        sessionId: "ses_storage_projection",
        principalId: "principal_storage_projection",
        content: [{ type: "text", id: "ignored", text: "ignored" }],
        executionBinding: testTurnBinding("storage_projection_duplicate")
      },
      idempotencyKey: "storage-projection-session-key"
    })
    expect(duplicate.projection.id).toBe(projection.projection.id)
    expect(duplicate.job?.id).toBe("job_storage_projection")

    const ignoredInbound = await client.ingestChannelInboundEvent({
      id: "chin_storage_projection_ignored",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "storage-projection-ignored-event",
      senderExternalIdentityId: "tg_storage_projection",
      principalId: "principal_storage_projection",
      payload: { message: { text: "spam" } },
      idempotencyKey: "storage-projection-ignored-event"
    })
    const ignored = await client.projectChannelInboundEvent({
      id: "chproj_storage_ignored",
      inboundEventId: ignoredInbound.id,
      target: {
        kind: "ignored",
        reason: "spam"
      },
      metadata: { moderation: "drop" },
      idempotencyKey: "storage-projection-ignored-key"
    })
    expect(ignored.projection).toMatchObject({
      id: "chproj_storage_ignored",
      targetKind: "ignored",
      state: "ignored",
      metadata: { moderation: "drop" }
    })
    expect(ignored.job).toBeUndefined()

    await expect(
      client.listChannelProjections({ limit: 10 })
    ).resolves.toMatchObject([
      { id: "chproj_storage_session" },
      { id: "chproj_storage_ignored" }
    ])
  })
})

async function exerciseMediaGenerationTransport(
  client: CoreStore,
  label: string
): Promise<void> {
  const submitted = await client.submitMediaGenerationOperation({
    principalId: `media_${label}_user`,
    idempotencyKey: `media_${label}_key`,
    binding: testMediaGenerationBinding(label)
  })
  expect(submitted).toMatchObject({
    operation: {
      state: "queued",
      binding: { modelId: `fake-media-model-${label}` }
    },
    job: { kind: "media.generate", state: "ready" }
  })
  await expect(
    client.getMediaGenerationOperation({ operationId: submitted.operation.id })
  ).resolves.toMatchObject({
    id: submitted.operation.id,
    jobId: submitted.job.id
  })
  await expect(
    client.requestMediaGenerationCancel({
      operationId: submitted.operation.id,
      reason: `${label} transport cancellation`
    })
  ).resolves.toMatchObject({ state: "cancelled" })
}

async function createClient(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function registerStorageTestConnector(
  client: StorageTestStore,
  connectorId: string,
  capabilities: Array<
    "channel.connect" | "channel.receive" | "channel.deliver"
  >
): Promise<void> {
  await client.putPluginManifest({
    pluginId: `plugin.${connectorId}`,
    version: "1.0.0",
    name: `Test Connector ${connectorId}`,
    entry: { kind: "test" },
    capabilities,
    metadata: { test: true },
    idempotencyKey: `manifest:${connectorId}`
  })
  await client.putConnectorRegistration({
    connectorId,
    pluginId: `plugin.${connectorId}`,
    version: "1.0.0",
    metadata: { test: true },
    idempotencyKey: `connector:${connectorId}`
  })
}

async function startRemoteStorageFixture(
  storesByToken: Readonly<Record<string, string>>
): Promise<string> {
  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (request.method !== "POST") {
          response.writeHead(405)
          response.end()
          return
        }
        const token = parseBearerToken(request.headers.authorization)
        const storeDir = token === undefined ? undefined : storesByToken[token]
        if (storeDir === undefined) {
          response.writeHead(401)
          response.end(JSON.stringify({ ok: false }))
          return
        }
        const body = await readJsonRequestBody(request)
        const rpcRequest = extractRemoteStorageRequest(body)
        const transport = new OneShotSystemServiceStorageWireTransport({
          storeDir,
          serviceBin
        })
        const envelope = await transport.exchange(rpcRequest)
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify(envelope))
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json" })
        response.end(
          JSON.stringify({
            ok: false,
            error: {
              message: error instanceof Error ? error.message : String(error)
            }
          })
        )
      }
    })()
  })

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  return registerServerEndpoint(server)
}

async function startServer(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })
  return registerServerEndpoint(server)
}

function registerServerEndpoint(server: Server): string {
  servers.push(server)
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}/storage`
}

function parseBearerToken(header: string | undefined): string | undefined {
  const prefix = "Bearer "
  if (header === undefined || !header.startsWith(prefix)) {
    return undefined
  }
  return header.slice(prefix.length)
}

async function readJsonRequestBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

function extractRemoteStorageRequest(body: unknown): StorageRpcRequestEnvelope {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("remote storage body must be an object")
  }
  const record = body as { readonly request?: unknown }
  if (record.request === undefined) {
    throw new Error("remote storage body missing request")
  }
  return record.request as StorageRpcRequestEnvelope
}

function wireRequest(request: StorageRpcCommand): StorageRpcRequestEnvelope {
  return {
    storage_rpc_version: 1,
    request_id: "rpc_wire_test",
    request
  }
}

async function createFakeSystemServiceBin(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-fake-system-service-"))
  tempDirs.push(dir)
  const bin = join(dir, "fake-system-service.mjs")
  await writeFile(bin, `#!/usr/bin/env node\n${source}\n`, "utf8")
  await chmod(bin, 0o755)
  return bin
}
