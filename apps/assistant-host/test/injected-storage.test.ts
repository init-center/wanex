import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageHandle, type StorageHandle } from "@wanex/storage"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { wanexLocalCredentialNamespace } from "@wanex/local-credential-store"
import { startAssistantHost, type AssistantHost } from "../src/application/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const handles: StorageHandle[] = []
const hosts: AssistantHost[] = []

afterEach(async () => {
  while (hosts.length > 0) await hosts.pop()?.close()
  while (handles.length > 0) await handles.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Assistant Host injected storage ownership", () => {
  it("borrows the injected Store and uses its trusted credential namespace", async () => {
    const storeDir = await createTempDir()
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    handles.push(handle)
    const credentialStore = new MemorySecretStore()
    const credentialNamespace = wanexLocalCredentialNamespace(storeDir)
    const host = await startAssistantHost({
      storage: {
        kind: "injected",
        handle,
        credentialNamespace
      },
      serviceBin,
      credentialStore,
      modelEndpoint: fakeEndpoint()
    })
    hosts.push(host)

    await host.mcpSettings.stageCredential({
      serverId: "borrowed-server",
      transport: "streamable_http",
      name: "Authorization",
      value: "borrowed-secret"
    })
    expect(credentialStore.refs()).toHaveLength(1)
    expect(credentialStore.refs()[0]).toContain(
      `test-secret://${credentialNamespace}/`
    )

    await host.close()
    hosts.pop()

    await expect(
      handle.core.getConfig("assistant-host.borrowed-store-still-open")
    ).resolves.toBeNull()
  })

  it("rejects an invalid injected credential namespace", async () => {
    const storeDir = await createTempDir()
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    handles.push(handle)

    await expect(startAssistantHost({
      storage: {
        kind: "injected",
        handle,
        credentialNamespace: "profile-name-is-not-a-namespace"
      },
      serviceBin,
      credentialStore: new MemorySecretStore(),
      modelEndpoint: fakeEndpoint()
    })).rejects.toThrow(
      "credential namespace must be a 64-character lowercase hexadecimal hash"
    )

    await expect(
      handle.core.getConfig("assistant-host.invalid-namespace-store-still-open")
    ).resolves.toBeNull()
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-assistant-injected-"))
  tempDirs.push(dir)
  return dir
}

function fakeEndpoint() {
  return {
    id: "assistant-injected-storage",
    connection: { id: "assistant-injected-storage", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "assistant-injected-storage-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.test.assistant-injected-storage",
        revision: "1"
      }
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
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value
    })
  }

  refs(): readonly string[] {
    return [...this.#values.keys()].sort()
  }
}
