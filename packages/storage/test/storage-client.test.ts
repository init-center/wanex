import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createRuntimeEvent,
  type BeginContextEpochRequest,
  type ContextEpochRecord,
  type JsonValue,
  type RuntimeEvent,
  type SchedulerJobRecord,
  type SessionMessageRecord,
} from "@wanex/protocol";
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
  type StorageTransport,
} from "../src/index.js";
import {
  createStorageTestStore,
  type StorageTestStore,
} from "../src/testing.js";

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
);
const expectedSchemaVersion = 20;

const tempDirs: string[] = [];
const servers: Server[] = [];

function testTurnBinding(label: string) {
  const endpoint = {
    id: "profile_" + label,
    connection: { id: "connection_" + label, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "model_" + label,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "storage.test." + label,
        revision: "1",
      },
    },
  } as const;
  const modelEndpoint = {
    endpointId: endpoint.id,
    endpointDigest: digestJson(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
  } as const;
  const binding = {
    createdAt: 1,
    modelEndpoint,
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [],
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1,
    },
  };
  return { digest: digestJson(binding), ...binding };
}

function testExecutionEnvironmentBinding(label: string) {
  const capabilities = {
    revision: 1 as const,
    isolation: { enforcement: "none" as const },
    filesystem: {
      enforcement: "library_guard" as const,
      effects: ["create", "read", "remove", "write"] as const,
    },
    process: {
      oneShot: true as const,
      managed: false,
      cleanup: "runtime_process_tree" as const,
    },
    pty: { supported: false },
    network: { enforcement: "none" as const },
    secretProjection: { supported: false },
    artifactExport: { supported: false },
  };
  const policy = {
    revision: 1 as const,
    filesystem: {
      roots: [{
        id: "workspace",
        effects: ["create", "read", "remove", "write"] as const,
      }],
      maxReadBytes: 50 * 1024 * 1024,
      maxDirectoryEntries: 100_000,
    },
    process: {
      oneShot: true,
      managed: false,
      cleanup: "runtime_process_tree" as const,
      environmentVariables: [],
    },
    network: "unrestricted" as const,
    isolation: "none" as const,
    pty: false,
  };
  return {
    revision: 1 as const,
    environmentId: `native_storage_${label}`,
    providerId: "wanex.execution.native",
    providerRevision: "1",
    capabilities,
    capabilityDigest: digestJson(capabilities),
    policy,
    policyDigest: digestJson(policy),
  };
}

function testMediaGenerationBinding(label: string) {
  const endpoint = {
    id: `media_profile_${label}`,
    connection: {
      id: `media_connection_${label}`,
      providerId: "fake-media-provider",
    },
    protocol: { id: "fake-media" },
    model: {
      id: `fake-media-model-${label}`,
      operations: ["image.generate"] as const,
      inputModalities: ["text"] as const,
      outputModalities: ["image"] as const,
      features: [],
      catalog: {
        source: "builtin" as const,
        catalogId: `storage.media.${label}`,
        revision: "1",
      },
    },
  };
  const request = {
    operation: "image.generate" as const,
    prompt: `media prompt ${label}`,
    outputModality: "image" as const,
    inputResources: [],
    options: null,
  };
  return {
    endpointId: endpoint.id,
    endpointDigest: digestJson(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    request,
    requestDigest: digestJson(request),
  };
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }
  return value;
}

beforeAll(async () => {
  // The test intentionally uses the real Rust binary. Build is handled by the
  // package test script so the client never talks to SQLite directly.
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("@wanex/storage", () => {
  it("runs media generation operation state through one-shot storage", async () => {
    const client = await createClient();
    const submitted = await client.submitMediaGenerationOperation({
      principalId: "media_storage_user",
      idempotencyKey: "media_storage_oneshot",
      binding: testMediaGenerationBinding("oneshot"),
    });
    const repeated = await client.submitMediaGenerationOperation({
      principalId: "media_storage_user",
      idempotencyKey: "media_storage_oneshot",
      binding: testMediaGenerationBinding("oneshot"),
    });
    expect(repeated.operation.id).toBe(submitted.operation.id);
    expect(repeated.job.id).toBe(submitted.job.id);
    expect(submitted.job.kind).toBe("media.generate");

    const claimed = await client.claimJob({
      workerId: "media_storage_worker",
      leaseMs: 60_000,
      kinds: ["media.generate"],
    });
    expect(claimed).not.toBeNull();
    const leaseToken = claimed!.leaseToken!;
    await expect(
      client.beginMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_worker",
        leaseToken,
      }),
    ).resolves.toMatchObject({
      action: "started",
      operation: { state: "submitting" },
    });
    await expect(
      client.acceptMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_worker",
        leaseToken,
        externalOperationId: "external-storage-operation",
        providerCheckpoint: { cursor: 1 },
      }),
    ).resolves.toMatchObject({
      state: "polling",
      externalOperationId: "external-storage-operation",
    });
    const suspended = await client.suspendMediaGenerationOperation({
      operationId: submitted.operation.id,
      workerId: "media_storage_worker",
      leaseToken,
      delayMs: 1_000,
      outcome: "pending",
      providerCheckpoint: { cursor: 2 },
      progress: { percent: 50 },
    });
    expect(suspended).toMatchObject({
      action: "suspended",
      operation: {
        state: "polling",
        pollCount: 1,
        consecutivePollFailures: 0,
        providerCheckpoint: { cursor: 2 },
        progress: { percent: 50 },
      },
      job: { state: "pending" },
    });
    expect(suspended?.job.leaseToken).toBeUndefined();
    await expect(
      client.requestMediaGenerationCancel({
        operationId: submitted.operation.id,
        reason: "storage test cancellation",
      }),
    ).resolves.toMatchObject({ state: "cancel_requested" });
    const cancellationClaim = await client.claimJob({
      workerId: "media_storage_cancel_worker",
      leaseMs: 60_000,
      kinds: ["media.generate"],
    });
    expect(cancellationClaim?.id).toBe(submitted.job.id);
    await expect(
      client.beginMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_cancel_worker",
        leaseToken: cancellationClaim!.leaseToken!,
      }),
    ).resolves.toMatchObject({ action: "cancel" });
    await expect(
      client.settleMediaGenerationOperation({
        operationId: submitted.operation.id,
        workerId: "media_storage_cancel_worker",
        leaseToken: cancellationClaim!.leaseToken!,
        pollOutcome: "none",
        outcome: "cancelled",
        reason: "storage test cancellation",
      }),
    ).resolves.toMatchObject({ state: "cancelled" });
    await expect(
      client.listMediaGenerationOperations({
        principalId: "media_storage_user",
      }),
    ).resolves.toMatchObject([
      { id: submitted.operation.id, state: "cancelled" },
    ]);
  });

  it("uses media generation operations over persistent storage", async () => {
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-media-persistent-"),
    );
    tempDirs.push(storeDir);
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin,
    });
    try {
      await exerciseMediaGenerationTransport(handle.core, "persistent");
    } finally {
      await handle.dispose();
    }
  });

  it("uses media generation operations over remote HTTP storage", async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-media-remote-"),
    );
    tempDirs.push(rootDir);
    const endpoint = await startRemoteStorageFixture({
      "media-token": join(rootDir, "media-store"),
    });
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "media-token",
    });
    try {
      await exerciseMediaGenerationTransport(handle.core, "remote");
    } finally {
      await handle.dispose();
    }
  });

  it("appends and queries events through the system-service process", async () => {
    const client = await createClient();
    const event = createRuntimeEvent({
      id: "evt_node_1",
      type: "session.input.admitted",
      scope: { sessionId: "ses_node_1", inputId: "inp_node_1" },
      payload: { text: "from node" },
      occurredAt: 10,
    });

    await client.appendEvent(event);
    const events = await client.queryEvents({
      scope: { sessionId: "ses_node_1" },
      limit: 10,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it("queries events with a stable occurredAt and eventId cursor", async () => {
    const client = await createClient();
    for (const id of ["evt_cursor_a", "evt_cursor_b", "evt_cursor_c"]) {
      await client.appendEvent(
        createRuntimeEvent({
          id,
          type: "cursor.event",
          scope: { sessionId: "ses_cursor_node" },
          payload: { id },
          occurredAt: 100,
        }),
      );
    }

    const first = await client.queryEvents({
      scope: { sessionId: "ses_cursor_node" },
      limit: 1,
    });
    expect(first.map((event) => event.id)).toEqual(["evt_cursor_a"]);

    const next = await client.queryEvents({
      scope: { sessionId: "ses_cursor_node" },
      after: {
        occurredAt: first[0]!.occurredAt,
        eventId: first[0]!.id,
      },
      limit: 10,
    });
    expect(next.map((event) => event.id)).toEqual([
      "evt_cursor_b",
      "evt_cursor_c",
    ]);
  });

  it("stores config and writes files through the system-service process", async () => {
    const client = await createClient();

    await client.putConfig("provider.default", { id: "deepseek" });
    await expect(client.getConfig("provider.default")).resolves.toEqual({
      id: "deepseek",
    });
    await client.applyConfigMutations({
      puts: [
        { key: "provider.first", value: { id: "openai" } },
        { key: "provider.second", value: { id: "anthropic" } },
      ],
      deletes: ["provider.default"],
    });
    await expect(client.getConfig("provider.first")).resolves.toEqual({
      id: "openai",
    });
    await expect(client.getConfig("provider.second")).resolves.toEqual({
      id: "anthropic",
    });
    await expect(client.getConfig("provider.default")).resolves.toBeNull();
    const firstEntry = await client.getConfigEntry("provider.first");
    expect(firstEntry).toMatchObject({
      key: "provider.first",
      value: { id: "openai" },
      revision: 1,
    });
    const claimed = await client.compareAndApplyConfigMutations({
      conditions: [
        { key: "provider.first", expectedRevision: firstEntry!.revision },
        { key: "provider.claim", expectedRevision: null },
      ],
      puts: [{ key: "provider.claim", value: { claimant: "oneshot" } }],
      deletes: [],
    });
    expect(claimed).toMatchObject({
      kind: "applied",
      entries: [{ key: "provider.claim", revision: 1 }],
    });
    await expect(
      client.compareAndApplyConfigMutations({
        conditions: [{ key: "provider.claim", expectedRevision: null }],
        puts: [{ key: "provider.claim", value: { claimant: "late" } }],
        deletes: [],
      }),
    ).resolves.toMatchObject({
      kind: "conflict",
      conflicts: [
        {
          key: "provider.claim",
          expectedRevision: null,
          current: { value: { claimant: "oneshot" }, revision: 1 },
        },
      ],
    });
    await expect(
      client.listConfigEntries({ prefix: "provider.", limit: 10 }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "provider.claim", revision: 1 }),
        expect.objectContaining({ key: "provider.first", revision: 1 }),
        expect.objectContaining({ key: "provider.second", revision: 1 }),
      ]),
    );
    await expect(
      client.hasLiveSecretReference("env://UNUSED_PROVIDER_KEY"),
    ).resolves.toBe(false);
    const configEvents = await client.queryEvents({
      limit: 10,
    });
    const configEvent = configEvents.find(
      (event) => event.type === "config.updated",
    );
    expect(configEvent?.payload).toMatchObject({
      key: "provider.default",
    });
    expect(JSON.stringify(configEvent?.payload)).not.toContain("deepseek");

    const file = await client.writeAtomicFile({
      logicalPath: "node/output.txt",
      content: new TextEncoder().encode("hello node"),
    });

    expect(file.logicalPath).toBe("node/output.txt");
    expect(file.sizeBytes).toBe(10);
    expect(file.resourceId.startsWith("res_")).toBe(true);
    await expect(
      readFile(join(client.storeDir, "files/node/output.txt"), "utf8"),
    ).resolves.toBe("hello node");

    const ticket = await client.createResourceTicket({
      principalId: "user_node",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 123,
    });
    expect(ticket.resourceId).toBe(file.resourceId);
  });

  it("cleans up expired resource tickets through the system-service process", async () => {
    const client = await createClient();
    const file = await client.writeAtomicFile({
      logicalPath: "node/cleanup.txt",
      content: new TextEncoder().encode("cleanup"),
    });
    const expired = await client.createResourceTicket({
      principalId: "user_expired",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 100,
    });
    await client.createResourceTicket({
      principalId: "user_future",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 1_000,
    });

    const receipt = await client.cleanupExpiredResourceTickets({
      nowMs: 500,
      limit: 10,
    });

    expect(receipt).toEqual({
      revokedCount: 1,
      revokedTicketIds: [expired.id],
      nowMs: 500,
    });
    await expect(
      client.cleanupExpiredResourceTickets({ nowMs: 500, limit: 10 }),
    ).resolves.toMatchObject({ revokedCount: 0 });

    const events = await client.queryEvents({ limit: 10 });
    expect(events.map((event) => event.type)).toContain(
      "resource.ticket.cleanup",
    );
  });

  it("ingests gets and lists rich resources through the system-service process", async () => {
    const client = await createClient();
    const content = new TextEncoder().encode("fake png from provider");

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
        providerFileId: "file_storage",
      },
      metadata: {
        prompt: "storage-client resource",
      },
      width: 640,
      height: 480,
    });

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
        providerFileId: "file_storage",
      },
      metadata: {
        prompt: "storage-client resource",
      },
      width: 640,
      height: 480,
    });
    await expect(
      readFile(
        join(client.storeDir, "files/resources/image/storage.png"),
        "utf8",
      ),
    ).resolves.toBe("fake png from provider");

    const fetched = await client.getResource({
      resourceId: "res_storage_image",
    });
    expect(fetched?.sha256).toBe(resource.sha256);
    expect(fetched?.source?.providerFileId).toBe("file_storage");

    const firstChunk = await client.readResourceContent({
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      offset: 0,
      limit: 5,
    });
    expect(new TextDecoder().decode(firstChunk?.content)).toBe("fake ");
    expect(firstChunk).toMatchObject({
      resourceId: resource.id,
      sha256: resource.sha256,
      totalSizeBytes: content.byteLength,
      offset: 0,
      eof: false,
    });
    const secondChunk = await client.readResourceContent({
      resourceId: resource.id,
      expectedSha256: resource.sha256,
      offset: firstChunk!.content.byteLength,
      limit: 1024,
    });
    expect(
      new TextDecoder().decode(
        Uint8Array.from([...firstChunk!.content, ...secondChunk!.content]),
      ),
    ).toBe("fake png from provider");
    expect(secondChunk?.eof).toBe(true);

    await expect(
      client.ingestResource({
        id: resource.id,
        logicalPath: resource.logicalPath,
        content: new TextEncoder().encode("replacement"),
        ...(resource.mediaType === undefined
          ? {}
          : { mediaType: resource.mediaType }),
        kind: resource.kind,
        origin: resource.origin,
      }),
    ).rejects.toThrow(/resource snapshots are immutable/);
    await expect(
      readFile(
        join(client.storeDir, "files/resources/image/storage.png"),
        "utf8",
      ),
    ).resolves.toBe("fake png from provider");

    const listed = await client.listResources({
      kind: "image",
      origin: "model_output",
      state: "available",
    });
    expect(listed.map((item) => item.id)).toContain("res_storage_image");

    const events = await client.queryEvents({ limit: 10 });
    const event = events.find((item) => item.type === "resource.ingested");
    expect(event?.scope.resourceId).toBe("res_storage_image");
    expect(JSON.stringify(event?.payload)).not.toContain(
      "fake png from provider",
    );
  });

  it("returns doctor status through the system-service process", async () => {
    const client = await createClient();
    const report = await client.doctor();

    expect(report.schemaVersion).toBe(expectedSchemaVersion);
    expect(
      report.checks.some((check) => check.name === "sqlite.quick_check"),
    ).toBe(true);
  });

  it("round-trips revision-fenced session lifecycle commands", async () => {
    const client = await createClient();
    const created = await client.createSession({
      id: "ses_storage_lifecycle",
      title: "Lifecycle",
      kind: "chat",
    });
    expect(created.revision).toBe(1);

    const renamed = await client.renameSession({
      sessionId: created.id,
      title: "Renamed lifecycle",
      expectedRevision: created.revision,
    });
    expect(renamed).toMatchObject({
      title: "Renamed lifecycle",
      status: "active",
      revision: 2,
    });
    await expect(
      client.renameSession({
        sessionId: created.id,
        title: "Stale",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const archived = await client.archiveSession({
      sessionId: created.id,
      expectedRevision: renamed.revision,
    });
    expect(archived).toMatchObject({ status: "archived", revision: 3 });
    expect(archived.archivedAt).toEqual(expect.any(Number));
    await expect(
      client.admitSessionInput({
        sessionId: created.id,
        principalId: "principal_storage_lifecycle",
        idempotencyKey: "storage:lifecycle:archived",
        content: [{ type: "text", id: "part_archived", text: "blocked" }],
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const restored = await client.restoreSession({
      sessionId: created.id,
      expectedRevision: archived.revision,
    });
    expect(restored).toMatchObject({ status: "active", revision: 4 });
    expect(restored.archivedAt).toBeUndefined();
  });

  it("round-trips scoped sessions and continues bounded session pages", async () => {
    const client = await createClient();
    const scope = {
      kind: "coding.repository",
      id: "repository_storage_page",
    } as const;
    for (const id of ["ses_storage_scope_a", "ses_storage_scope_b", "ses_storage_scope_c"]) {
      await client.createSession({ id, kind: "agent", scope });
    }
    await client.createSession({
      id: "ses_storage_scope_foreign",
      kind: "agent",
      scope: { kind: scope.kind, id: "repository_storage_foreign" },
    });

    const firstPage = await client.listSessions({ scope, limit: 2 });
    expect(firstPage).toHaveLength(2);
    expect(firstPage.every((session) => session.scope?.id === scope.id)).toBe(true);

    const last = firstPage.at(-1)!;
    const secondPage = await client.listSessions({
      scope,
      before: { updatedAt: last.updatedAt, sessionId: last.id },
      limit: 2,
    });
    expect(secondPage.every((session) => session.scope?.id === scope.id)).toBe(true);
    expect([...firstPage, ...secondPage].map((session) => session.id).sort()).toEqual([
      "ses_storage_scope_a",
      "ses_storage_scope_b",
      "ses_storage_scope_c",
    ]);
  });

  it("persists exact durable turns and canonical ordering through the process boundary", async () => {
    const client = await createClient();
    await client.createSession({
      id: "ses_storage_turn",
      title: "Storage turn",
      kind: "agent",
    });
    const first = await client.submitSessionTurn({
      id: "inp_storage_turn_a",
      turnId: "turn_storage_a",
      sessionId: "ses_storage_turn",
      principalId: "user_storage",
      idempotencyKey: "idem_storage_a",
      content: [
        {
          type: "text",
          id: "part_storage_a",
          text: "first",
        },
      ],
      jobId: "job_storage_a",
      executionBinding: testTurnBinding("storage_a"),
      maxSteps: 4,
    });
    const replayBinding = testTurnBinding("storage_a");
    const replayBindingWithNewAdmissionMetadata = {
      ...replayBinding,
      createdAt: 2,
    };
    const { digest: _oldDigest, ...replayBindingUnsigned } =
      replayBindingWithNewAdmissionMetadata;
    const replay = await client.submitSessionTurn({
      id: "inp_storage_turn_a",
      turnId: "turn_storage_a",
      sessionId: "ses_storage_turn",
      principalId: "user_storage",
      idempotencyKey: "idem_storage_a",
      content: [
        {
          type: "text",
          id: "part_storage_a",
          text: "first",
        },
      ],
      jobId: "job_storage_a",
      executionBinding: {
        ...replayBindingWithNewAdmissionMetadata,
        digest: digestJson(replayBindingUnsigned),
      },
      maxSteps: 4,
    });
    expect(replay.admission.inputId).toBe(first.admission.inputId);
    expect(replay.turn.id).toBe(first.turn.id);
    expect(replay.job.id).toBe(first.job.id);
    await expect(
      client.submitSessionTurn({
        id: "inp_storage_turn_a",
        turnId: "turn_storage_a",
        sessionId: "ses_storage_turn",
        principalId: "user_storage",
        idempotencyKey: "idem_storage_a",
        content: [
          {
            type: "text",
            id: "part_storage_a",
            text: "changed",
          },
        ],
        jobId: "job_storage_a",
        executionBinding: replayBinding,
        maxSteps: 4,
      }),
    ).rejects.toThrow();
    const second = await client.submitSessionTurn({
      id: "inp_storage_turn_b",
      turnId: "turn_storage_b",
      sessionId: "ses_storage_turn",
      principalId: "user_storage",
      idempotencyKey: "idem_storage_b",
      content: [
        {
          type: "text",
          id: "part_storage_b",
          text: "second",
        },
      ],
      jobId: "job_storage_b",
      executionBinding: testTurnBinding("storage_b"),
      maxSteps: 4,
    });
    await expect(
      client.listSessionMessages({ sessionId: "ses_storage_turn" }),
    ).resolves.toEqual([]);

    const firstJob = await client.claimJob({
      workerId: "worker_storage_a",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    expect(firstJob?.id).toBe(first.job.id);
    await expect(
      client.claimJob({
        workerId: "worker_storage_blocked",
        leaseMs: 60_000,
        kinds: ["session.turn"],
      }),
    ).resolves.toBeNull();
    const firstStarted = await client.startSessionTurnAttempt({
      sessionId: first.turn.sessionId,
      turnId: first.turn.id,
      inputId: first.admission.inputId,
      jobId: firstJob!.id,
      workerId: "worker_storage_a",
      leaseToken: firstJob!.leaseToken!,
    });
    const inputsWhileRunning = await client.listSessionInputs({
      sessionId: "ses_storage_turn",
    });
    expect(
      inputsWhileRunning.find((input) => input.id === second.admission.inputId)
        ?.status,
    ).toBe("admitted");
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
      requestDigest: "storage-turn-a-request",
    });

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
      assistantMessage: [
        {
          type: "text",
          id: "assistant_storage_a",
          text: "reply a",
        },
      ],
      providerState: [
        {
          providerId: "fake",
          modelId: "model_storage_a",
          stateKind: "opaque",
          replayPolicy: "optional",
          payload: { token: "a" },
        },
      ],
      result: { steps: 1 },
    });
    expect(firstSettled.job.state).toBe("succeeded");

    const secondJob = await client.claimJob({
      workerId: "worker_storage_b",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    expect(secondJob?.id).toBe(second.job.id);
    const secondStarted = await client.startSessionTurnAttempt({
      sessionId: second.turn.sessionId,
      turnId: second.turn.id,
      inputId: second.admission.inputId,
      jobId: secondJob!.id,
      workerId: "worker_storage_b",
      leaseToken: secondJob!.leaseToken!,
    });
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
      requestDigest: "storage-turn-b-request",
    });
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
      assistantMessage: [
        {
          type: "text",
          id: "assistant_storage_b",
          text: "reply b",
        },
      ],
    });

    const messages = await client.listSessionMessages({
      sessionId: "ses_storage_turn",
    });
    expect(
      messages.map((message) => [
        message.sequence,
        message.turnId,
        message.role,
      ]),
    ).toEqual([
      [1, "turn_storage_a", "user"],
      [2, "turn_storage_a", "assistant"],
      [3, "turn_storage_b", "user"],
      [4, "turn_storage_b", "assistant"],
    ]);
    expect(messages[1]?.providerState?.[0]?.payload).toEqual({ token: "a" });
    await expect(
      client.listSessionMessages({
        sessionId: "ses_storage_turn",
        limit: 2,
      }),
    ).resolves.toMatchObject([
      { sequence: 3, turnId: "turn_storage_b" },
      { sequence: 4, turnId: "turn_storage_b" },
    ]);
    await expect(
      client.listSessionMessages({
        sessionId: "ses_storage_turn",
        beforeSequence: 4,
        limit: 2,
      }),
    ).resolves.toMatchObject([
      { sequence: 2, turnId: "turn_storage_a" },
      { sequence: 3, turnId: "turn_storage_b" },
    ]);
    await expect(
      client.listSessionMessages({
        sessionId: "ses_storage_turn",
        turnIds: ["turn_storage_a"],
      }),
    ).resolves.toMatchObject([
      { sequence: 1, turnId: "turn_storage_a" },
      { sequence: 2, turnId: "turn_storage_a" },
    ]);
    await expect(
      client.listSessionTurns({
        sessionId: "ses_storage_turn",
        turnIds: ["turn_storage_b"],
      }),
    ).resolves.toMatchObject([{ id: "turn_storage_b" }]);
    await expect(client.getSessionTurn("turn_storage_b")).resolves.toMatchObject({
      id: "turn_storage_b",
      sessionId: "ses_storage_turn",
    });
    await expect(client.getSessionTurn("turn_storage_missing")).resolves.toBeNull();
    const newestTurnPage = await client.listSessionTurns({
      sessionId: "ses_storage_turn",
      limit: 1,
    });
    expect(newestTurnPage.map((turn) => turn.id)).toEqual(["turn_storage_b"]);
    await expect(
      client.listSessionTurns({
        sessionId: "ses_storage_turn",
        before: {
          createdAt: newestTurnPage[0]!.createdAt,
          turnId: newestTurnPage[0]!.id,
        },
        limit: 1,
      }),
    ).resolves.toMatchObject([{ id: "turn_storage_a" }]);
    await expect(
      client.listSessionTurns({ sessionId: "ses_storage_turn" }),
    ).resolves.toMatchObject([
      { id: "turn_storage_a" },
      { id: "turn_storage_b" },
    ]);
    await expect(
      client.listSessionInputs({
        sessionId: "ses_storage_turn",
        status: "completed",
        limit: 1,
      }),
    ).resolves.toMatchObject([
      { id: "inp_storage_turn_b", status: "completed" },
    ]);
  });

  it("rejects follow-up admission against a later queued turn", async () => {
    const client = await createClient();
    await client.createSession({ id: "ses_storage_follow_up", kind: "agent" });
    const parent = await client.submitSessionTurn({
      id: "inp_storage_follow_up_parent",
      turnId: "turn_storage_follow_up_parent",
      sessionId: "ses_storage_follow_up",
      principalId: "user_storage_follow_up",
      idempotencyKey: "idem_storage_follow_up_parent",
      content: [
        {
          type: "text",
          id: "part_storage_follow_up_parent",
          text: "parent",
        },
      ],
      jobId: "job_storage_follow_up_parent",
      executionBinding: testTurnBinding("storage_follow_up_parent"),
    });
    const accepted = await client.submitSessionTurn({
      id: "inp_storage_follow_up_child",
      turnId: "turn_storage_follow_up_child",
      sessionId: "ses_storage_follow_up",
      principalId: "user_storage_follow_up",
      idempotencyKey: "idem_storage_follow_up_child",
      content: [
        {
          type: "text",
          id: "part_storage_follow_up_child",
          text: "child",
        },
      ],
      origin: {
        kind: "interactive",
        sourceRef: "guided-follow-up",
        parentRef: parent.turn.id,
      },
      intent: "follow_up",
      runControlPolicy: "queue_after_current",
      expectedTurnId: parent.turn.id,
      jobId: "job_storage_follow_up_child",
      executionBinding: testTurnBinding("storage_follow_up_child"),
    });

    await expect(
      client.submitSessionTurn({
        id: "inp_storage_follow_up_stale",
        turnId: "turn_storage_follow_up_stale",
        sessionId: "ses_storage_follow_up",
        principalId: "user_storage_follow_up",
        idempotencyKey: "idem_storage_follow_up_stale",
        content: [
          {
            type: "text",
            id: "part_storage_follow_up_stale",
            text: "stale",
          },
        ],
        intent: "follow_up",
        runControlPolicy: "queue_after_current",
        expectedTurnId: accepted.turn.id,
        jobId: "job_storage_follow_up_stale",
        executionBinding: testTurnBinding("storage_follow_up_stale"),
      }),
    ).rejects.toBeInstanceOf(SystemServiceClientError);
    await expect(
      client.listSessionInputs({ sessionId: "ses_storage_follow_up" }),
    ).resolves.toHaveLength(2);
    await expect(
      client.listSessionTurns({ sessionId: "ses_storage_follow_up" }),
    ).resolves.toHaveLength(2);
  });

  it("persists turn controls and running cancellation without premature completion", async () => {
    const client = await createClient();
    await client.createSession({ id: "ses_storage_control", kind: "agent" });
    const submitted = await client.submitSessionTurn({
      id: "inp_storage_control",
      turnId: "turn_storage_control",
      sessionId: "ses_storage_control",
      principalId: "user_storage_control",
      idempotencyKey: "idem_storage_control",
      content: [
        {
          type: "text",
          id: "part_storage_control",
          text: "long task",
        },
      ],
      jobId: "job_storage_control",
      executionBinding: testTurnBinding("storage_control"),
    });
    const job = await client.claimJob({
      workerId: "worker_storage_control",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    const started = await client.startSessionTurnAttempt({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!,
    });

    await expect(
      client.steerSessionTurn({
        sessionId: submitted.turn.sessionId,
        principalId: "user_storage_control",
        expectedTurnId: submitted.turn.id,
        expectedAttemptId: "attempt_wrong",
        idempotencyKey: "steer_wrong",
        content: [
          {
            type: "text",
            id: "part_steer_wrong",
            text: "wrong",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(SystemServiceClientError);

    await client.steerSessionTurn({
      sessionId: submitted.turn.sessionId,
      principalId: "user_storage_control",
      expectedTurnId: submitted.turn.id,
      expectedAttemptId: started.attempt.id,
      idempotencyKey: "steer_valid",
      content: [
        {
          type: "text",
          id: "part_steer_valid",
          text: "focus tests",
        },
      ],
    });
    const [steer] = await client.listSessionTurnControls({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      kind: "steer",
      status: "pending",
    });
    const applied = await client.applySessionTurnControl({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      controlId: steer!.id,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!,
    });
    expect(applied?.effect).toBe("steer_promoted_input");

    const cancel = await client.requestSessionTurnCancel({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: submitted.job.id,
      reason: "cancel at safe point",
    });
    expect(cancel.status).toBe("cancel_requested");
    expect(cancel.turn?.state).toBe("cancel_requested");
    expect(cancel.job?.state).toBe("running");
    const controlEvents = await client.queryEvents({
      scope: { sessionId: submitted.turn.sessionId },
      limit: 20,
    });
    expect(controlEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "session.turn.steer_accepted",
        "session.turn.control_applied",
        "session.turn.cancel_requested",
      ]),
    );

    const settled = await client.settleSessionTurn({
      sessionId: submitted.turn.sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job!.id,
      workerId: "worker_storage_control",
      leaseToken: job!.leaseToken!,
      outcome: "cancelled",
      reason: "cancel at safe point",
    });
    expect(settled.turn.state).toBe("cancelled");
    expect(settled.job.state).toBe("cancelled");
  });

  it("atomically cancels queued turns and fails claimed unstarted turns", async () => {
    const client = await createClient();
    await client.createSession({ id: "ses_storage_queued", kind: "agent" });
    const cancelledTurn = await client.submitSessionTurn({
      id: "inp_storage_cancelled",
      turnId: "turn_storage_cancelled",
      sessionId: "ses_storage_queued",
      principalId: "user_storage_queued",
      idempotencyKey: "idem_storage_cancelled",
      content: [
        {
          type: "text",
          id: "part_storage_cancelled",
          text: "cancel",
        },
      ],
      jobId: "job_storage_cancelled",
      executionBinding: testTurnBinding("storage_cancelled"),
    });
    const cancelled = await client.requestSessionTurnCancel({
      sessionId: cancelledTurn.turn.sessionId,
      turnId: cancelledTurn.turn.id,
      inputId: cancelledTurn.admission.inputId,
      jobId: cancelledTurn.job.id,
      reason: "cancel before start",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.turn?.state).toBe("cancelled");
    expect(cancelled.job?.state).toBe("cancelled");

    const failedTurn = await client.submitSessionTurn({
      id: "inp_storage_failed",
      turnId: "turn_storage_failed",
      sessionId: "ses_storage_queued",
      principalId: "user_storage_queued",
      idempotencyKey: "idem_storage_failed",
      content: [
        {
          type: "text",
          id: "part_storage_failed",
          text: "fail before promotion",
        },
      ],
      jobId: "job_storage_failed",
      executionBinding: testTurnBinding("storage_failed"),
    });
    const claimed = await client.claimJob({
      workerId: "worker_storage_failed",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    const failedJob = await client.failJob({
      jobId: claimed!.id,
      workerId: "worker_storage_failed",
      leaseToken: claimed!.leaseToken!,
      error: { message: "invalid handler payload" },
    });
    expect(failedJob?.state).toBe("failed");
    const turns = await client.listSessionTurns({
      sessionId: failedTurn.turn.sessionId,
    });
    expect(turns.find((turn) => turn.id === failedTurn.turn.id)?.state).toBe(
      "failed",
    );
    const inputs = await client.listSessionInputs({
      sessionId: failedTurn.turn.sessionId,
    });
    expect(
      inputs.find((input) => input.id === failedTurn.admission.inputId)?.status,
    ).toBe("failed");
  });

  it("reserves commits releases and denies budget through the process boundary", async () => {
    const client = await createClient();
    const scope = {
      kind: "session" as const,
      ownerId: "ses_budget_node",
    };
    const limit = {
      tokens: 100,
      costMicros: 1_000,
      toolCalls: 4,
    };
    const first = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 60,
        costMicros: 200,
        toolCalls: 1,
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_1",
    });
    const duplicate = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 60,
        costMicros: 200,
        toolCalls: 1,
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_1",
    });
    expect(duplicate.id).toBe(first.id);

    await expect(
      client.reserveBudget({
        scope,
        limit,
        requested: {
          tokens: 50,
          costMicros: 100,
          toolCalls: 1,
        },
        principalId: "user_budget_node",
        reason: "agent.turn",
        idempotencyKey: "idem_budget_node_denied",
      }),
    ).rejects.toBeInstanceOf(SystemServiceClientError);

    await client.recordBudgetUsage({
      grantId: first.id,
      usage: {
        tokens: 55,
        costMicros: 180,
        toolCalls: 1,
      },
      source: "test",
      sourceId: "budget-node-test",
      idempotencyKey: "usage-budget-node-test",
    });
    await expect(
      client.commitBudget({ grantId: first.id }),
    ).resolves.toMatchObject({
      state: "committed",
    });

    const second = await client.reserveBudget({
      scope,
      limit,
      requested: {
        tokens: 40,
        costMicros: 100,
        toolCalls: 1,
      },
      principalId: "user_budget_node",
      reason: "agent.turn",
      idempotencyKey: "idem_budget_node_2",
    });
    await expect(
      client.releaseBudget({ grantId: second.id }),
    ).resolves.toMatchObject({
      state: "released",
    });
  });

  it("enqueues claims retries completes and lists scheduler jobs", async () => {
    const client = await createClient();
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
        maxDelayMs: 0,
      },
      idempotencyKey: "idem_job_node",
    });
    const duplicate = await client.enqueueJob({
      id: "job_node_duplicate",
      kind: "memory.compaction",
      principalId: "user_node",
      payload: { sessionId: "ignored" },
      idempotencyKey: "idem_job_node",
    });

    expect(duplicate.id).toBe(enqueued.id);
    const claim = await client.claimJob({
      workerId: "worker_node",
      leaseMs: 60_000,
      kinds: ["memory.compaction"],
    });
    expect(claim?.id).toBe(enqueued.id);
    expect(claim?.state).toBe("running");

    const retry = await client.failJob({
      jobId: claim!.id,
      workerId: "worker_node",
      leaseToken: claim!.leaseToken!,
      error: { type: "provider.timeout" },
    });
    expect(retry?.state).toBe("retry_scheduled");

    const second = await client.claimJob({
      workerId: "worker_node_2",
      leaseMs: 60_000,
    });
    expect(second?.attempt).toBe(2);
    const completed = await client.completeJob({
      jobId: second!.id,
      workerId: "worker_node_2",
      leaseToken: second!.leaseToken!,
      result: { ok: true },
    });
    expect(completed?.state).toBe("succeeded");
    expect(completed?.result).toEqual({ ok: true });
    expect(completed?.lastError).toBeUndefined();

    await expect(client.getJob({ jobId: enqueued.id })).resolves.toMatchObject({
      id: enqueued.id,
      state: "succeeded",
      result: { ok: true },
    });
    await expect(
      client.getJob({ jobId: "job_node_missing" }),
    ).resolves.toBeNull();

    const jobs = await client.listJobs({ state: "succeeded" });
    expect(jobs.map((job) => job.id)).toContain(enqueued.id);
  });

  it("enqueues claims and completes workspace.task jobs through the process boundary", async () => {
    const client = await createClient();
    const enqueued = await client.enqueueJob({
      id: "job_node_workspace_task",
      kind: "workspace.task",
      principalId: "user_node",
      payload: {
        handlerId: "handler.node",
        taskId: "wtsk_node",
        workspaceId: "workspace_node",
      },
    });

    expect(enqueued.kind).toBe("workspace.task");
    expect(enqueued.payload).toEqual({
      handlerId: "handler.node",
      taskId: "wtsk_node",
      workspaceId: "workspace_node",
    });

    const claim = await client.claimJob({
      workerId: "worker_node_workspace_task",
      leaseMs: 60_000,
      kinds: ["workspace.task"],
    });
    expect(claim?.id).toBe("job_node_workspace_task");
    expect(claim?.kind).toBe("workspace.task");
    expect(claim?.state).toBe("running");

    const completed = await client.completeJob({
      jobId: claim!.id,
      workerId: "worker_node_workspace_task",
      leaseToken: claim!.leaseToken!,
      result: {
        taskId: "wtsk_node",
        status: "succeeded",
        resourceIds: [],
      },
    });
    expect(completed?.state).toBe("succeeded");
    expect(completed?.result).toMatchObject({
      taskId: "wtsk_node",
      status: "succeeded",
    });

    await expect(
      client.listJobs({ kind: "workspace.task", state: "succeeded" }),
    ).resolves.toHaveLength(1);
  });

  it("reuses one persistent system-service process for multiple commands", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-persistent-"));
    tempDirs.push(storeDir);
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin,
    });
    const client = handle.core;
    try {
      const report = await client.doctor();
      expect(report.schemaVersion).toBe(expectedSchemaVersion);

      const session = await client.createSession({
        id: "ses_persistent",
        kind: "agent",
      });
      expect(session.id).toBe("ses_persistent");

      const events = await client.queryEvents({
        scope: { sessionId: "ses_persistent" },
        limit: 10,
      });
      expect(events.map((event) => event.type)).toContain("session.created");

      const created = await client.compareAndApplyConfigMutations({
        conditions: [{ key: "persistent.claim", expectedRevision: null }],
        puts: [{ key: "persistent.claim", value: { owner: "worker" } }],
        deletes: [],
      });
      expect(created).toMatchObject({
        kind: "applied",
        entries: [{ key: "persistent.claim", revision: 1 }],
      });
      await expect(
        client.getConfigEntry("persistent.claim"),
      ).resolves.toMatchObject({
        value: { owner: "worker" },
        revision: 1,
      });
    } finally {
      await handle.dispose();
    }
  });

  it("creates one-shot local storage clients through the factory", async () => {
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-factory-one-"),
    );
    tempDirs.push(storeDir);
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin,
    });
    const client = handle.core;

    const report = await client.doctor();
    expect(report.schemaVersion).toBe(expectedSchemaVersion);
    await client.appendEvent(
      createRuntimeEvent({
        id: "evt_factory_one",
        type: "factory.oneshot",
        scope: { sessionId: "ses_factory_one" },
        payload: { ok: true },
        occurredAt: 1,
      }),
    );
    await expect(
      client.queryEvents({ scope: { sessionId: "ses_factory_one" } }),
    ).resolves.toHaveLength(1);
    await handle.dispose();
  });

  it("creates persistent local storage clients through the factory", async () => {
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-factory-persistent-"),
    );
    tempDirs.push(storeDir);
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin,
    });
    const client = handle.core;
    try {
      const session = await client.createSession({
        id: "ses_factory_persistent",
        kind: "agent",
      });
      expect(session.id).toBe("ses_factory_persistent");
      await expect(
        client.queryEvents({ scope: { sessionId: "ses_factory_persistent" } }),
      ).resolves.toHaveLength(1);
    } finally {
      await handle.dispose();
    }
  });

  it("resolves local profile stores under an isolated profiles root", async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-profile-root-"),
    );
    tempDirs.push(rootDir);

    expect(resolveLocalStore({ rootDir, profileId: "work" })).toEqual({
      kind: "local-store",
      rootDir,
      profileId: "work",
      storeDir: join(rootDir, "profiles/work"),
    });
    expect(resolveLocalStore({ rootDir })).toEqual({
      kind: "local-store",
      rootDir,
      profileId: "default",
      storeDir: join(rootDir, "profiles/default"),
    });
  });

  it("rejects unsafe local profile ids", () => {
    for (const profileId of ["../x", "x/y", ".hidden", "-bad", "con", "nul"]) {
      expect(() => normalizeLocalStoreProfileId(profileId)).toThrow(
        "local store profile id",
      );
    }
  });

  it("creates isolated local profile stores through the factory", async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-profile-isolation-"),
    );
    tempDirs.push(rootDir);
    const workHandle = createStorageHandle({
      kind: "local-profile",
      mode: "oneshot",
      rootDir,
      profileId: "work",
      serviceBin,
    });
    const personalHandle = createStorageHandle({
      kind: "local-profile",
      mode: "oneshot",
      rootDir,
      profileId: "personal",
      serviceBin,
    });
    const work = workHandle.core;
    const personal = personalHandle.core;

    await work.putConfig("profile.marker", { profile: "work" });

    await expect(work.getConfig("profile.marker")).resolves.toEqual({
      profile: "work",
    });
    await expect(personal.getConfig("profile.marker")).resolves.toBeNull();
    await expect(work.doctor()).resolves.toMatchObject({
      storePath: join(rootDir, "profiles/work/state.db"),
    });
    await expect(personal.doctor()).resolves.toMatchObject({
      storePath: join(rootDir, "profiles/personal/state.db"),
    });
    await workHandle.dispose();
    await personalHandle.dispose();
  });

  it("uses remote HTTP transport with server-derived store resolution", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-remote-"));
    tempDirs.push(rootDir);
    const alphaStore = join(rootDir, "alpha");
    const betaStore = join(rootDir, "beta");
    const endpoint = await startRemoteStorageFixture({
      "token-alpha": alphaStore,
      "token-beta": betaStore,
    });

    const alphaHandle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "token-alpha",
    });
    const betaHandle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "token-beta",
    });
    const alpha = alphaHandle.core;
    const beta = betaHandle.core;

    await alpha.putConfig("profile.marker", { profile: "alpha" });

    await expect(alpha.getConfig("profile.marker")).resolves.toEqual({
      profile: "alpha",
    });
    await expect(beta.getConfig("profile.marker")).resolves.toBeNull();
    await expect(alpha.doctor()).resolves.toMatchObject({
      storePath: join(alphaStore, "state.db"),
    });
    await expect(beta.doctor()).resolves.toMatchObject({
      storePath: join(betaStore, "state.db"),
    });
    await alphaHandle.dispose();
    await betaHandle.dispose();
  });

  it("fails closed for unauthorized remote HTTP storage tokens", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "wanex-storage-remote-deny-"));
    tempDirs.push(rootDir);
    const endpoint = await startRemoteStorageFixture({
      "token-alpha": join(rootDir, "alpha"),
    });
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "unknown",
    });

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_status",
      message: "remote storage request failed with HTTP 401",
    } satisfies Partial<StorageTransportError>);
    await handle.dispose();
  });

  it("fails closed when remote HTTP storage returns invalid JSON", async () => {
    const server = createServer((_, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("not json");
    });
    const endpoint = await startServer(server);
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token",
    });

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_invalid_json",
      message: "remote storage returned invalid JSON",
    } satisfies Partial<StorageTransportError>);
    await handle.dispose();
  });

  it("times out stalled remote HTTP storage calls without leaking tokens", async () => {
    const server = createServer(() => {
      // Intentionally keep the request open until the client aborts it.
    });
    const endpoint = await startServer(server);
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token",
      timeoutMs: 25,
    });

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_timeout",
      message: "remote storage request timed out",
    } satisfies Partial<StorageTransportError>);
    await expect(handle.core.doctor()).rejects.not.toThrow("secret-token");
    await handle.dispose();
  });

  it("classifies remote HTTP network failures without leaking tokens", async () => {
    const endpoint = "http://127.0.0.1:1/storage";
    const handle = createStorageHandle({
      kind: "remote-http",
      endpoint,
      token: "secret-token",
      timeoutMs: 250,
    });

    await expect(handle.core.doctor()).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "remote_http_network",
      message: "remote storage network request failed",
    } satisfies Partial<StorageTransportError>);
    await expect(handle.core.doctor()).rejects.not.toThrow("secret-token");
    await handle.dispose();
  });

  it("does not let remote HTTP clients override the server-derived store", async () => {
    const rootDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-remote-override-"),
    );
    tempDirs.push(rootDir);
    const allowedStore = join(rootDir, "allowed");
    const forbiddenStore = join(rootDir, "forbidden");
    const endpoint = await startRemoteStorageFixture({
      token: allowedStore,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        storeDir: forbiddenStore,
        request: wireRequest({ command: "doctor" }),
      }),
    });
    const envelope = (await response.json()) as {
      readonly ok: boolean;
      readonly value?: {
        readonly store_path?: string;
      };
    };

    expect(response.ok).toBe(true);
    expect(envelope.ok).toBe(true);
    expect(envelope.value?.store_path).toBe(join(allowedStore, "state.db"));
    await expect(readFile(join(forbiddenStore, "state.db"))).rejects.toThrow();
  });

  it("uses an injected storage transport", async () => {
    const calls: unknown[] = [];
    const transport: StorageTransport = {
      async call(request) {
        calls.push(request);
        return {
          storage_rpc_version: 1,
          request_id: "injected",
          ok: true,
          value: {
            store_path: "/virtual/store/state.db",
            schema_version: 2,
            checks: [],
          },
        };
      },
    };
    const handle = createStorageHandleFromTransport(transport, {
      ownership: "borrowed",
    });

    await expect(handle.core.doctor()).resolves.toMatchObject({
      storePath: "/virtual/store/state.db",
      schemaVersion: 2,
    });
    expect(calls).toEqual([{ command: "doctor" }]);
  });

  it("retries transient sqlite lock envelopes at the storage boundary", async () => {
    const calls: unknown[] = [];
    const transport: StorageTransport = {
      async call(request) {
        calls.push(request);
        if (calls.length < 3) {
          return {
            storage_rpc_version: 1,
            request_id: "retry",
            ok: false,
            error: {
              code: "sqlite",
              message: "sqlite error: database is locked",
            },
          };
        }
        return {
          storage_rpc_version: 1,
          request_id: "retry",
          ok: true,
          value: {
            store_path: "/virtual/store/state.db",
            schema_version: expectedSchemaVersion,
            checks: [],
          },
        };
      },
    };
    const client = createCoreStore(transport);

    await expect(client.doctor()).resolves.toMatchObject({
      storePath: "/virtual/store/state.db",
      schemaVersion: expectedSchemaVersion,
    });
    expect(calls).toEqual([
      { command: "doctor" },
      { command: "doctor" },
      { command: "doctor" },
    ]);
  });

  it("does not retry non-transient sqlite envelopes", async () => {
    let calls = 0;
    const transport: StorageTransport = {
      async call() {
        calls += 1;
        return {
          storage_rpc_version: 1,
          request_id: "non-transient",
          ok: false,
          error: {
            code: "sqlite",
            message: "sqlite error: UNIQUE constraint failed",
          },
        };
      },
    };
    const client = createCoreStore(transport);

    await expect(client.doctor()).rejects.toMatchObject({
      name: "SystemServiceClientError",
      code: "sqlite",
    } satisfies Partial<SystemServiceClientError>);
    expect(calls).toBe(1);
  });

  it("classifies one-shot local transport spawn and invalid JSON failures", async () => {
    const invalidJsonService = await createFakeSystemServiceCommand(`
const input = await new Promise((resolve) => {
  let data = ""
  process.stdin.on("data", (chunk) => data += chunk)
  process.stdin.on("end", () => resolve(data))
})
void input
process.stdout.write("not json")
`);
    const invalidJsonTransport = new OneShotSystemServiceStorageWireTransport({
      storeDir: "/unused",
      ...invalidJsonService,
    });

    await expect(
      invalidJsonTransport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_oneshot_invalid_json",
    } satisfies Partial<StorageTransportError>);

    const missingTransport = new OneShotSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin: join(tmpdir(), "wanex-missing-system-service"),
    });
    await expect(
      missingTransport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_oneshot_spawn",
    } satisfies Partial<StorageTransportError>);
  });

  it("classifies persistent local malformed stdout and recovers on the next call", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
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
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-invalid-"),
    );
    tempDirs.push(storeDir);
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      restartBackoffMs: 0,
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_invalid_json",
    } satisfies Partial<StorageTransportError>);
    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        schema_version: 1,
      },
    });
    await transport.close();
  });

  it("classifies unexpected persistent local process close and recovers with bounded backoff", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
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
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-close-"),
    );
    tempDirs.push(storeDir);
    const sleeps: number[] = [];
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      restartBackoffMs: 7,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_closed",
    } satisfies Partial<StorageTransportError>);
    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        schema_version: 1,
      },
    });
    expect(sleeps).toEqual([7]);
    await transport.close();
  });

  it("preserves a structured startup failure without an unhandled stdin error", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
process.stdout.write(JSON.stringify({
  ok: false,
  request_id: null,
  storage_rpc_version: 1,
  error: {
    code: "invariant",
    message: "unsupported pre-release store schema; recreate the store"
  }
}) + "\\n")
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-startup-error-"),
    );
    tempDirs.push(storeDir);
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      restartBackoffMs: 0,
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      message: expect.stringContaining("unsupported pre-release store schema"),
    });
    await transport.close();
  });

  it("classifies persistent local spawn failures", async () => {
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir: "/unused",
      serviceBin: join(tmpdir(), "wanex-missing-persistent-system-service"),
      restartBackoffMs: 0,
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "local_persistent_spawn",
    } satisfies Partial<StorageTransportError>);
  });

  it("closes pending persistent calls and never restarts after close", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
process.stdin.resume()
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-dispose-"),
    );
    tempDirs.push(storeDir);
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      restartBackoffMs: 0,
    });

    const pending = transport.exchange(wireRequest({ command: "doctor" }));
    const pendingRejection = expect(pending).rejects.toMatchObject({
      code: "local_persistent_transport_closed",
    } satisfies Partial<StorageTransportError>);
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBe(1));
    await transport.close();

    await pendingRejection;
    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      code: "local_persistent_transport_closed",
    } satisfies Partial<StorageTransportError>);
    expect(transport.connectionEpoch()).toBeNull();
  });

  it("times out an unresponsive persistent request and cleans its child", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
process.stdin.resume()
setInterval(() => {}, 1000)
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-timeout-"),
    );
    tempDirs.push(storeDir);
    let terminations = 0;
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      requestTimeoutMs: 20,
      cleanupTimeoutMs: 500,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child }) {
          terminations += 1;
          child.kill("SIGKILL");
        },
      },
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      code: "local_persistent_request_timeout",
    } satisfies Partial<StorageTransportError>);
    await vi.waitFor(() => expect(terminations).toBe(1));
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBeNull());
    await transport.close();
  });

  it("uses one injected Windows tree cleanup for concurrent close calls", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
process.stdin.resume()
process.stdin.on("end", () => {})
setInterval(() => {}, 1000)
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-win-close-"),
    );
    tempDirs.push(storeDir);
    const platforms: NodeJS.Platform[] = [];
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      platform: "win32",
      requestTimeoutMs: 5_000,
      shutdownGraceMs: 20,
      cleanupTimeoutMs: 500,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child, platform }) {
          platforms.push(platform);
          child.kill("SIGKILL");
        },
      },
    });

    const pending = transport.exchange(wireRequest({ command: "doctor" }));
    const rejected = expect(pending).rejects.toMatchObject({
      code: "local_persistent_transport_closed",
    } satisfies Partial<StorageTransportError>);
    await vi.waitFor(() => expect(transport.connectionEpoch()).toBe(1));
    await Promise.all([transport.close(), transport.close()]);

    await rejected;
    expect(platforms).toEqual(["win32"]);
    expect(transport.connectionEpoch()).toBeNull();
  });

  it("reports a bounded process-tree cleanup failure without an unhandled rejection", async () => {
    const fakeService = await createFakeSystemServiceCommand(`
process.stdin.resume()
setInterval(() => {}, 1000)
`);
    const storeDir = await mkdtemp(
      join(tmpdir(), "wanex-storage-persistent-cleanup-timeout-"),
    );
    tempDirs.push(storeDir);
    const transport = new PersistentSystemServiceStorageWireTransport({
      storeDir,
      ...fakeService,
      requestTimeoutMs: 20,
      cleanupTimeoutMs: 20,
      restartBackoffMs: 0,
      processTreeTerminator: {
        async terminate({ child }) {
          await new Promise((resolve) => setTimeout(resolve, 60));
          child.kill("SIGKILL");
        },
      },
    });

    await expect(
      transport.exchange(wireRequest({ command: "doctor" })),
    ).rejects.toMatchObject({
      code: "local_persistent_request_timeout",
    } satisfies Partial<StorageTransportError>);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await expect(transport.close()).rejects.toMatchObject({
      code: "local_persistent_cleanup_timeout",
    } satisfies Partial<StorageTransportError>);
  });

  it("rejects invalid persistent lifecycle deadlines", () => {
    expect(
      () =>
        new PersistentSystemServiceStorageWireTransport({
          storeDir: "/unused",
          serviceBin,
          requestTimeoutMs: 0,
        }),
    ).toThrow("requestTimeoutMs must be a positive integer");
    expect(
      () =>
        new PersistentSystemServiceStorageWireTransport({
          storeDir: "/unused",
          serviceBin,
          cleanupTimeoutMs: -1,
        }),
    ).toThrow("cleanupTimeoutMs must be a positive integer");
  });

  it("persists lease-fenced semantic context epochs through system-service", async () => {
    const client = await createClient();
    await seedStorageContextTurns(client, "ses_context_storage", 3);
    const canonicalBefore = await client.listSessionMessages({
      sessionId: "ses_context_storage",
    });
    const firstJob = await claimStorageContextJob(
      client,
      "job_context_storage_first",
      "worker_context_storage_first",
      "ses_context_storage",
    );
    const first = contextEpochRequest({
      id: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      job: firstJob,
      workerId: "worker_context_storage_first",
      messages: canonicalBefore,
      cutIndex: 1,
      digestSeed: "a",
    });
    const epoch = await client.beginContextEpoch(first);
    expect(epoch).toMatchObject({
      id: "ctxepoch_storage",
      sessionId: "ses_context_storage",
      jobId: firstJob.id,
      state: "building",
      generationState: "prepared",
      generationAttempt: 0,
      modelEndpoint: first.modelEndpoint,
    });
    await expect(
      client.markContextEpochDispatched({
        epochId: epoch.id,
        jobId: firstJob.id,
        workerId: "worker_context_storage_first",
        leaseToken: "stale",
      }),
    ).rejects.toThrow(/lease/);
    const dispatched = await client.markContextEpochDispatched({
      epochId: epoch.id,
      jobId: firstJob.id,
      workerId: "worker_context_storage_first",
      leaseToken: firstJob.leaseToken!,
    });
    await client.markContextEpochOutputObserved({
      epochId: epoch.id,
      jobId: firstJob.id,
      workerId: "worker_context_storage_first",
      leaseToken: firstJob.leaseToken!,
      generationAttempt: dispatched.generationAttempt,
    });
    const summary = "## Goal\nStorage semantic summary";
    const succeeded = await client.finishContextEpochGeneration({
      epochId: epoch.id,
      jobId: firstJob.id,
      workerId: "worker_context_storage_first",
      leaseToken: firstJob.leaseToken!,
      generationAttempt: dispatched.generationAttempt,
      outcome: "succeeded",
      summary,
      summaryDigest: createHash("sha256").update(summary).digest("hex"),
      usage: { inputTokens: 100, outputTokens: 20 },
      tokenEstimateAfter: 80,
      tokenSavings: 220,
    });
    expect(succeeded).toMatchObject({
      generationState: "succeeded",
      summary,
      usage: { inputTokens: 100, outputTokens: 20 },
      tokenEstimateAfter: 80,
      tokenSavings: 220,
    });
    const active = await client.activateContextEpoch({
      epochId: epoch.id,
      jobId: firstJob.id,
      workerId: "worker_context_storage_first",
      leaseToken: firstJob.leaseToken!,
    });
    expect(active.state).toBe("active");
    await expect(
      client.getActiveContextEpoch({ sessionId: "ses_context_storage" }),
    ).resolves.toMatchObject({ id: epoch.id, state: "active" });
    await expect(
      client.listSessionMessages({ sessionId: "ses_context_storage" }),
    ).resolves.toEqual(canonicalBefore);

    const failedJob = await claimStorageContextJob(
      client,
      "job_context_storage_failed",
      "worker_context_storage_failed",
      "ses_context_storage",
    );
    const failedRequest = contextEpochRequest({
      id: "ctxepoch_storage_failed",
      sessionId: "ses_context_storage",
      job: failedJob,
      workerId: "worker_context_storage_failed",
      messages: canonicalBefore,
      cutIndex: 3,
      previous: active,
      digestSeed: "b",
    });
    const failedPrepared = await client.beginContextEpoch(failedRequest);
    const failedDispatch = await client.markContextEpochDispatched({
      epochId: failedPrepared.id,
      jobId: failedJob.id,
      workerId: "worker_context_storage_failed",
      leaseToken: failedJob.leaseToken!,
    });
    const failed = await client.finishContextEpochGeneration({
      epochId: failedPrepared.id,
      jobId: failedJob.id,
      workerId: "worker_context_storage_failed",
      leaseToken: failedJob.leaseToken!,
      generationAttempt: failedDispatch.generationAttempt,
      outcome: "ambiguous",
      error: { category: "owner_loss" },
    });
    expect(failed).toMatchObject({
      state: "failed",
      generationState: "ambiguous",
      error: { category: "owner_loss" },
    });
    await expect(
      client.getActiveContextEpoch({
        sessionId: "ses_context_storage",
      }),
    ).resolves.toMatchObject({ id: active.id });

    const dryRun = await client.pruneContextEpochs({
      sessionId: "ses_context_storage",
      keepLastSuperseded: 0,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({
      sessionId: "ses_context_storage",
      scannedCount: 0,
      deletedEpochIds: [],
      dryRun: true,
    });
    const epochs = await client.listContextEpochs({
      sessionId: "ses_context_storage",
    });
    expect(epochs.map((item) => item.state).sort()).toEqual([
      "active",
      "failed",
    ]);
  });

  it("persists workspace changesets and operation receipts through system-service", async () => {
    const client = await createClient();
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
            targetText: "after\n",
          },
        ],
      },
    });

    expect(changeSet.currentState).toBe("submitted");
    expect(changeSet.changeSet.title).toBe("Storage workspace");

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
          },
        ],
        conflicts: [],
      },
    });

    expect(operation.status).toBe("applied");
    const fetched = await client.getWorkspaceChangeSet({
      changeSetId: changeSet.id,
    });
    expect(fetched?.currentState).toBe("applied");

    const listed = await client.listWorkspaceChangeSets({
      workspaceId: "workspace_storage",
      state: "applied",
    });
    expect(listed.map((record) => record.id)).toEqual([changeSet.id]);

    const operations = await client.listWorkspaceChangeOperations({
      changeSetId: changeSet.id,
    });
    expect(operations).toHaveLength(1);
    expect(operations[0]?.receipt.files[0]).toMatchObject({
      path: "file.txt",
      afterText: "after\n",
    });
  });

  it("persists workspace change proposal review operations through system-service", async () => {
    const client = await createClient();
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
            targetText: "proposal\n",
          },
        ],
      },
    });

    const proposal = await client.putWorkspaceChangeProposal({
      id: "wcp_storage",
      workspaceId: "workspace_proposal_storage",
      principalId: "agent_proposal_storage",
      changeSetId: changeSet.id,
      title: "Review storage proposal",
      summary: "Needs review",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "proposal-storage-key",
    });
    const duplicate = await client.putWorkspaceChangeProposal({
      workspaceId: "workspace_proposal_storage",
      principalId: "agent_proposal_storage",
      changeSetId: changeSet.id,
      title: "Review storage proposal",
      summary: "Needs review",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "proposal-storage-key",
    });

    expect(duplicate.id).toBe(proposal.id);
    expect(proposal.state).toBe("open");

    const approval = await client.recordWorkspaceChangeProposalOperation({
      id: "wcpo_storage_approve",
      proposalId: proposal.id,
      operation: "approve",
      actorId: "user_storage",
      reason: "approved in storage test",
    });
    expect(approval).toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved",
    });

    const requestApply = await client.recordWorkspaceChangeProposalOperation({
      id: "wcpo_storage_apply",
      proposalId: proposal.id,
      operation: "request_apply",
      actorId: "user_storage",
      metadata: { target: "workspace" },
    });
    expect(requestApply).toMatchObject({
      operation: "request_apply",
      fromState: "approved",
      toState: "apply_requested",
    });

    await expect(
      client.getWorkspaceChangeProposal({ proposalId: proposal.id }),
    ).resolves.toMatchObject({
      id: proposal.id,
      state: "apply_requested",
      metadata: { source: "storage-client-test" },
    });
    await expect(
      client.listWorkspaceChangeProposals({
        workspaceId: "workspace_proposal_storage",
        state: "apply_requested",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      client.listWorkspaceChangeProposalOperations({
        proposalId: proposal.id,
      }),
    ).resolves.toHaveLength(2);

    const token = "storage-claim-token-abcdefghijklmnopqrstuvwxyz";
    const claim = await client.claimWorkspaceChangeProposalApply({
      proposalId: proposal.id,
      attemptId: "wcpa_storage_claim",
      ownerId: "host_storage_claim",
      claimToken: token,
      leaseMs: 60_000,
      metadata: { source: "storage-client-test" },
    });
    expect(claim).toMatchObject({
      status: "claimed",
      proposal: { state: "applying" },
      attempt: {
        id: "wcpa_storage_claim",
        state: "active",
        metadata: { source: "storage-client-test" },
      },
    });
    await expect(
      client.claimWorkspaceChangeProposalApply({
        proposalId: proposal.id,
        attemptId: "wcpa_storage_loser",
        ownerId: "host_storage_loser",
        claimToken: "storage-loser-token-abcdefghijklmnopqrstuvwxyz",
        leaseMs: 60_000,
      }),
    ).resolves.toMatchObject({
      status: "busy",
      proposal: { state: "applying" },
    });
    await expect(
      client.renewWorkspaceChangeProposalApply({
        proposalId: proposal.id,
        attemptId: "wcpa_storage_claim",
        claimToken: "storage-wrong-token-abcdefghijklmnopqrstuvwxyz",
        leaseMs: 60_000,
      }),
    ).rejects.toThrow(/claim token is invalid/);
    await expect(
      client.renewWorkspaceChangeProposalApply({
        proposalId: proposal.id,
        attemptId: "wcpa_storage_claim",
        claimToken: token,
        leaseMs: 60_000,
      }),
    ).resolves.toMatchObject({ state: "active" });
    const applyOperation = await client.recordWorkspaceChangeOperation({
      id: "wop_storage_claim",
      changeSetId: changeSet.id,
      operation: "apply",
      receipt: {
        changeSetId: changeSet.id,
        status: "applied",
        files: [],
        conflicts: [],
      },
    });
    await expect(
      client.settleWorkspaceChangeProposalApply({
        proposalId: proposal.id,
        attemptId: "wcpa_storage_claim",
        claimToken: token,
        outcome: "applied",
        workspaceOperationId: applyOperation.id,
      }),
    ).resolves.toMatchObject({
      proposal: { state: "applied" },
      attempt: { state: "applied" },
    });
    await expect(
      client.listWorkspaceChangeProposalApplyAttempts({
        proposalId: proposal.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "wcpa_storage_claim",
        state: "applied",
      }),
    ]);
  });

  it("persists and atomically finalizes workspace change transactions", async () => {
    const client = await createClient();
    await client.putWorkspaceChangeSet({
      workspaceId: "workspace_transaction_storage",
      principalId: "agent_transaction_storage",
      changeSet: {
        id: "cs_storage_transaction",
        changes: [
          {
            path: "transaction.txt",
            kind: "update",
            baseText: "before\n",
            targetText: "after\n",
          },
        ],
      },
    });
    const claimToken = "storage-transaction-token-abcdefghijklmnopqrstuvwxyz";
    const claim = await client.beginWorkspaceChangeTransaction({
      id: "wtx_storage",
      workspaceId: "workspace_transaction_storage",
      changeSetId: "cs_storage_transaction",
      operation: "apply",
      sourceKind: "host",
      sourceId: "storage-test-host-request",
      idempotencyKey: "workspace-transaction:storage-test",
      rootIdentitySha256: "a".repeat(64),
      attemptId: "wtxa_storage",
      ownerId: "host_storage_transaction",
      claimToken,
      leaseMs: 60_000,
    });
    expect(claim).toMatchObject({
      status: "claimed",
      snapshot: {
        transaction: { id: "wtx_storage", state: "planning" },
        activeAttempt: { id: "wtxa_storage", kind: "execution" },
      },
    });
    expect(JSON.stringify(claim)).not.toContain(claimToken);

    const beforeText = "before\n";
    const afterText = "after\n";
    await client.recordWorkspaceChangeTransactionPlan({
      transactionId: "wtx_storage",
      attemptId: "wtxa_storage",
      claimToken,
      files: [
        {
          ordinal: 0,
          path: "transaction.txt",
          beforeText,
          beforeSha256: createHash("sha256").update(beforeText).digest("hex"),
          afterText,
          afterSha256: createHash("sha256").update(afterText).digest("hex"),
        },
      ],
    });
    await client.markWorkspaceChangeTransactionPrepared({
      transactionId: "wtx_storage",
      attemptId: "wtxa_storage",
      claimToken,
    });
    await client.beginWorkspaceChangeTransactionCommit({
      transactionId: "wtx_storage",
      attemptId: "wtxa_storage",
      claimToken,
    });
    await client.recordWorkspaceChangeTransactionFileCommitted({
      transactionId: "wtx_storage",
      attemptId: "wtxa_storage",
      claimToken,
      ordinal: 0,
    });
    const finalized = await client.finalizeWorkspaceChangeTransaction({
      transactionId: "wtx_storage",
      attemptId: "wtxa_storage",
      claimToken,
      outcome: "applied",
      operationId: "wop_storage_transaction",
      receipt: {
        changeSetId: "cs_storage_transaction",
        status: "applied",
        files: [],
        conflicts: [],
      },
    });
    expect(finalized).toMatchObject({
      snapshot: {
        transaction: {
          state: "applied",
          workspaceOperationId: "wop_storage_transaction",
        },
      },
      operation: { id: "wop_storage_transaction", status: "applied" },
    });
    await expect(
      client.getWorkspaceChangeTransaction({ transactionId: "wtx_storage" }),
    ).resolves.toMatchObject({ transaction: { state: "applied" } });
    await expect(
      client.listWorkspaceChangeTransactions({
        workspaceId: "workspace_transaction_storage",
        state: "applied",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      client.listWorkspaceChangeTransactionAttempts({
        transactionId: "wtx_storage",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "wtxa_storage", state: "completed" }),
    ]);
  });

  it("persists exact-fenced workspace task lifecycle and atomic proposal linkage", async () => {
    const client = await createClient();
    const claimToken = "storage-task-token-abcdefghijklmnopqrstuvwxyz123456";
    const identity = {
      runId: "wtsk_storage",
      attemptId: "wtat_storage",
      claimToken,
    };
    const claim = await client.beginWorkspaceTaskRun({
      id: identity.runId,
      workspaceId: "workspace_task_storage",
      principalId: "agent_task_storage",
      access: "writable",
      repositoryId: "repo_task_storage",
      isolationId: "wiso_task_storage",
      executionEnvironment: testExecutionEnvironmentBinding("task"),
      attemptId: identity.attemptId,
      ownerId: "host_task_storage",
      claimToken,
      leaseMs: 60_000,
    });
    expect(claim).toMatchObject({
      status: "claimed",
      snapshot: {
        run: {
          state: "preparing",
          resourceIds: [],
          executionEnvironment: testExecutionEnvironmentBinding("task"),
        },
        activeAttempt: { kind: "execution", state: "active" },
      },
    });
    expect(JSON.stringify(claim)).not.toContain(claimToken);

    const baseRevision = "c".repeat(40);
    await client.markWorkspaceTaskActive({
      ...identity,
      baseRevision,
      runtimeRef: "refs/heads/wanex/storage-task",
    });
    await client.beginWorkspaceTaskCollection({
      ...identity,
      executionOutcome: "completed",
      summary: "created storage task output",
      resourceIds: [],
    });
    const proposed = await client.finalizeWorkspaceTaskCollection({
      ...identity,
      outcome: "proposed",
      proposalId: "wcp_task_storage",
      changeSet: {
        id: "wcs_task_storage",
        baseRevision,
        changes: [
          {
            path: "src/storage-task.ts",
            kind: "create",
            targetText: "export const stored = true\n",
          },
        ],
      },
    });
    expect(proposed).toMatchObject({
      run: {
        state: "proposed",
        outcome: "proposed",
        changeSetId: "wcs_task_storage",
        proposalId: "wcp_task_storage",
      },
    });
    await client.beginWorkspaceTaskRelease(identity);
    const released = await client.finalizeWorkspaceTaskRelease(identity);
    expect(released).toMatchObject({
      run: { state: "released", outcome: "proposed" },
    });
    expect(released.activeAttempt).toBeUndefined();
    await expect(
      client.getWorkspaceTaskRun({ runId: identity.runId }),
    ).resolves.toMatchObject({ run: { state: "released" } });
    await expect(
      client.listWorkspaceTaskRuns({
        runIds: [identity.runId, "wtsk_storage_missing"],
        workspaceId: "workspace_task_storage",
        repositoryId: "repo_task_storage",
        state: "released",
      }),
    ).resolves.toHaveLength(1);
    await expect(
      client.listWorkspaceTaskRuns({ runIds: [] }),
    ).rejects.toThrow("runIds must contain 1 to 128 unique non-empty ids");
    await expect(
      client.listWorkspaceTaskRuns({
        runIds: [identity.runId],
        leaseExpiresBefore: Date.now(),
      }),
    ).rejects.toThrow("cannot be combined with recovery lease filtering");
    await expect(
      client.listWorkspaceTaskAttempts({ runId: identity.runId }),
    ).resolves.toEqual([
      expect.objectContaining({ id: identity.attemptId, state: "completed" }),
    ]);
  });

  it("claims a retained workspace task continuation through the storage RPC", async () => {
    const client = await createClient();
    const executionEnvironment = testExecutionEnvironmentBinding("continuation");
    const original = {
      runId: "wtsk_storage_continuation",
      attemptId: "wtat_storage_continuation_original",
      claimToken: "storage-continuation-original-token-abcdefghijklmnopqrstuvwxyz",
    };
    await client.beginWorkspaceTaskRun({
      id: original.runId,
      workspaceId: "workspace_storage_continuation",
      principalId: "agent_storage_continuation",
      access: "writable",
      repositoryId: "repo_storage_continuation",
      isolationId: "wiso_storage_continuation",
      executionEnvironment,
      attemptId: original.attemptId,
      ownerId: "host_storage_continuation_original",
      claimToken: original.claimToken,
      leaseMs: 60_000,
    });
    await client.markWorkspaceTaskActive({
      ...original,
      baseRevision: "e".repeat(40),
      runtimeRef: "refs/heads/wanex/storage-continuation",
    });
    await client.markWorkspaceTaskAttention({
      ...original,
      failure: {
        type: "workspace_task.recovery_required",
        message: "tool result was not observed",
      },
    });

    const continuation = {
      runId: original.runId,
      attemptId: "wtat_storage_continuation_new",
      ownerId: "host_storage_continuation",
      claimToken: "storage-continuation-new-token-abcdefghijklmnopqrstuvwxyz",
      leaseMs: 60_000,
      executionEnvironment,
    };
    await expect(client.claimWorkspaceTaskContinuation(continuation)).resolves.toMatchObject({
      status: "claimed",
      snapshot: {
        run: {
          state: "active",
          isolationId: "wiso_storage_continuation",
          baseRevision: "e".repeat(40),
          runtimeRef: "refs/heads/wanex/storage-continuation",
        },
        activeAttempt: { kind: "continuation", state: "active" },
      },
    });
    const continued = await client.getWorkspaceTaskRun({ runId: original.runId });
    expect(continued?.run.failure).toBeUndefined();
    expect(continued?.run.finishedAt).toBeUndefined();
    await expect(client.claimWorkspaceTaskContinuation(continuation)).resolves.toMatchObject({
      status: "claimed",
      snapshot: { activeAttempt: { id: continuation.attemptId } },
    });
    await expect(
      client.listWorkspaceTaskAttempts({ runId: original.runId }),
    ).resolves.toEqual([
      expect.objectContaining({ kind: "execution", state: "failed" }),
      expect.objectContaining({ kind: "continuation", state: "active" }),
    ]);
  });

  it("persists plan proposal lifecycle through system-service", async () => {
    const client = await createClient();
    await client.createSession({
      id: "ses_plan_storage",
      kind: "agent",
      title: "Plan source",
    });
    await client.putWorkspaceChangeSet({
      workspaceId: "workspace_plan_storage",
      principalId: "agent_plan_storage",
      changeSet: {
        id: "cs_plan_storage",
        changes: [
          {
            path: "plan-storage.txt",
            kind: "create",
            targetText: "plan\n",
          },
        ],
      },
    });
    await client.putWorkspaceChangeProposal({
      id: "wcp_plan_storage",
      workspaceId: "workspace_plan_storage",
      principalId: "agent_plan_storage",
      changeSetId: "cs_plan_storage",
      title: "Workspace dependency",
      summary: "Referenced by plan",
    });

    const generationOutput = [
      {
        id: "part_plan_storage_output",
        type: "text" as const,
        text: '{"title":"Plan storage"}',
      },
    ];
    const createRequest = {
      id: "planp_storage",
      principalId: "agent_plan_storage",
      source: {
        sessionId: "ses_plan_storage",
        headSequence: 0,
        analysisInputDigest: "a".repeat(64),
        planningRequest: [
          {
            id: "part_plan_storage_request",
            type: "text" as const,
            text: "Plan this change",
          },
        ],
      },
      generation: {
        endpointId: "profile_plan_storage",
        endpointDigest: "b".repeat(64),
        protocolId: "fake",
        providerId: "fake",
        modelId: "model_plan_storage",
        generatedAt: 1,
        outputDigest: digestJson(generationOutput),
        output: generationOutput,
      },
      title: "Plan storage",
      summary: "Durable plan proposal",
      steps: [
        { id: "step_1", title: "Inspect" },
        {
          id: "step_2",
          title: "Implement",
          detail: "storage boundary",
        },
      ],
      references: [
        {
          kind: "workspace_change_proposal" as const,
          id: "wcp_plan_storage",
          role: "related",
        },
      ],
      idempotencyKey: "plan-storage-key",
    };
    const proposal = await client.createPlanProposal(createRequest);
    const duplicate = await client.createPlanProposal(createRequest);

    expect(duplicate.id).toBe(proposal.id);
    expect(proposal).toMatchObject({
      id: "planp_storage",
      principalId: "agent_plan_storage",
      revision: 1,
      state: "open",
      source: { sessionId: "ses_plan_storage", headSequence: 0 },
    });
    expect(proposal.references.map((reference) => reference.id)).toEqual([
      "wcp_plan_storage",
    ]);

    await expect(
      client.recordPlanProposalOperation({
        id: "planop_storage_stale",
        proposalId: proposal.id,
        operation: "revise",
        expectedRevision: 99,
        actor: { kind: "human", id: "user_plan_storage" },
        content: {
          title: proposal.title,
          summary: proposal.summary,
          steps: proposal.steps,
          references: proposal.references,
        },
        idempotencyKey: "plan-storage-stale",
      }),
    ).rejects.toThrow("plan proposal revision changed");

    const revised = await client.recordPlanProposalOperation({
      id: "planop_storage_revise",
      proposalId: proposal.id,
      operation: "revise",
      expectedRevision: 1,
      actor: { kind: "human", id: "user_plan_storage" },
      content: {
        title: "Revised Plan storage",
        summary: "Human-reviewed durable plan proposal",
        steps: proposal.steps,
        references: proposal.references,
      },
      reason: "tighten plan",
      idempotencyKey: "plan-storage-revise",
    });
    expect(revised).toMatchObject({
      operation: "revise",
      fromRevision: 1,
      toRevision: 2,
      fromState: "open",
      toState: "open",
    });

    const approved = await client.recordPlanProposalOperation({
      id: "planop_storage_approve",
      proposalId: proposal.id,
      operation: "approve",
      expectedRevision: 2,
      actor: { kind: "human", id: "user_plan_storage" },
      reason: "approved in storage test",
      idempotencyKey: "plan-storage-approve",
    });
    expect(approved).toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved",
      fromRevision: 2,
      toRevision: 3,
    });

    const executionRequest = {
      proposalId: proposal.id,
      expectedRevision: 3,
      idempotencyKey: "plan-storage-execution",
      turn: {
        id: "inp_plan_storage",
        turnId: "turn_plan_storage",
        jobId: "job_plan_storage",
        sessionId: "ses_plan_storage",
        principalId: "agent_plan_storage",
        idempotencyKey: "plan-storage-turn",
        content: [
          {
            id: "part_plan_storage_execution",
            type: "text" as const,
            text: "Execute the approved plan",
          },
        ],
        origin: { kind: "plan", sourceRef: proposal.id },
        executionBinding: testTurnBinding("plan_storage"),
        maxSteps: 4,
      },
    };
    const executed = await client.executeApprovedPlan(executionRequest);
    const duplicateExecution =
      await client.executeApprovedPlan(executionRequest);
    expect(duplicateExecution).toEqual(executed);
    expect(executed).toMatchObject({
      proposal: {
        id: proposal.id,
        revision: 3,
        state: "approved",
        execution: {
          inputId: "inp_plan_storage",
          turnId: "turn_plan_storage",
          jobId: "job_plan_storage",
        },
      },
      submission: {
        turn: { id: "turn_plan_storage", state: "queued" },
        job: { id: "job_plan_storage", state: "ready" },
      },
    });

    await expect(
      client.getPlanProposal({ proposalId: proposal.id }),
    ).resolves.toMatchObject({
      id: proposal.id,
      revision: 3,
      state: "approved",
    });

    await expect(
      client.listPlanProposals({
        sourceSessionId: "ses_plan_storage",
        referenceKind: "workspace_change_proposal",
        referenceId: "wcp_plan_storage",
        state: "approved",
      }),
    ).resolves.toEqual([expect.objectContaining({ id: proposal.id })]);

    await expect(
      client.listPlanProposalOperations({ proposalId: proposal.id }),
    ).resolves.toEqual([
      expect.objectContaining({ operation: "revise" }),
      expect.objectContaining({ operation: "approve" }),
    ]);

    const events = await client.queryEvents({
      scope: { planProposalId: proposal.id },
      limit: 10,
    });
    expect(events.map((event) => event.type)).toEqual([
      "plan.proposal.created",
      "plan.proposal.operation_recorded",
      "plan.proposal.operation_recorded",
      "plan.proposal.execution_bound",
    ]);
    expect(
      events.every((event) => event.scope.planProposalId === proposal.id),
    ).toBe(true);
  });

  it("persists the durable objective lifecycle through system-service", async () => {
    const client = await createClient();
    await client.createSession({
      id: "ses_objective_storage",
      kind: "agent",
      title: "Objective source",
    });

    const createRequest = {
      id: "objective_storage",
      sessionId: "ses_objective_storage",
      principalId: "agent_objective_storage",
      objective: "Reduce login LCP below 2.5s",
      boundaries: ["packages/assistant-ui"],
      constraints: ["do not change public auth API"],
      successCriteria: [
        {
          id: "criterion_tests",
          description: "the verification suite passes",
        },
      ],
      verificationPolicy: {
        requirements: [
          {
            id: "requirement_tests",
            criterionIds: ["criterion_tests"],
            verifierKind: "script" as const,
            verifierRef: "storage-test-suite",
          },
        ],
      },
      stopPolicy: {
        maxAttempts: 3,
        maxConsecutiveBlockedAttempts: 2,
        budget: {
          tokens: 100,
          costMicros: 1_000,
        },
      },
      idempotencyKey: "objective-storage-key",
    };
    const objective = await client.createObjective(createRequest);
    await expect(client.createObjective(createRequest)).resolves.toEqual(
      objective,
    );
    expect(objective).toMatchObject({
      id: "objective_storage",
      sessionId: "ses_objective_storage",
      principalId: "agent_objective_storage",
      objective: "Reduce login LCP below 2.5s",
      state: "active",
      revision: 1,
      reason: { code: "created" },
      stopPolicy: {
        maxAttempts: 3,
        maxConsecutiveBlockedAttempts: 2,
        budget: { tokens: 100, costMicros: 1_000 },
      },
    });
    await expect(
      client.getObjective({ objectiveId: objective.id }),
    ).resolves.toEqual(objective);
    await expect(
      client.listObjectives({
        sessionId: "ses_objective_storage",
        states: ["active"],
      }),
    ).resolves.toEqual([objective]);

    const paused = await client.pauseObjective({
      objectiveId: objective.id,
      expectedRevision: 1,
      reason: "review direction",
      idempotencyKey: "objective-storage-pause",
    });
    expect(paused).toMatchObject({ state: "paused", revision: 2 });
    const resumed = await client.resumeObjective({
      objectiveId: objective.id,
      expectedRevision: 2,
      reason: "continue",
      idempotencyKey: "objective-storage-resume",
    });
    expect(resumed).toMatchObject({ state: "active", revision: 3 });

    const admissionRequest = {
      objectiveId: objective.id,
      expectedRevision: 3,
      trigger: "initial" as const,
      idempotencyKey: "objective-storage-admit",
      turn: {
        id: "inp_objective_storage",
        turnId: "turn_objective_storage",
        sessionId: "ses_objective_storage",
        principalId: "agent_objective_storage",
        idempotencyKey: "objective-storage-turn",
        content: [
          {
            type: "text" as const,
            id: "part_objective_storage",
            text: "Continue the objective",
          },
        ],
        origin: { kind: "objective", sourceRef: objective.id },
        jobId: "job_objective_storage",
        executionBinding: testTurnBinding("objective_storage"),
        maxSteps: 4,
      },
    };
    const admitted = await client.admitObjectiveAttempt(admissionRequest);
    expect(admitted.status).toBe("admitted");
    if (admitted.status !== "admitted")
      throw new Error("objective not admitted");
    await expect(
      client.admitObjectiveAttempt(admissionRequest),
    ).resolves.toEqual(admitted);
    expect(admitted.objective).toMatchObject({ revision: 4, state: "active" });
    expect(admitted.attempt).toMatchObject({
      objectiveId: objective.id,
      attemptNumber: 1,
      inputId: admitted.submission.admission.inputId,
      turnId: admitted.submission.turn.id,
      jobId: admitted.submission.job.id,
      trigger: "initial",
      budgetGrantId: expect.any(String),
    });
    await expect(
      client.listObjectiveAttempts({ objectiveId: objective.id }),
    ).resolves.toEqual([admitted.attempt]);

    const job = await client.claimJob({
      workerId: "worker_objective_storage",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    expect(job?.id).toBe(admitted.attempt.jobId);
    const started = await client.startSessionTurnAttempt({
      sessionId: admitted.submission.turn.sessionId,
      turnId: admitted.attempt.turnId,
      inputId: admitted.attempt.inputId,
      jobId: admitted.attempt.jobId,
      workerId: "worker_objective_storage",
      leaseToken: job!.leaseToken!,
    });
    const invocation = await client.beginProviderInvocation({
      sessionId: admitted.submission.turn.sessionId,
      turnId: admitted.attempt.turnId,
      attemptId: started.attempt.id,
      inputId: admitted.attempt.inputId,
      jobId: admitted.attempt.jobId,
      workerId: "worker_objective_storage",
      leaseToken: job!.leaseToken!,
      step: 1,
      invocationNumber: 1,
      requestDigest: "objective-storage-provider-request",
    });
    await client.settleSessionTurn({
      sessionId: admitted.submission.turn.sessionId,
      turnId: admitted.attempt.turnId,
      attemptId: started.attempt.id,
      inputId: admitted.attempt.inputId,
      jobId: admitted.attempt.jobId,
      workerId: "worker_objective_storage",
      leaseToken: job!.leaseToken!,
      outcome: "succeeded",
      providerInvocationId: invocation.id,
      assistantMessage: [
        {
          type: "text",
          id: "assistant_objective_storage",
          text: "Objective attempt complete",
        },
      ],
    });

    const reviewRequest = {
      id: "objectivereview_storage",
      objectiveId: objective.id,
      attemptId: admitted.attempt.id,
      expectedRevision: 4,
      disposition: "succeeded" as const,
      reason: "all checks passed",
      verifications: [
        {
          requirementId: "requirement_tests",
          verifierKind: "script" as const,
          verifierRef: "storage-test-suite",
          result: "passed" as const,
          evidence: [
            {
              kind: "runtime_projection" as const,
              referenceId: "storage-verification-output",
              digest: "a".repeat(64),
            },
          ],
        },
      ],
      idempotencyKey: "objective-storage-review",
    };
    const reviewed = await client.reviewObjectiveAttempt(reviewRequest);
    await expect(client.reviewObjectiveAttempt(reviewRequest)).resolves.toEqual(
      reviewed,
    );
    expect(reviewed.objective).toMatchObject({
      state: "succeeded",
      revision: 5,
      reason: { code: "verification_succeeded" },
      closedAt: expect.any(Number),
    });
    await expect(
      client.listObjectiveAttemptReviews({
        objectiveId: objective.id,
        attemptId: admitted.attempt.id,
      }),
    ).resolves.toEqual([reviewed.review]);
    await expect(
      client.listObjectiveVerifications({
        objectiveId: objective.id,
        attemptId: admitted.attempt.id,
        requirementId: "requirement_tests",
        result: "passed",
      }),
    ).resolves.toEqual(reviewed.verifications);

    const events = await client.queryEvents({
      scope: { objectiveId: objective.id },
      limit: 20,
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "objective.created",
        "objective.state_changed",
        "objective.attempt.admitted",
        "objective.verification.recorded",
        "objective.attempt.reviewed",
      ]),
    );
    expect(
      events.every((event) => event.scope.objectiveId === objective.id),
    ).toBe(true);
  });

  it("reconciles objective cancellation only after the running turn settles", async () => {
    const client = await createClient();
    await client.createSession({
      id: "ses_objective_cancel_storage",
      kind: "agent",
    });
    const objective = await client.createObjective({
      id: "objective_cancel_storage",
      sessionId: "ses_objective_cancel_storage",
      principalId: "agent_objective_storage",
      objective: "Cancel a running objective safely",
      successCriteria: [{ id: "done", description: "the task is done" }],
      verificationPolicy: {
        requirements: [
          {
            id: "verify_done",
            criterionIds: ["done"],
            verifierKind: "runtime",
            verifierRef: "storage-test",
          },
        ],
      },
      stopPolicy: { maxAttempts: 2, maxConsecutiveBlockedAttempts: 1 },
      idempotencyKey: "objective-cancel-storage-create",
    });
    const admitted = await client.admitObjectiveAttempt({
      objectiveId: objective.id,
      expectedRevision: 1,
      trigger: "initial",
      idempotencyKey: "objective-cancel-storage-admit",
      turn: {
        id: "inp_objective_cancel_storage",
        turnId: "turn_objective_cancel_storage",
        sessionId: "ses_objective_cancel_storage",
        principalId: "agent_objective_storage",
        idempotencyKey: "objective-cancel-storage-turn",
        content: [{ type: "text", id: "part_cancel_storage", text: "run" }],
        origin: { kind: "objective", sourceRef: objective.id },
        jobId: "job_objective_cancel_storage",
        executionBinding: testTurnBinding("objective_cancel_storage"),
      },
    });
    if (admitted.status !== "admitted")
      throw new Error("objective not admitted");
    const job = await client.claimJob({
      workerId: "worker_objective_cancel_storage",
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    const started = await client.startSessionTurnAttempt({
      sessionId: admitted.submission.turn.sessionId,
      turnId: admitted.attempt.turnId,
      inputId: admitted.attempt.inputId,
      jobId: admitted.attempt.jobId,
      workerId: "worker_objective_cancel_storage",
      leaseToken: job!.leaseToken!,
    });
    const requested = await client.requestObjectiveCancel({
      objectiveId: objective.id,
      expectedRevision: 2,
      reason: "user cancelled",
      idempotencyKey: "objective-cancel-storage-request",
    });
    expect(requested.objective).toMatchObject({
      state: "cancel_requested",
      revision: 3,
      activeAttemptId: admitted.attempt.id,
    });
    expect(requested.turnCancellation?.status).toBe("cancel_requested");
    await client.settleSessionTurn({
      sessionId: admitted.submission.turn.sessionId,
      turnId: admitted.attempt.turnId,
      attemptId: started.attempt.id,
      inputId: admitted.attempt.inputId,
      jobId: admitted.attempt.jobId,
      workerId: "worker_objective_cancel_storage",
      leaseToken: job!.leaseToken!,
      outcome: "cancelled",
      reason: "user cancelled",
    });
    await expect(
      client.reconcileObjectiveCancellation({
        objectiveId: objective.id,
        attemptId: admitted.attempt.id,
        expectedRevision: 3,
        idempotencyKey: "objective-cancel-storage-reconcile",
      }),
    ).resolves.toMatchObject({
      state: "cancelled",
      revision: 4,
      reason: { code: "cancelled" },
      closedAt: expect.any(Number),
    });
  });

  it("persists delegation graph topology through the system-service process", async () => {
    const client = await createClient();
    const graph = await client.putDelegationGraph({
      principalId: "controller_storage",
      title: "Storage delegation graph",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "delegation-storage-graph",
    });
    const duplicateGraph = await client.putDelegationGraph({
      id: "ignored_graph_id",
      principalId: "controller_storage",
      title: "Storage delegation graph",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "delegation-storage-graph",
    });
    expect(duplicateGraph.id).toBe(graph.id);
    expect(graph.state).toBe("open");

    const source = await client.putDelegationGraphNode({
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { prompt: "inspect storage runtime" },
      idempotencyKey: "delegation-storage-source",
    });
    const target = await client.putDelegationGraphNode({
      id: "node_storage_aggregate",
      graphId: graph.id,
      kind: "aggregation",
      principalId: "controller_storage",
      payload: { mode: "merge" },
      metadata: { lane: "summary" },
    });
    const duplicateSource = await client.putDelegationGraphNode({
      id: "ignored_node_id",
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { prompt: "inspect storage runtime" },
      idempotencyKey: "delegation-storage-source",
    });
    expect(duplicateSource.id).toBe(source.id);
    await expect(
      client.getDelegationGraphNode({ nodeId: source.id }),
    ).resolves.toMatchObject({
      id: source.id,
      graphId: graph.id,
      kind: "agent_task",
    });
    await expect(
      client.getDelegationGraphNode({ nodeId: "node_storage_missing" }),
    ).resolves.toBeNull();

    const dependency = await client.putDelegationGraphDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: target.id,
    });
    expect(dependency.kind).toBe("after_success");

    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 }),
    ).resolves.toMatchObject([{ id: source.id }]);

    await expect(
      client.attachDelegationGraphNodeJob({
        nodeId: source.id,
        schedulerJobId: "job_storage_source",
      }),
    ).resolves.toMatchObject({
      id: source.id,
      schedulerJobId: "job_storage_source",
    });

    await client.updateDelegationGraphState({
      graphId: graph.id,
      state: "running",
    });
    await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "running",
    });
    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 }),
    ).resolves.toEqual([]);

    const succeededSource = await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "succeeded",
      metadata: { result: "done" },
    });
    expect(succeededSource.finishedAt).toEqual(expect.any(Number));
    expect(succeededSource.metadata).toEqual({ result: "done" });

    await expect(
      client.listReadyDelegationGraphNodes({ graphId: graph.id, limit: 10 }),
    ).resolves.toMatchObject([{ id: target.id }]);
    await expect(
      client.listDelegationGraphs({
        principalId: "controller_storage",
        state: "running",
      }),
    ).resolves.toMatchObject([{ id: graph.id }]);
    await expect(
      client.listDelegationGraphNodes({
        graphId: graph.id,
        state: "succeeded",
      }),
    ).resolves.toMatchObject([{ id: source.id }]);
    await expect(
      client.listDelegationGraphDependencies({ graphId: graph.id }),
    ).resolves.toMatchObject([{ id: dependency.id }]);
    await expect(
      client.getDelegationGraph({ graphId: graph.id }),
    ).resolves.toMatchObject({
      id: graph.id,
      state: "running",
      metadata: { source: "storage-client-test" },
    });

    const closed = await client.updateDelegationGraphState({
      graphId: graph.id,
      state: "succeeded",
    });
    expect(closed.closedAt).toEqual(expect.any(Number));
  });

  it("materializes one ready delegation node into a scheduler job atomically", async () => {
    const client = await createClient();
    const graph = await client.putDelegationGraph({
      id: "graph_storage_materialize",
      principalId: "controller_storage",
    });
    const source = await client.putDelegationGraphNode({
      id: "node_storage_materialize_source",
      graphId: graph.id,
      kind: "agent_task",
      principalId: "agent_storage_a",
      payload: { handlerId: "handler.storage.materialize" },
    });
    const target = await client.putDelegationGraphNode({
      id: "node_storage_materialize_target",
      graphId: graph.id,
      kind: "workspace_task",
      principalId: "agent_storage_b",
      payload: { handlerId: "merge" },
    });
    await client.putDelegationGraphDependency({
      graphId: graph.id,
      fromNodeId: source.id,
      toNodeId: target.id,
    });

    const first = await client.materializeReadyDelegationGraphNode({
      graphId: graph.id,
      workerId: "orchestrator_storage",
      jobId: "job_storage_materialized_source",
      jobKind: "workspace.task",
      priority: 7,
    });
    expect(first?.node).toMatchObject({
      id: source.id,
      state: "running",
      schedulerJobId: "job_storage_materialized_source",
    });
    expect(first?.job).toMatchObject({
      id: "job_storage_materialized_source",
      kind: "workspace.task",
      priority: 7,
    });
    expect(first?.job.payload).toMatchObject({
      delegationGraphId: graph.id,
      delegationNodeId: source.id,
      nodeKind: "agent_task",
      payload: { handlerId: "handler.storage.materialize" },
    });

    await expect(
      client.materializeReadyDelegationGraphNode({
        graphId: graph.id,
        nodeId: source.id,
        workerId: "orchestrator_storage",
        jobId: "job_storage_duplicate",
        jobKind: "workspace.task",
      }),
    ).resolves.toBeNull();
    await expect(
      client.materializeReadyDelegationGraphNode({
        graphId: graph.id,
        nodeId: target.id,
        workerId: "orchestrator_storage",
        jobId: "job_storage_target_early",
        jobKind: "workspace.task",
      }),
    ).resolves.toBeNull();

    await client.updateDelegationGraphNodeState({
      nodeId: source.id,
      state: "succeeded",
    });
    const second = await client.materializeReadyDelegationGraphNode({
      graphId: graph.id,
      nodeId: target.id,
      workerId: "orchestrator_storage",
      jobId: "job_storage_materialized_target",
      jobKind: "workspace.task",
      jobPayload: { handlerId: "override" },
      jobIdempotencyKey: "storage-materialized-target-key",
    });
    expect(second?.node).toMatchObject({
      id: target.id,
      state: "running",
      schedulerJobId: "job_storage_materialized_target",
    });
    expect(second?.job.payload).toMatchObject({
      delegationNodeId: target.id,
      payload: { handlerId: "override" },
    });
  });

  it("persists Team lead authority with compare-and-set through system-service", async () => {
    const client = await createClient();
    const conversation = await client.putTeamConversation({
      id: "team_storage_lead",
      principalId: "team_storage_lead_owner",
      mode: "orchestrated",
    });
    expect(conversation).not.toHaveProperty("leadParticipantId");
    const firstSession = await client.createSession({
      id: "ses_team_storage_lead_first",
      kind: "agent",
    });
    const first = await client.putTeamParticipant({
      id: "team_storage_lead_first",
      conversationId: conversation.id,
      principalId: "team_storage_lead_first_principal",
      kind: "agent",
      agentSessionId: firstSession.id,
    });
    const secondSession = await client.createSession({
      id: "ses_team_storage_lead_second",
      kind: "agent",
    });
    const second = await client.putTeamParticipant({
      id: "team_storage_lead_second",
      conversationId: conversation.id,
      principalId: "team_storage_lead_second_principal",
      kind: "agent",
      agentSessionId: secondSession.id,
    });

    const assigned = await client.setTeamConversationLead({
      conversationId: conversation.id,
      leadParticipantId: first.id,
    });
    expect(assigned).toMatchObject({ leadParticipantId: first.id });
    await expect(
      client.setTeamConversationLead({
        conversationId: conversation.id,
        leadParticipantId: first.id,
      }),
    ).resolves.toEqual(assigned);
    await expect(
      client.setTeamConversationLead({
        conversationId: conversation.id,
        leadParticipantId: second.id,
      }),
    ).rejects.toThrow(/lead changed/);

    await expect(
      client.setTeamConversationLead({
        conversationId: conversation.id,
        expectedLeadParticipantId: first.id,
        leadParticipantId: second.id,
      }),
    ).resolves.toMatchObject({ leadParticipantId: second.id });
    await expect(
      client.getTeamConversation(conversation.id),
    ).resolves.toMatchObject({
      leadParticipantId: second.id,
    });
    const cleared = await client.setTeamConversationLead({
      conversationId: conversation.id,
      expectedLeadParticipantId: second.id,
    });
    expect(cleared).not.toHaveProperty("leadParticipantId");
  });

  it("persists team message routing and delivery ledger through system-service", async () => {
    const client = await createClient();
    const conversation = await client.putTeamConversation({
      principalId: "team_owner_storage",
      title: "Storage team",
      mode: "hybrid",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "team-storage-conversation",
    });
    const duplicate = await client.putTeamConversation({
      id: "ignored_team_id",
      principalId: "team_owner_storage",
      title: "Storage team",
      mode: "hybrid",
      metadata: { source: "storage-client-test" },
      idempotencyKey: "team-storage-conversation",
    });
    expect(duplicate.id).toBe(conversation.id);

    const user = await client.putTeamParticipant({
      id: "team_storage_user",
      conversationId: conversation.id,
      principalId: "user_storage",
      kind: "user",
      displayName: "User",
      role: "requester",
      idempotencyKey: "team-storage-user",
    });
    const agentSession = await client.createSession({
      id: "ses_team_storage_agent",
      kind: "agent",
    });
    const agent = await client.putTeamParticipant({
      id: "team_storage_agent",
      conversationId: conversation.id,
      principalId: "agent_storage",
      kind: "agent",
      agentSessionId: agentSession.id,
      displayName: "Agent",
      role: "reviewer",
      metadata: { profile: "coder" },
    });

    const message = await client.admitTeamMessage({
      id: "team_storage_message_one",
      conversationId: conversation.id,
      authorParticipantId: user.id,
      targets: [{ kind: "participant", participantId: agent.id }],
      kind: "message",
      content: [
        {
          type: "text",
          id: "part_team_storage_1",
          text: "Please review.",
        },
      ],
      metadata: { source: "storage-client-test" },
      idempotencyKey: "team-storage-message-one",
    });
    expect(message).toMatchObject({
      id: "team_storage_message_one",
      conversationId: conversation.id,
      authorParticipantId: user.id,
      targets: [{ kind: "participant", participantId: agent.id }],
      kind: "message",
      state: "admitted",
      revision: 1,
    });

    await expect(
      client.listTeamConversations({
        principalId: "team_owner_storage",
        state: "open",
        mode: "hybrid",
      }),
    ).resolves.toMatchObject([{ id: conversation.id }]);
    await expect(
      client.listTeamParticipants({
        conversationId: conversation.id,
        state: "active",
      }),
    ).resolves.toHaveLength(2);
    await expect(
      client.listTeamMessages({ conversationId: conversation.id }),
    ).resolves.toMatchObject([
      {
        id: message.id,
        content: [{ text: "Please review." }],
      },
    ]);

    const routed = await client.routeTeamMessage({
      id: "team_storage_route_one",
      messageId: message.id,
      expectedRevision: 1,
      mode: "hybrid",
      outcome: "deliver",
      actorPrincipalId: "team_owner_storage",
      reason: "Explicit participant target",
      idempotencyKey: "team-storage-route-one",
      deliveries: [
        {
          id: "team_storage_delivery_one",
          targetParticipantId: agent.id,
          role: "speaker",
          trigger: "mention",
        },
      ],
    });
    expect(routed).toMatchObject({
      created: true,
      message: { id: message.id, state: "routed", revision: 2 },
      decision: { id: "team_storage_route_one", outcome: "deliver" },
      deliveries: [
        {
          id: "team_storage_delivery_one",
          state: "queued",
          targetSessionId: agentSession.id,
          dispatchJobId: expect.any(String),
        },
      ],
      dispatchJobs: [{ kind: "team.delivery", state: "ready" }],
    });
    await expect(
      client.getTeamRoutingDecisionByMessage(message.id),
    ).resolves.toMatchObject({ id: routed.decision.id });
    await expect(
      client.listTeamRoutingDecisions({
        conversationId: conversation.id,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      client.listTeamDeliveries({
        messageId: message.id,
        state: "queued",
      }),
    ).resolves.toMatchObject([{ id: "team_storage_delivery_one" }]);

    const dispatchJob = routed.dispatchJobs[0];
    if (dispatchJob === undefined)
      throw new Error("expected a Team dispatch job");
    const claimedDispatch = await client.claimJob({
      workerId: "team_storage_materializer",
      leaseMs: 60_000,
      kinds: ["team.delivery"],
    });
    expect(claimedDispatch).toMatchObject({
      id: dispatchJob.id,
      kind: "team.delivery",
      state: "running",
    });
    if (claimedDispatch?.leaseToken === undefined) {
      throw new Error("claimed Team dispatch job is missing its lease");
    }
    await expect(
      client.completeJob({
        jobId: claimedDispatch.id,
        workerId: "team_storage_materializer",
        leaseToken: claimedDispatch.leaseToken,
      }),
    ).rejects.toThrow(/materialize_team_delivery/);
    await expect(
      client.getTeamDeliveryMaterializationContext("team_storage_delivery_one"),
    ).resolves.toMatchObject({
      participant: { id: agent.id, agentSessionId: agentSession.id },
      message: { id: message.id },
      delivery: { state: "queued", dispatchJobId: dispatchJob.id },
      dispatchJob: { id: dispatchJob.id, state: "running" },
    });
    const materializeRequest = {
      deliveryId: "team_storage_delivery_one",
      dispatchJobId: claimedDispatch.id,
      workerId: "team_storage_materializer",
      leaseToken: claimedDispatch.leaseToken,
      executionBinding: testTurnBinding("team_storage_delivery"),
      maxSteps: 12,
      childPriority: 3,
    };
    const materialized =
      await client.materializeTeamDelivery(materializeRequest);
    expect(materialized).toMatchObject({
      created: true,
      delivery: {
        state: "dispatched",
        targetSessionId: agentSession.id,
        childInputId: "inp_team_team_storage_delivery_one",
        childTurnId: "turn_team_team_storage_delivery_one",
        childTurnJobId: "job_team_turn_team_storage_delivery_one",
        materializedAt: expect.any(Number),
      },
      dispatchJob: { id: dispatchJob.id, state: "succeeded" },
      submission: {
        turn: { sessionId: agentSession.id, state: "queued", maxSteps: 12 },
        job: { kind: "session.turn", state: "ready", priority: 3 },
      },
    });
    await expect(
      client.materializeTeamDelivery(materializeRequest),
    ).resolves.toMatchObject({
      created: false,
      delivery: { id: "team_storage_delivery_one", state: "dispatched" },
      submission: { turn: { id: materialized.submission.turn.id } },
    });
    await expect(
      client.materializeTeamDelivery({
        ...materializeRequest,
        executionBinding: testTurnBinding("team_storage_delivery_changed"),
      }),
    ).rejects.toThrow(/replay changed its child plan/);

    await expect(
      client.requestSessionTurnCancel({
        sessionId: agentSession.id,
        turnId: materialized.submission.turn.id,
        inputId: materialized.submission.admission.inputId,
        jobId: materialized.submission.job.id,
        reason: "Storage outcome projection test",
      }),
    ).resolves.toMatchObject({
      status: "cancelled",
      turn: { state: "cancelled" },
      job: { state: "cancelled" },
    });
    const cancelledDelivery = (
      await client.listTeamDeliveries({
        messageId: message.id,
      })
    )[0];
    expect(cancelledDelivery).toMatchObject({
      id: "team_storage_delivery_one",
      state: "dispatched",
      outcomeJobId: expect.any(String),
    });
    const outcomeJob = await client.claimJob({
      workerId: "team_storage_outcome_projector",
      leaseMs: 60_000,
      kinds: ["team.delivery.outcome"],
    });
    expect(outcomeJob).toMatchObject({
      id: cancelledDelivery?.outcomeJobId,
      kind: "team.delivery.outcome",
      state: "running",
    });
    if (outcomeJob?.leaseToken === undefined) {
      throw new Error("claimed Team outcome job is missing its lease");
    }
    const projected = await client.projectTeamDeliveryOutcome({
      deliveryId: "team_storage_delivery_one",
      outcomeJobId: outcomeJob.id,
      workerId: "team_storage_outcome_projector",
      leaseToken: outcomeJob.leaseToken,
    });
    expect(projected).toMatchObject({
      created: true,
      delivery: {
        state: "cancelled",
        outcomeJobId: outcomeJob.id,
        finishedAt: expect.any(Number),
      },
      outcomeJob: { state: "succeeded" },
      childTurn: { id: materialized.submission.turn.id, state: "cancelled" },
    });
    expect(projected.childAssistantMessage).toBeUndefined();
    expect(projected.replyMessage).toBeUndefined();
    await expect(
      client.projectTeamDeliveryOutcome({
        deliveryId: "team_storage_delivery_one",
        outcomeJobId: outcomeJob.id,
        workerId: "team_storage_outcome_projector",
        leaseToken: outcomeJob.leaseToken,
      }),
    ).resolves.toMatchObject({
      created: false,
      delivery: { state: "cancelled" },
    });

    await client.updateTeamParticipantState({
      participantId: agent.id,
      state: "muted",
    });
    await expect(
      client.admitTeamMessage({
        conversationId: conversation.id,
        authorParticipantId: agent.id,
        targets: [],
        content: [{ type: "text", id: "part_team_muted", text: "Muted." }],
        idempotencyKey: "team-storage-message-muted",
      }),
    ).rejects.toThrow(/author must be active/);

    await expect(
      client.updateTeamConversationState({
        conversationId: conversation.id,
        state: "closed",
      }),
    ).resolves.toMatchObject({
      id: conversation.id,
      closedAt: expect.any(Number),
    });
    await expect(
      client.getTeamConversation(conversation.id),
    ).resolves.toMatchObject({
      state: "closed",
    });
    await expect(
      client.admitTeamMessage({
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [],
        content: [{ type: "text", id: "part_team_closed", text: "Closed." }],
        idempotencyKey: "team-storage-message-closed",
      }),
    ).rejects.toThrow(/not open/);
  });

  it("persists plugin manifests and submits plugin action jobs", async () => {
    const client = await createClient();
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
        "team.conversation.write",
      ],
      metadata: { connector: true },
      idempotencyKey: "plugin-storage-telegram",
    });
    const duplicate = await client.putPluginManifest({
      id: "ignored_plugin_manifest",
      pluginId: "connector.telegram",
      version: "1.0.0",
      name: "Telegram Connector",
      entry: { kind: "process", command: "telegram-connector" },
      capabilities: manifest.capabilities,
      metadata: { connector: true },
      idempotencyKey: "plugin-storage-telegram",
    });
    expect(duplicate.id).toBe(manifest.id);
    expect(manifest.capabilities).toContain("channel.deliver");

    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/install does not exist/);

    await expect(
      client.getPluginManifest({ pluginId: "connector.telegram" }),
    ).resolves.toMatchObject({
      id: manifest.id,
      state: "registered",
    });
    await expect(
      client.listPluginManifests({
        state: "registered",
        capability: "channel.deliver",
      }),
    ).resolves.toMatchObject([{ id: manifest.id }]);

    const layout = {
      kind: "wanex.plugin.package.layout.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
    };
    const trust = {
      kind: "wanex.plugin.package.trust.v1",
      pluginId: "connector.telegram",
      version: "1.0.0",
      source: { kind: "local" },
      install: { rootDir: "/plugins/connector.telegram/1.0.0" },
      decision: { status: "allow" },
    };
    const install = await client.putPluginInstall({
      pluginId: "connector.telegram",
      version: "1.0.0",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0",
      metadata: { source: "storage-test" },
      idempotencyKey: "plugin-storage-telegram-install",
    });
    expect(install).toMatchObject({
      pluginId: "connector.telegram",
      version: "1.0.0",
      state: "installed",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0",
    });
    const duplicateInstall = await client.putPluginInstall({
      id: "ignored_plugin_install",
      pluginId: "connector.telegram",
      version: "1.0.0",
      layout,
      trust,
      installRootDir: "/plugins/connector.telegram/1.0.0",
      metadata: { source: "storage-test" },
      idempotencyKey: "plugin-storage-telegram-install",
    });
    expect(duplicateInstall.id).toBe(install.id);
    await expect(
      client.getPluginInstall({
        pluginId: "connector.telegram",
        version: "1.0.0",
      }),
    ).resolves.toMatchObject({ id: install.id });
    await expect(
      client.listPluginInstalls({
        pluginId: "connector.telegram",
        state: "installed",
      }),
    ).resolves.toMatchObject([{ id: install.id }]);
    await expect(
      client.updatePluginInstallState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        expectedState: "installed",
        state: "installed",
      }),
    ).resolves.toMatchObject({
      id: install.id,
      updatedAt: install.updatedAt,
    });
    await expect(
      client.updatePluginInstallState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        expectedState: "disabled",
        state: "removed",
      }),
    ).rejects.toThrow(/state conflict/);
    const disabledInstall = await client.updatePluginInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "installed",
      state: "disabled",
    });
    expect(disabledInstall).toMatchObject({
      id: install.id,
      state: "disabled",
    });
    expect(disabledInstall.disabledAt).toEqual(expect.any(Number));
    expect(disabledInstall.removedAt).toBeUndefined();
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/not installed/);
    const removedInstall = await client.updatePluginInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "disabled",
      state: "removed",
    });
    expect(removedInstall).toMatchObject({
      id: install.id,
      state: "removed",
    });
    expect(removedInstall.disabledAt).toBeUndefined();
    expect(removedInstall.removedAt).toEqual(expect.any(Number));
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/not installed/);
    await expect(
      client.updatePluginInstallState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        expectedState: "removed",
        state: "installed",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: install.id,
        state: "installed",
      }),
    );
    const restoredInstall = await client.getPluginInstall({
      pluginId: "connector.telegram",
      version: "1.0.0",
    });
    expect(restoredInstall?.disabledAt).toBeUndefined();
    expect(restoredInstall?.removedAt).toBeUndefined();
    await expect(
      client.getPluginActionExecutionAdmission({
        pluginId: "connector.telegram",
        version: "1.0.0",
        requiredCapability: "channel.deliver",
      }),
    ).resolves.toMatchObject({
      manifest: { id: manifest.id, version: "1.0.0" },
      install: { id: install.id, state: "installed" },
    });

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
      maxAttempts: 2,
    });
    expect(submission.job).toMatchObject({
      id: "job_storage_plugin_deliver",
      kind: "plugin.action",
      priority: 4,
    });
    expect(submission.job.payload).toMatchObject({
      pluginId: "connector.telegram",
      version: "1.0.0",
      actionId: "deliver-message",
      requiredCapability: "channel.deliver",
      payload: { text: "hello" },
    });

    await client.putPluginManifest({
      pluginId: "connector.telegram",
      version: "2.0.0",
      capabilities: manifest.capabilities,
      idempotencyKey: "plugin-storage-telegram-v2",
    });
    await client.putPluginInstall({
      pluginId: "connector.telegram",
      version: "2.0.0",
      layout: {
        kind: "wanex.plugin.package.layout.v1",
        pluginId: "connector.telegram",
        version: "2.0.0",
      },
      trust: {
        kind: "wanex.plugin.package.trust.v1",
        pluginId: "connector.telegram",
        version: "2.0.0",
        source: { kind: "local" },
        install: { rootDir: "/plugins/connector.telegram/2.0.0" },
        decision: { status: "deny" },
      },
      installRootDir: "/plugins/connector.telegram/2.0.0",
      idempotencyKey: "plugin-storage-telegram-install-v2",
    });
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "2.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/trust decision is not allow/);
    await client.putPluginManifest({
      pluginId: "connector.telegram",
      version: "3.0.0",
      capabilities: manifest.capabilities,
      idempotencyKey: "plugin-storage-telegram-v3",
    });
    await client.putPluginInstall({
      pluginId: "connector.telegram",
      version: "3.0.0",
      layout: {
        kind: "wanex.plugin.package.layout.v1",
        pluginId: "connector.telegram",
        version: "3.0.0",
      },
      trust: {
        kind: "wanex.plugin.package.trust.v1",
        pluginId: "connector.telegram",
        version: "3.0.0",
        source: { kind: "local" },
        signature: { kind: "test", verified: false },
        install: { rootDir: "/plugins/connector.telegram/3.0.0" },
        decision: { status: "allow" },
      },
      installRootDir: "/plugins/connector.telegram/3.0.0",
      idempotencyKey: "plugin-storage-telegram-install-v3",
    });
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "3.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/signature is not verified/);
    await client.updatePluginInstallState({
      pluginId: "connector.telegram",
      version: "1.0.0",
      expectedState: "disabled",
      state: "installed",
    });

    const registration = await client.putConnectorRegistration({
      connectorId: "connector.telegram",
      pluginId: "connector.telegram",
      version: "1.0.0",
      metadata: { runtime: "storage-test" },
      idempotencyKey: "storage-connector-telegram",
    });
    expect(registration).toMatchObject({
      connectorId: "connector.telegram",
      pluginId: "connector.telegram",
      pluginVersion: "1.0.0",
      state: "active",
      metadata: { runtime: "storage-test" },
    });
    await expect(
      client.listConnectorRegistrations({ connectorId: "connector.telegram" }),
    ).resolves.toMatchObject([{ id: registration.id }]);

    const credential = await client.putConnectorCredential({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "env://TELEGRAM_BOT_TOKEN",
      metadata: { scope: "bot-main" },
      idempotencyKey: "storage-connector-credential",
    });
    expect(credential).toMatchObject({
      connectorId: "connector.telegram",
      kind: "bot-token",
      secretRef: "env://TELEGRAM_BOT_TOKEN",
      state: "active",
      metadata: { scope: "bot-main" },
    });
    await expect(
      client.listConnectorCredentials({ connectorId: "connector.telegram" }),
    ).resolves.toMatchObject([{ id: credential.id }]);

    const session = await client.startConnectorSession({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      ownerId: "connector-worker-storage",
      leaseMs: 60_000,
      state: "connecting",
      metadata: { phase: "connect" },
      idempotencyKey: "storage-connector-session",
    });
    expect(session).toMatchObject({
      connectorId: "connector.telegram",
      credentialId: credential.id,
      state: "connecting",
      ownerId: "connector-worker-storage",
      metadata: { phase: "connect" },
    });
    expect(session.leaseToken).toMatch(/^lease_/);
    await expect(
      client.heartbeatConnectorSession({
        sessionId: session.id,
        ownerId: "connector-worker-storage",
        leaseToken: session.leaseToken,
        leaseMs: 60_000,
        state: "connected",
        metadata: { phase: "connected" },
      }),
    ).resolves.toMatchObject({
      id: session.id,
      state: "connected",
      metadata: { phase: "connected" },
    });
    await expect(
      client.finishConnectorSession({
        sessionId: session.id,
        ownerId: "connector-worker-storage",
        leaseToken: session.leaseToken,
        state: "disconnected",
        metadata: { reason: "test complete" },
      }),
    ).resolves.toMatchObject({
      id: session.id,
      state: "disconnected",
      finishedAt: expect.any(Number),
    });
    await expect(
      client.revokeConnectorCredential({ credentialId: credential.id }),
    ).resolves.toMatchObject({
      id: credential.id,
      state: "revoked",
      revokedAt: expect.any(Number),
    });

    await expect(
      client.updateConnectorRegistrationState({
        connectorId: "connector.telegram",
        state: "disabled",
      }),
    ).resolves.toMatchObject({
      state: "disabled",
      disabledAt: expect.any(Number),
    });

    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "fetch-url",
        principalId: "principal_channel_storage",
        payload: { url: "https://example.com" },
        requiredCapability: "network.fetch",
      }),
    ).rejects.toThrow(/capability not declared/);

    await expect(
      client.updatePluginManifestState({
        pluginId: "connector.telegram",
        version: "1.0.0",
        state: "disabled",
      }),
    ).resolves.toMatchObject({
      state: "disabled",
      disabledAt: expect.any(Number),
    });
    await expect(
      client.submitPluginAction({
        pluginId: "connector.telegram",
        version: "1.0.0",
        actionId: "deliver-message",
        principalId: "principal_channel_storage",
        payload: {},
        requiredCapability: "channel.deliver",
      }),
    ).rejects.toThrow(/not registered/);
  });

  it("persists channel bindings, inbound events, and delivery jobs", async () => {
    const client = await createClient();
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver",
    ]);

    const binding = await client.putChannelBinding({
      id: "bind_storage_telegram_user",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      displayName: "Ada",
      metadata: { locale: "en" },
      idempotencyKey: "storage-channel-binding",
    });
    expect(binding).toMatchObject({
      id: "bind_storage_telegram_user",
      state: "active",
      principalId: "principal_storage_user",
    });

    const duplicateBinding = await client.putChannelBinding({
      id: "ignored_binding",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      idempotencyKey: "storage-channel-binding",
    });
    expect(duplicateBinding.id).toBe(binding.id);

    await expect(
      client.listChannelBindings({
        connectorId: "connector.telegram",
        channelKind: "telegram",
        channelId: "bot-main",
        state: "active",
      }),
    ).resolves.toMatchObject([{ id: binding.id }]);

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
      idempotencyKey: "telegram-update-storage-1",
    });
    expect(inbound).toMatchObject({
      id: "chin_storage_telegram_1",
      state: "received",
      principalId: "principal_storage_user",
    });

    const duplicateInbound = await client.ingestChannelInboundEvent({
      id: "ignored_inbound",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "telegram-update-storage-1",
      senderExternalIdentityId: "tg_user_storage",
      payload: { message: { text: "hello" } },
      idempotencyKey: "telegram-update-storage-1",
    });
    expect(duplicateInbound.id).toBe(inbound.id);

    await expect(
      client.updateChannelInboundEventState({
        eventId: inbound.id,
        state: "projected",
        metadata: { projectedTo: "team.message" },
      }),
    ).resolves.toMatchObject({
      state: "projected",
      metadata: { projectedTo: "team.message" },
    });

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
      maxAttempts: 3,
    });
    expect(delivery.delivery).toMatchObject({
      id: "chdel_storage_telegram_1",
      schedulerJobId: "job_storage_channel_delivery_1",
      state: "pending",
    });
    expect(delivery.job).toMatchObject({
      id: "job_storage_channel_delivery_1",
      kind: "channel.delivery",
      priority: 5,
    });
    expect(delivery.job.payload).toMatchObject({
      deliveryId: "chdel_storage_telegram_1",
      connectorId: "connector.telegram",
      payload: { text: "hi back" },
    });

    const duplicateDelivery = await client.submitChannelDelivery({
      id: "ignored_delivery",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_user_storage",
      principalId: "principal_storage_user",
      payload: { text: "hi back" },
      jobId: "ignored_job",
      idempotencyKey: "storage-channel-delivery-1",
    });
    expect(duplicateDelivery.delivery.id).toBe(delivery.delivery.id);
    expect(duplicateDelivery.job.id).toBe(delivery.job.id);

    await expect(
      client.revokeChannelBinding({ bindingId: binding.id }),
    ).resolves.toMatchObject({
      state: "revoked",
      revokedAt: expect.any(Number),
    });
  });

  it("acknowledges channel deliveries atomically with scheduler jobs", async () => {
    const client = await createClient();
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver",
    ]);

    const success = await client.submitChannelDelivery({
      id: "chdel_storage_ack_success",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      targetExternalIdentityId: "tg_storage_ack",
      principalId: "principal_storage_ack",
      payload: { text: "success" },
      jobId: "job_storage_ack_success",
      idempotencyKey: "storage-ack-success",
    });
    const claimed = await client.claimJob({
      workerId: "storage_connector_success",
      leaseMs: 60_000,
      kinds: ["channel.delivery"],
    });
    expect(claimed?.id).toBe(success.job.id);
    const ack = await client.completeChannelDelivery({
      deliveryId: success.delivery.id,
      workerId: "storage_connector_success",
      leaseToken: claimed?.leaseToken ?? "",
      result: { externalMessageId: "telegram-storage-message-1" },
      metadata: { transport: "sendMessage" },
    });
    expect(ack?.delivery).toMatchObject({
      id: success.delivery.id,
      state: "sent",
      metadata: { transport: "sendMessage" },
    });
    expect(ack?.job).toMatchObject({
      id: success.job.id,
      state: "succeeded",
      result: { externalMessageId: "telegram-storage-message-1" },
    });

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
        maxDelayMs: 0,
      },
    });
    const retryClaim = await client.claimJob({
      workerId: "storage_connector_retry",
      leaseMs: 60_000,
      kinds: ["channel.delivery"],
    });
    expect(retryClaim?.id).toBe(retryable.job.id);
    const retryAck = await client.failChannelDelivery({
      deliveryId: retryable.delivery.id,
      workerId: "storage_connector_retry",
      leaseToken: retryClaim?.leaseToken ?? "",
      error: { type: "network", message: "timeout" },
      metadata: { attempt: 1 },
    });
    expect(retryAck?.delivery).toMatchObject({
      id: retryable.delivery.id,
      state: "pending",
      metadata: { attempt: 1 },
    });
    expect(retryAck?.job).toMatchObject({
      id: retryable.job.id,
      state: "retry_scheduled",
    });

    const terminalClaim = await client.claimJob({
      workerId: "storage_connector_terminal",
      leaseMs: 60_000,
      kinds: ["channel.delivery"],
    });
    expect(terminalClaim?.id).toBe(retryable.job.id);
    const terminalAck = await client.failChannelDelivery({
      deliveryId: retryable.delivery.id,
      workerId: "storage_connector_terminal",
      leaseToken: terminalClaim?.leaseToken ?? "",
      error: { type: "platform", message: "blocked" },
      metadata: { attempt: 2 },
    });
    expect(terminalAck?.delivery).toMatchObject({
      id: retryable.delivery.id,
      state: "failed",
      finishedAt: expect.any(Number),
    });
    expect(terminalAck?.job).toMatchObject({
      id: retryable.job.id,
      state: "failed",
    });

    const stale = await client.submitChannelDelivery({
      id: "chdel_storage_ack_stale",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      principalId: "principal_storage_ack",
      payload: { text: "stale" },
      jobId: "job_storage_ack_stale",
      idempotencyKey: "storage-ack-stale",
    });
    const staleClaim = await client.claimJob({
      workerId: "storage_connector_stale",
      leaseMs: 60_000,
      kinds: ["channel.delivery"],
    });
    expect(staleClaim?.id).toBe(stale.job.id);
    await expect(
      client.completeChannelDelivery({
        deliveryId: stale.delivery.id,
        workerId: "storage_connector_stale",
        leaseToken: "wrong_lease",
        result: { externalMessageId: "should-not-commit" },
      }),
    ).resolves.toBeNull();
  });

  it("projects channel inbound events into runtime primitives", async () => {
    const client = await createClient();
    await registerStorageTestConnector(client, "connector.telegram", [
      "channel.connect",
      "channel.receive",
      "channel.deliver",
    ]);
    await client.createSession({
      id: "ses_storage_projection",
      title: "Storage Projection",
      kind: "chat",
    });
    const inbound = await client.ingestChannelInboundEvent({
      id: "chin_storage_projection_session",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "storage-projection-session-event",
      senderExternalIdentityId: "tg_storage_projection",
      principalId: "principal_storage_projection",
      payload: { message: { text: "run this" } },
      idempotencyKey: "storage-projection-session-event",
    });

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
            text: "run this",
          },
        ],
        maxSteps: 2,
      },
      metadata: { source: "storage-test" },
      idempotencyKey: "storage-projection-session-key",
    });
    expect(projection.projection).toMatchObject({
      id: "chproj_storage_session",
      inboundEventId: inbound.id,
      targetKind: "session.turn",
      targetId: "turn_storage_projection",
      targetJobId: "job_storage_projection",
      state: "projected",
    });
    expect(projection.job).toMatchObject({
      id: "job_storage_projection",
      kind: "session.turn",
    });

    const duplicate = await client.projectChannelInboundEvent({
      id: "ignored_projection",
      inboundEventId: inbound.id,
      target: {
        kind: "session.turn",
        sessionId: "ses_storage_projection",
        principalId: "principal_storage_projection",
        content: [{ type: "text", id: "ignored", text: "ignored" }],
        executionBinding: testTurnBinding("storage_projection_duplicate"),
      },
      idempotencyKey: "storage-projection-session-key",
    });
    expect(duplicate.projection.id).toBe(projection.projection.id);
    expect(duplicate.job?.id).toBe("job_storage_projection");

    const ignoredInbound = await client.ingestChannelInboundEvent({
      id: "chin_storage_projection_ignored",
      connectorId: "connector.telegram",
      channelKind: "telegram",
      channelId: "bot-main",
      externalEventId: "storage-projection-ignored-event",
      senderExternalIdentityId: "tg_storage_projection",
      principalId: "principal_storage_projection",
      payload: { message: { text: "spam" } },
      idempotencyKey: "storage-projection-ignored-event",
    });
    const ignored = await client.projectChannelInboundEvent({
      id: "chproj_storage_ignored",
      inboundEventId: ignoredInbound.id,
      target: {
        kind: "ignored",
        reason: "spam",
      },
      metadata: { moderation: "drop" },
      idempotencyKey: "storage-projection-ignored-key",
    });
    expect(ignored.projection).toMatchObject({
      id: "chproj_storage_ignored",
      targetKind: "ignored",
      state: "ignored",
      metadata: { moderation: "drop" },
    });
    expect(ignored.job).toBeUndefined();

    await expect(
      client.listChannelProjections({ limit: 10 }),
    ).resolves.toMatchObject([
      { id: "chproj_storage_session" },
      { id: "chproj_storage_ignored" },
    ]);
  });
});

async function exerciseMediaGenerationTransport(
  client: CoreStore,
  label: string,
): Promise<void> {
  const submitted = await client.submitMediaGenerationOperation({
    principalId: `media_${label}_user`,
    idempotencyKey: `media_${label}_key`,
    binding: testMediaGenerationBinding(label),
  });
  expect(submitted).toMatchObject({
    operation: {
      state: "queued",
      binding: { model: { id: `fake-media-model-${label}` } },
    },
    job: { kind: "media.generate", state: "ready" },
  });
  await expect(
    client.getMediaGenerationOperation({ operationId: submitted.operation.id }),
  ).resolves.toMatchObject({
    id: submitted.operation.id,
    jobId: submitted.job.id,
  });
  await expect(
    client.requestMediaGenerationCancel({
      operationId: submitted.operation.id,
      reason: `${label} transport cancellation`,
    }),
  ).resolves.toMatchObject({ state: "cancelled" });
}

async function createClient(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-storage-"));
  tempDirs.push(storeDir);
  return createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin,
  });
}

async function seedStorageContextTurns(
  client: StorageTestStore,
  sessionId: string,
  count: number,
): Promise<void> {
  await client.createSession({ id: sessionId, kind: "agent" });
  for (let index = 1; index <= count; index += 1) {
    const suffix = `${sessionId}_${index}`;
    const submitted = await client.submitSessionTurn({
      id: `inp_${suffix}`,
      turnId: `turn_${suffix}`,
      sessionId,
      principalId: "user_context_storage",
      idempotencyKey: `idem_${suffix}`,
      content: [
        {
          type: "text",
          id: `part_${suffix}`,
          text: `remember context ${index}`,
        },
      ],
      jobId: `job_turn_${suffix}`,
      executionBinding: testTurnBinding(suffix),
    });
    const workerId = `worker_turn_${suffix}`;
    const job = await client.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"],
    });
    if (job?.leaseToken === undefined) {
      throw new Error(`failed to claim seeded context turn ${suffix}`);
    }
    const started = await client.startSessionTurnAttempt({
      sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken,
    });
    const invocation = await client.beginProviderInvocation({
      sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken,
      step: 1,
      invocationNumber: 1,
      requestDigest: digestJson({ sessionId, index }),
    });
    await client.settleSessionTurn({
      sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken,
      outcome: "succeeded",
      providerInvocationId: invocation.id,
      assistantMessage: [
        {
          type: "text",
          id: `assistant_${suffix}`,
          text: `context response ${index}`,
        },
      ],
    });
  }
}

async function claimStorageContextJob(
  client: StorageTestStore,
  jobId: string,
  workerId: string,
  sessionId: string,
): Promise<SchedulerJobRecord> {
  await client.enqueueJob({
    id: jobId,
    kind: "memory.compaction",
    principalId: "context_storage_worker",
    payload: { evidence: { sessionId } },
    maxAttempts: 1,
  });
  const job = await client.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["memory.compaction"],
  });
  if (job?.leaseToken === undefined) {
    throw new Error(`failed to claim context job ${jobId}`);
  }
  return job;
}

function contextEpochRequest(options: {
  readonly id: string;
  readonly sessionId: string;
  readonly job: SchedulerJobRecord;
  readonly workerId: string;
  readonly messages: readonly SessionMessageRecord[];
  readonly cutIndex: number;
  readonly previous?: ContextEpochRecord;
  readonly digestSeed: string;
}): BeginContextEpochRequest {
  const cut = options.messages[options.cutIndex];
  const retained = options.messages[options.cutIndex + 1];
  const head = options.messages.at(-1);
  if (cut === undefined || retained === undefined || head === undefined) {
    throw new Error("context epoch test boundary is incomplete");
  }
  return {
    id: options.id,
    sessionId: options.sessionId,
    jobId: options.job.id,
    workerId: options.workerId,
    leaseToken: options.job.leaseToken!,
    maxProviderAttempts: 2,
    ...(options.previous === undefined
      ? {}
      : {
          previousEpochId: options.previous.id,
          previousSummaryDigest: options.previous.summaryDigest,
        }),
    sourceHeadSequence: head.sequence,
    sourceHeadMessageId: head.id,
    cutSequence: cut.sequence,
    cutMessageId: cut.id,
    retainedFromSequence: retained.sequence,
    retainedFromMessageId: retained.id,
    sourceDigest: options.digestSeed.repeat(64),
    policy: { algorithm: "semantic-summary", seed: options.digestSeed },
    policyDigest: options.digestSeed.repeat(64),
    modelEndpoint: testTurnBinding(options.digestSeed).modelEndpoint,
    requestDigest: options.digestSeed.repeat(64),
    tokenEstimateBefore: 300,
  };
}

async function registerStorageTestConnector(
  client: StorageTestStore,
  connectorId: string,
  capabilities: Array<
    "channel.connect" | "channel.receive" | "channel.deliver"
  >,
): Promise<void> {
  await client.putPluginManifest({
    pluginId: `plugin.${connectorId}`,
    version: "1.0.0",
    name: `Test Connector ${connectorId}`,
    entry: { kind: "test" },
    capabilities,
    metadata: { test: true },
    idempotencyKey: `manifest:${connectorId}`,
  });
  await client.putConnectorRegistration({
    connectorId,
    pluginId: `plugin.${connectorId}`,
    version: "1.0.0",
    metadata: { test: true },
    idempotencyKey: `connector:${connectorId}`,
  });
}

async function startRemoteStorageFixture(
  storesByToken: Readonly<Record<string, string>>,
): Promise<string> {
  const server = createServer((request, response) => {
    void (async () => {
      try {
        if (request.method !== "POST") {
          response.writeHead(405);
          response.end();
          return;
        }
        const token = parseBearerToken(request.headers.authorization);
        const storeDir = token === undefined ? undefined : storesByToken[token];
        if (storeDir === undefined) {
          response.writeHead(401);
          response.end(JSON.stringify({ ok: false }));
          return;
        }
        const body = await readJsonRequestBody(request);
        const rpcRequest = extractRemoteStorageRequest(body);
        const transport = new OneShotSystemServiceStorageWireTransport({
          storeDir,
          serviceBin,
        });
        const envelope = await transport.exchange(rpcRequest);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(envelope));
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
      }
    })();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return registerServerEndpoint(server);
}

async function startServer(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return registerServerEndpoint(server);
}

function registerServerEndpoint(server: Server): string {
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/storage`;
}

function parseBearerToken(header: string | undefined): string | undefined {
  const prefix = "Bearer ";
  if (header === undefined || !header.startsWith(prefix)) {
    return undefined;
  }
  return header.slice(prefix.length);
}

async function readJsonRequestBody(
  request: NodeJS.ReadableStream,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function extractRemoteStorageRequest(body: unknown): StorageRpcRequestEnvelope {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("remote storage body must be an object");
  }
  const record = body as { readonly request?: unknown };
  if (record.request === undefined) {
    throw new Error("remote storage body missing request");
  }
  return record.request as StorageRpcRequestEnvelope;
}

function wireRequest(request: StorageRpcCommand): StorageRpcRequestEnvelope {
  return {
    storage_rpc_version: 1,
    request_id: "rpc_wire_test",
    request,
  };
}

async function createFakeSystemServiceCommand(source: string): Promise<{
  readonly serviceBin: string;
  readonly serviceArgsPrefix: readonly string[];
}> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-fake-system-service-"));
  tempDirs.push(dir);
  const script = join(dir, "fake-system-service.mjs");
  await writeFile(script, `${source}\n`, "utf8");
  return {
    serviceBin: process.execPath,
    serviceArgsPrefix: [script],
  };
}
