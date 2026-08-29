import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createMemoryStateStore,
  createSurfaceAdapter,
  createShell
} from "../src/index.js"
import { createSideQueryCoordinator } from "../src/side-query/service.js"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  handleSurfaceTransportRequest,
  type SurfaceClient,
  type SurfaceClientTransport
} from "../src/surface/client.js"
import type {
  WanexAppAskSideQueryRequest,
  WanexAppAskSideQueryResult
} from "@wanex/app"
import { createStorageTestStore } from "@wanex/storage/testing"
import { assistantTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("Assistant ephemeral side-query coordinator", () => {
  it("returns running before completion and freezes its trusted bindings", async () => {
    const completion = deferred<SideQueryAnswer>()
    const requestStarted = deferred<SideQueryRequest>()
    const fixture = createCoordinatorFixture(async (request) => {
      requestStarted.resolve(request)
      return await completion.promise
    })
    const ids = ["sideq_first", "sideq_second"]
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state,
      now: incrementingClock(),
      createQueryId: () => ids.shift() ?? "sideq_extra"
    })

    try {
      const running = await coordinator.start({
        question: "  inspect current context  ",
        maxOutputTokens: 128
      })
      expect(running).toMatchObject({
        queryId: "sideq_first",
        sessionId: "ses_side_query_one",
        modelEndpointId: "provider-one",
        state: "running",
        question: "inspect current context",
        maxOutputTokens: 128
      })
      const admitted = await requestStarted.promise
      expect(admitted).toMatchObject({
        sessionId: "ses_side_query_one",
        question: "inspect current context",
        expectedModelEndpointId: "provider-one",
        maxOutputTokens: 128
      })
      expect(admitted.signal).toBeInstanceOf(AbortSignal)
      await expect(
        coordinator.start({ question: "second while running" })
      ).rejects.toThrow("a side query is already running")

      fixture.state.selection = {
        kind: "session",
        sessionId: "ses_side_query_two"
      }
      fixture.setActiveProvider("provider-two")
      completion.resolve({
        sessionId: "ses_side_query_one",
        answerText: "A".repeat(40_000),
        output: [],
        telemetry: {},
        persisted: false,
        modelEndpointId: "provider-one"
      })
      const succeeded = await readTerminal(coordinator, "sideq_first")
      expect(succeeded).toMatchObject({
        sessionId: "ses_side_query_one",
        modelEndpointId: "provider-one",
        state: "succeeded",
        answerTruncated: true
      })
      expect(succeeded.answerText).toHaveLength(32_768)

      const replacement = await coordinator.start({ question: "replacement" })
      expect(replacement).toMatchObject({
        queryId: "sideq_second",
        sessionId: "ses_side_query_two",
        modelEndpointId: "provider-two",
        state: "running"
      })
      expect(coordinator.read({ queryId: "sideq_first" })).toEqual({
        kind: "assistant.side-query.missing",
        queryId: "sideq_first"
      })
    } finally {
      await coordinator.dispose()
    }
  })

  it("validates bounds, selected session, and Provider readiness before start", async () => {
    const fixture = createCoordinatorFixture(async () => defaultAnswer())
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state
    })

    try {
      await expect(coordinator.start({ question: "   " })).rejects.toThrow(
        "side query question must not be empty"
      )
      await expect(
        coordinator.start({ question: "x".repeat(16_385) })
      ).rejects.toThrow("side query question must not exceed 16384 characters")
      await expect(
        coordinator.start({ question: "valid", maxOutputTokens: 4_097 })
      ).rejects.toThrow(
        "side query maxOutputTokens must be an integer between 1 and 4096"
      )
      delete fixture.state.selection
      await expect(coordinator.start({ question: "valid" })).rejects.toThrow(
        "select an active session before starting a side query"
      )
      fixture.state.selection = {
        kind: "session",
        sessionId: "ses_side_query_one"
      }
      fixture.setSessionStatus("archived")
      await expect(coordinator.start({ question: "valid" })).rejects.toThrow(
        "selected side query session is archived"
      )
      fixture.setSessionStatus("active")
      fixture.setProviderCredentialConfigured(false)
      await expect(coordinator.start({ question: "valid" })).rejects.toThrow(
        "provider is not ready"
      )
      expect(coordinator.read({ queryId: "sideq_after_restart" })).toEqual({
        kind: "assistant.side-query.missing",
        queryId: "sideq_after_restart"
      })
    } finally {
      await coordinator.dispose()
    }
  })

  it("retains a terminal query when replacement admission fails", async () => {
    const fixture = createCoordinatorFixture(async () => defaultAnswer())
    const events: string[] = []
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state,
      createQueryId: () => "sideq_retained"
    })
    const unsubscribe = coordinator.events.subscribeSideQueryEvents((event) => {
      events.push(`${event.queryId}:${event.cause}`)
    })

    try {
      const started = await coordinator.start({ question: "retain this answer" })
      const terminal = await readTerminal(coordinator, started.queryId)
      const eventsBeforeRejectedStarts = [...events]

      await expect(coordinator.start({ question: "   " })).rejects.toThrow(
        "side query question must not be empty"
      )
      fixture.setProviderCredentialConfigured(false)
      await expect(
        coordinator.start({ question: "replacement without provider" })
      ).rejects.toThrow("provider is not ready")

      expect(coordinator.read({ queryId: started.queryId })).toEqual({
        kind: "assistant.side-query.found",
        query: terminal
      })
      expect(events).toEqual(eventsBeforeRejectedStarts)
    } finally {
      unsubscribe()
      await coordinator.dispose()
    }
  })

  it("cancels by exact ID and ignores a late Provider completion", async () => {
    const completion = deferred<SideQueryAnswer>()
    const aborted = deferred<void>()
    const fixture = createCoordinatorFixture(async (request) => {
      request.signal?.addEventListener("abort", () => aborted.resolve(), {
        once: true
      })
      return await completion.promise
    })
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state,
      createQueryId: () => "sideq_cancel"
    })

    try {
      const running = await coordinator.start({ question: "cancel this" })
      await expect(
        coordinator.cancel({ queryId: "sideq_stale" })
      ).rejects.toThrow("side query does not exist: sideq_stale")
      await expect(
        coordinator.dismiss({ queryId: running.queryId })
      ).rejects.toThrow("cannot dismiss a running side query")

      const cancelling = coordinator.cancel({ queryId: running.queryId })
      await aborted.promise
      completion.resolve(defaultAnswer())
      await expect(cancelling).resolves.toMatchObject({
        queryId: running.queryId,
        state: "cancelled"
      })
      expect(coordinator.read({ queryId: running.queryId })).toMatchObject({
        kind: "assistant.side-query.found",
        query: {
          state: "cancelled"
        }
      })
      await expect(
        coordinator.dismiss({ queryId: "sideq_stale" })
      ).rejects.toThrow("side query does not exist: sideq_stale")
      await expect(
        coordinator.dismiss({ queryId: running.queryId })
      ).resolves.toEqual({
        kind: "assistant.side-query.dismissed",
        queryId: running.queryId
      })
      expect(coordinator.read({ queryId: running.queryId })).toEqual({
        kind: "assistant.side-query.missing",
        queryId: running.queryId
      })
    } finally {
      await coordinator.dispose()
    }
  })

  it("projects Provider failures without exposing paths or secrets", async () => {
    const fixture = createCoordinatorFixture(async () => {
      throw new Error(
        "provider failed with secret token at /Users/asuna/private/provider.log"
      )
    })
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state,
      createQueryId: () => "sideq_failed"
    })

    try {
      await coordinator.start({ question: "safe failure" })
      const failed = await readTerminal(coordinator, "sideq_failed")
      expect(failed).toMatchObject({
        state: "failed",
        error: {
          code: "runtime_error",
          category: "runtime",
          message: "command failed; see assistant diagnostics for details"
        }
      })
      expect(JSON.stringify(failed)).not.toContain("/Users/asuna")
      expect(JSON.stringify(failed)).not.toContain("secret token")
    } finally {
      await coordinator.dispose()
    }
  })

  it("aborts and drains owned work before disposal completes", async () => {
    const aborted = deferred<void>()
    const cleanup = deferred<void>()
    const fixture = createCoordinatorFixture(
      async (request) =>
        await new Promise<SideQueryAnswer>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => {
              aborted.resolve()
              void cleanup.promise.then(() => {
                const error = new Error("side query aborted after cleanup")
                error.name = "WanexAbortError"
                reject(error)
              })
            },
            { once: true }
          )
        })
    )
    const coordinator = createSideQueryCoordinator({
      backend: fixture.backend,
      state: fixture.state,
      createQueryId: () => "sideq_dispose"
    })

    await coordinator.start({ question: "dispose while running" })
    let disposed = false
    const disposing = coordinator.dispose().then(() => {
      disposed = true
    })
    await aborted.promise
    expect(disposed).toBe(false)
    cleanup.resolve()
    await disposing
    expect(disposed).toBe(true)
    await expect(
      coordinator.start({ question: "after disposal" })
    ).rejects.toThrow("side query coordinator is disposed")
  })

  it("wires the transient lifecycle through Assistant shell without state persistence", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_assistant_side_query")
    const stateStore = createMemoryStateStore({
      selection: { kind: "session", sessionId: "ses_assistant_side_query" }
    })
    const app = await createShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-side-query-provider",
        modelId: "assistant-side-query-model"
      }),
      stateStore
    })

    try {
      const running = await app.startSideQuery({
        question: "temporary assistant question"
      })
      expect(running.state).toBe("running")
      const succeeded = await readShellTerminal(app, running.queryId)
      expect(succeeded).toMatchObject({
        sessionId: "ses_assistant_side_query",
        modelEndpointId: "assistant-side-query-provider",
        state: "succeeded",
        answerText: "Fake response from assistant-side-query-model"
      })
      const persisted = JSON.stringify(stateStore.snapshot())
      expect(persisted).not.toContain(running.queryId)
      expect(persisted).not.toContain("temporary assistant question")
      expect(persisted).not.toContain("Fake response")
      await app.dismissSideQuery({ queryId: running.queryId })
    } finally {
      await app.dispose()
    }
  })

  it("carries typed commands and bounded invalidations through one Surface stream", async () => {
    const storeDir = await createStoreDir()
    await seedSession(storeDir, "ses_assistant_side_query_surface")
    const app = await createShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant-side-query-surface-provider",
        modelId: "assistant-side-query-surface-model"
      }),
      state: {
        selection: {
          kind: "session",
          sessionId: "ses_assistant_side_query_surface"
        }
      }
    })
    const surface = createSurfaceAdapter(app, {
      streamId: "side-query-test-stream"
    })
    const transport = createMessageSurfaceClientTransport({
      send: async (request) =>
        await handleSurfaceTransportRequest(surface, request),
      subscribe: (listener) => surface.subscribeSurfaceEvents(listener)
    })
    const client = createSurfaceClient(transport)
    const observed: unknown[] = []
    const unsubscribe = client.subscribeSurfaceEvents((event) => {
      observed.push(event)
    })

    try {
      const descriptor = await client.descriptor()
      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          commandCount: 73,
          commands: expect.arrayContaining([
            expect.objectContaining({
              command: "startSideQuery",
              input: "side-query-start",
              mutatesState: false
            }),
            expect.objectContaining({
              command: "readSideQuery",
              input: "side-query-reference",
              mutatesState: false
            })
          ])
        }
      })
      await expect(
        client.startSideQuery({ question: "   " })
      ).resolves.toMatchObject({
        ok: false,
        command: "startSideQuery",
        error: {
          code: "validation_error",
          category: "validation"
        }
      })

      const started = await client.startSideQuery(
        { question: "surface-only temporary question", maxOutputTokens: 64 },
        { requestId: "req_side_query_start" }
      )
      expect(started).toMatchObject({
        ok: true,
        command: "startSideQuery",
        value: {
          state: "running",
          sessionId: "ses_assistant_side_query_surface",
          modelEndpointId: "assistant-side-query-surface-provider"
        },
        event: {
          type: "assistant.surface.command_completed",
          requestId: "req_side_query_start"
        }
      })
      if (!started.ok) throw new Error("expected accepted side query")

      const reconnected = createSurfaceClient(transport)
      const succeeded = await readClientTerminal(
        reconnected,
        started.value.queryId
      )
      expect(succeeded).toMatchObject({
        state: "succeeded",
        answerText: "Fake response from assistant-side-query-surface-model"
      })

      const page = await reconnected.readSurfaceEvents({
        streamId: "side-query-test-stream",
        limit: 100
      })
      expect(page.ok).toBe(true)
      if (!page.ok) throw new Error("expected Surface event page")
      const invalidations = page.events.filter(
        (event) => event.type === "assistant.surface.side-query.invalidated"
      )
      expect(invalidations.map((event) => event.sideQuery?.cause)).toEqual([
        "started",
        "succeeded"
      ])
      expect(JSON.stringify(invalidations)).not.toContain(
        "surface-only temporary question"
      )
      expect(JSON.stringify(invalidations)).not.toContain("Fake response")

      const malformedClient = createSurfaceClient({
        ...transport,
        async dispatchSurfaceCommand(request) {
          const response = await transport.dispatchSurfaceCommand(request)
          return request.command === "readSideQuery" && response.ok
            ? { ...response, value: { broken: true } }
            : response
        }
      } as SurfaceClientTransport)
      await expect(
        malformedClient.readSideQuery({ queryId: started.value.queryId })
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "invalid_transport_response"
        }
      })
      await expect(
        client.readSideQuery({ queryId: "x".repeat(257) })
      ).resolves.toMatchObject({
        ok: false,
        error: {
          code: "validation_error"
        }
      })
      await expect(
        reconnected.dismissSideQuery({ queryId: started.value.queryId })
      ).resolves.toMatchObject({
        ok: true,
        value: {
          kind: "assistant.side-query.dismissed",
          queryId: started.value.queryId
        }
      })
      expect(
        await reconnected.readSideQuery({ queryId: started.value.queryId })
      ).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.side-query.missing"
        }
      })
      expect(JSON.stringify(observed)).not.toContain("Fake response")
    } finally {
      unsubscribe()
      await surface.dispose()
      await app.dispose()
    }
  })
})

type SideQueryRequest = WanexAppAskSideQueryRequest
type SideQueryAnswer = WanexAppAskSideQueryResult

function createCoordinatorFixture(
  askSideQuery: (request: SideQueryRequest) => Promise<SideQueryAnswer>
) {
  const state: {
    selection?: { kind: "session"; sessionId: string }
  } = {
    selection: { kind: "session", sessionId: "ses_side_query_one" }
  }
  let activeProviderId = "provider-one"
  let sessionStatus: "active" | "archived" = "active"
  let credentialConfigured = true
  return {
    state,
    setActiveProvider(value: string) {
      activeProviderId = value
    },
    setSessionStatus(value: "active" | "archived") {
      sessionStatus = value
    },
    setProviderCredentialConfigured(value: boolean) {
      credentialConfigured = value
    },
    backend: {
      commands: {
        async askSideQuery(request: SideQueryRequest) {
          return await askSideQuery(request)
        },
        async readSession(request: { readonly sessionId: string }) {
          return {
            kind: "wanex-app.session.found" as const,
            session: {
              sessionId: request.sessionId,
              title: request.sessionId,
              kind: "agent" as const,
              status: sessionStatus,
              revision: 1,
              createdAt: 1,
              updatedAt: 1
            }
          }
        },
        async listModelEndpoints() {
          const endpoint = assistantTestModelEndpoint({
            endpointId: activeProviderId,
            protocolId: "openai-chat-completions",
            providerId: "openai-compatible",
            modelId: `${activeProviderId}-model`
          })
          return {
            activeEndpointId: activeProviderId,
            endpoints: [
              {
                id: endpoint.id,
                connection: endpoint.connection,
                protocol: endpoint.protocol,
                model: endpoint.model,
                credentialConfigured,
                active: true
              }
            ]
          }
        }
      }
    }
  }
}

function defaultAnswer(): SideQueryAnswer {
  return {
    answerText: "side query answer",
    output: [],
    telemetry: {},
    persisted: false,
    modelEndpointId: "provider-one"
  }
}

async function readTerminal(
  coordinator: ReturnType<typeof createSideQueryCoordinator>,
  queryId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = coordinator.read({ queryId })
    if (result.kind === "assistant.side-query.found") {
      if (result.query.state !== "running") return result.query
    }
    await Promise.resolve()
  }
  throw new Error(`side query did not settle: ${queryId}`)
}

async function readShellTerminal(
  app: Awaited<ReturnType<typeof createShell>>,
  queryId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = app.readSideQuery({ queryId })
    if (result.kind === "assistant.side-query.found") {
      if (result.query.state !== "running") return result.query
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Assistant shell side query did not settle: ${queryId}`)
}

async function readClientTerminal(
  client: SurfaceClient,
  queryId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.readSideQuery({ queryId })
    if (
      result.ok &&
      result.value.kind === "assistant.side-query.found" &&
      result.value.query.state !== "running"
    ) {
      return result.value.query
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Surface side query did not settle: ${queryId}`)
}

function incrementingClock(): () => number {
  let now = 1_000
  return () => {
    now += 1
    return now
  }
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-assistant-side-query-"))
  tempDirs.push(dir)
  return dir
}

async function seedSession(storeDir: string, sessionId: string): Promise<void> {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
  try {
    await storage.createSession({
      id: sessionId,
      title: sessionId,
      kind: "agent"
    })
  } finally {
    await storage.dispose()
  }
}
