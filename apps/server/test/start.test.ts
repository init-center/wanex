import { join, resolve } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import type { BootstrappedWanexStorage } from "@wanex/runtime/bootstrap"
import type { AssistantHost } from "@wanex/assistant-host/application"
import type { CodingApplicationHost } from "@wanex/coding/host"
import {
  startWanexServerInternal
} from "../src/start.js"
import type {
  StartWanexServerOptions,
  WanexServer,
  WanexServerEndpoint
} from "../src/model.js"
import type { WanexServerListener } from "../src/listener.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const servers: WanexServer[] = []

afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Wanex Server ownership foundation", () => {
  it("owns one real Store and runs Assistant over its borrowed handle", async () => {
    const dataRoot = await createTempDir()
    const server = await startWanexServerInternal({
      ...serverOptions(dataRoot, "primary"),
      serviceBin,
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-assistant"
      }
    }, {
      listen: async () => fakeListener()
    })
    servers.push(server)

    expect(server.readStatus()).toEqual({
      kind: "wanex.server.status",
      state: "open",
      profileId: "primary",
      assistant: "ready",
      coding: "disabled",
      listener: "ready",
      endpoint: fakeEndpointAddress
    })
    expect(await server.assistantHost.shell.readHome()).toMatchObject({
      providerReadiness: {
        status: "ready",
        activeEndpointId: "server-assistant",
        canRun: true
      }
    })

    await server.close()
    await server.close()
    servers.pop()
    expect(server.readStatus()).toEqual({
      kind: "wanex.server.status",
      state: "closed",
      profileId: "primary",
      assistant: "closed",
      coding: "disabled",
      listener: "closed",
      endpoint: fakeEndpointAddress
    })
  })

  it("disposes the owned Store when Assistant startup fails", async () => {
    const events: string[] = []
    const runtime = fakeRuntime(events)

    await expect(startWanexServerInternal(
      serverOptions(await createTempDir()),
      {
        async bootstrapStorage() {
          events.push("bootstrap")
          return runtime
        },
        async startAssistant() {
          events.push("assistant-start")
          throw new Error("planned Assistant startup failure")
        }
      }
    )).rejects.toThrow("planned Assistant startup failure")

    expect(events).toEqual(["bootstrap", "assistant-start", "storage-dispose"])
  })

  it("closes Assistant before the Server-owned Store exactly once", async () => {
    const events: string[] = []
    const runtime = fakeRuntime(events)
    const assistant = fakeAssistant(events)
    const server = await startWanexServerInternal(
      serverOptions(await createTempDir()),
      {
        async bootstrapStorage() {
          events.push("bootstrap")
          return runtime
        },
        async startAssistant(options) {
          events.push("assistant-start")
          expect(options.storage.kind).toBe("injected")
          return assistant
        },
        listen: async () => fakeListener(events)
      }
    )
    servers.push(server)

    await server.close()
    await server.close()
    servers.pop()

    expect(events).toEqual([
      "bootstrap",
      "assistant-start",
      "listener-close",
      "listener-destroy",
      "assistant-close",
      "storage-dispose"
    ])
  })

  it("closes Assistant and Store when the TLS listener fails to start", async () => {
    const events: string[] = []
    const runtime = fakeRuntime(events)
    const assistant = fakeAssistant(events)

    await expect(startWanexServerInternal(
      serverOptions(await createTempDir()),
      {
        async bootstrapStorage() {
          events.push("bootstrap")
          return runtime
        },
        async startAssistant() {
          events.push("assistant-start")
          return assistant
        },
        async listen() {
          events.push("listener-start")
          throw new Error("planned listener failure")
        }
      }
    )).rejects.toThrow("planned listener failure")

    expect(events).toEqual([
      "bootstrap",
      "assistant-start",
      "listener-start",
      "assistant-close",
      "storage-dispose"
    ])
  })

  it("starts Coding over the borrowed Store and closes it before Assistant", async () => {
    const events: string[] = []
    const runtime = fakeRuntime(events)
    const assistant = fakeAssistant(events)
    const coding = fakeCoding(events)
    const dataRoot = await createTempDir()
    const server = await startWanexServerInternal({
      ...serverOptions(dataRoot),
      serviceBin: resolve("target/test-wanex-system-service"),
      config: {
        dataRoot,
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath: resolve("target/test-repository") }]
        }
      }
    }, {
      async bootstrapStorage() {
        events.push("bootstrap")
        return runtime
      },
      async startAssistant() {
        events.push("assistant-start")
        return assistant
      },
      async startCoding(options) {
        events.push("coding-start")
        expect(options.storage).toEqual({
          core: runtime.storage,
          transport: runtime.transport
        })
        expect(options.profileStoreDir).toContain("profiles/default")
        return coding
      },
      listen: async () => fakeListener(events)
    })
    servers.push(server)

    expect(server.readStatus()).toMatchObject({ coding: "ready" })
    await server.close()
    servers.pop()
    expect(events).toEqual([
      "bootstrap",
      "assistant-start",
      "coding-start",
      "listener-close",
      "listener-destroy",
      "coding-close",
      "assistant-close",
      "storage-dispose"
    ])
  })

  it("closes Assistant and Store when Coding startup fails", async () => {
    const events: string[] = []
    const runtime = fakeRuntime(events)
    const assistant = fakeAssistant(events)
    const dataRoot = await createTempDir()

    await expect(startWanexServerInternal({
      ...serverOptions(dataRoot),
      serviceBin: resolve("target/test-wanex-system-service"),
      config: {
        dataRoot,
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath: resolve("target/test-repository") }]
        }
      }
    }, {
      async bootstrapStorage() {
        events.push("bootstrap")
        return runtime
      },
      async startAssistant() {
        events.push("assistant-start")
        return assistant
      },
      async startCoding() {
        events.push("coding-start")
        throw new Error("planned Coding startup failure")
      }
    })).rejects.toThrow("planned Coding startup failure")

    expect(events).toEqual([
      "bootstrap",
      "assistant-start",
      "coding-start",
      "assistant-close",
      "storage-dispose"
    ])
  })
})

const fakeEndpointAddress: WanexServerEndpoint = Object.freeze({
  kind: "wanex.server.endpoint",
  transport: "https",
  hostname: "127.0.0.1",
  port: 9443,
  messageUrl: "https://127.0.0.1:9443/v1/agent-host/message"
})

function serverOptions(
  dataRoot: string,
  profileId = "default"
): StartWanexServerOptions {
  return {
    config: {
      dataRoot,
      profileId,
      listener: { hostname: "127.0.0.1", port: 0 }
    },
    authentication: {
      async authenticateBearerToken(token) {
        return token === "server-test-bearer"
          ? { subjectId: "server-test-subject", expiresAt: Date.now() + 60_000 }
          : null
      }
    },
    tls: { key: "test-key", cert: "test-cert" }
  }
}

function fakeListener(events?: string[]): WanexServerListener {
  let closePromise: Promise<void> | undefined
  return Object.freeze({
    endpoint: fakeEndpointAddress,
    close() {
      closePromise ??= Promise.resolve().then(() => {
        events?.push("listener-close")
      })
      return closePromise
    },
    destroyConnections() {
      events?.push("listener-destroy")
    }
  })
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-server-"))
  tempDirs.push(dir)
  return dir
}

function fakeEndpoint() {
  return {
    id: "server-assistant",
    connection: { id: "server-assistant", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "server-assistant-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.server.test",
        revision: "1"
      }
    }
  }
}

function fakeRuntime(events: string[]): BootstrappedWanexStorage {
  return {
    storage: {} as BootstrappedWanexStorage["storage"],
    transport: {} as BootstrappedWanexStorage["transport"],
    artifacts: {},
    async dispose() {
      events.push("storage-dispose")
    }
  }
}

function fakeAssistant(events: string[]): AssistantHost {
  return {
    shell: {} as AssistantHost["shell"],
    surface: {} as AssistantHost["surface"],
    teamConversations: {} as AssistantHost["teamConversations"],
    schedules: {} as AssistantHost["schedules"],
    modelEndpoints: {} as AssistantHost["modelEndpoints"],
    secretResolver: {} as AssistantHost["secretResolver"],
    mcpSettings: {} as AssistantHost["mcpSettings"],
    attachments: {} as AssistantHost["attachments"],
    resourceDeliveries: {} as AssistantHost["resourceDeliveries"],
    async close() {
      events.push("assistant-close")
    }
  }
}

function fakeCoding(events: string[]): CodingApplicationHost {
  return {
    application: {} as CodingApplicationHost["application"],
    openProject: async () => {
      throw new Error("fake Coding project is unavailable")
    },
    readDiagnostics: async () => ({
      state: "open",
      repositories: []
    }),
    async close() {
      events.push("coding-close")
    }
  }
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  readonly #values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.#values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.#values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.#values.get(ref)
    if (value === undefined) throw new Error("test secret is not configured")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}
