import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { IngestResourceRequest, ResourceRecord } from "@wanex/protocol"
import {
  NativeExecutionEnvironment,
  type BorrowedExecutionScope,
  type ExecutionEnvironment,
  type ExecutionFileSystem,
  type ExecutionScope
} from "../src/execution/index.js"
import {
  sha256Bytes,
  WanexResourceRuntime
} from "../src/resources/index.js"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const clients: StorageTestStore[] = []
const environments = new Set<ExecutionEnvironment>()

afterEach(async () => {
  await Promise.allSettled(
    [...environments].map(async (environment) => await environment.close())
  )
  environments.clear()
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("environment artifact export", () => {
  it("ingests exact regular-file bytes without persisting the physical path", async () => {
    const client = await createClient()
    const { rootDir, scope } = await createScope()
    const physicalPath = join(rootDir, "generated-report.txt")
    const bytes = new TextEncoder().encode("verified artifact\n")
    await writeFile(physicalPath, bytes)
    const runtime = new WanexResourceRuntime({ storage: client })

    const resource = await runtime.exportEnvironmentFile(scope, {
      path: physicalPath,
      maxBytes: 1_024,
      expectedSha256: sha256Bytes(bytes),
      kind: "log",
      origin: "tool_output",
      mediaType: "text/plain",
      label: "test report"
    })

    expect(resource).toMatchObject({
      kind: "log",
      origin: "tool_output",
      state: "available",
      mediaType: "text/plain",
      label: "test report",
      sizeBytes: bytes.byteLength,
      sha256: sha256Bytes(bytes)
    })
    expect(resource.logicalPath).toMatch(/^resources\/log\/[a-f0-9]{64}$/u)
    expect(resource.source).toBeUndefined()
    expect(resource.metadata).toBeUndefined()
    expect(JSON.stringify(resource)).not.toContain(physicalPath)
    await expect(
      readFile(join(client.storeDir, "files", resource.logicalPath), "utf8")
    ).resolves.toBe("verified artifact\n")
  })

  it.each([
    ["missing", null, /does not exist/],
    ["directory", { kind: "directory", size: 0, modifiedAt: 1 }, /not a regular file: directory/],
    ["symlink", { kind: "symlink", size: 12, modifiedAt: 1 }, /not a regular file: symlink/]
  ] as const)("rejects a %s artifact before reading", async (_label, metadata, error) => {
    const { scope } = await createScope()
    let reads = 0
    const runtime = runtimeThatMustNotIngest()
    const guarded = withFileSystem(scope, {
      metadata: async () => metadata,
      read: async () => {
        reads += 1
        return new Uint8Array()
      }
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/artifact",
        maxBytes: 1_024
      })
    ).rejects.toThrow(error)
    expect(reads).toBe(0)
  })

  it("rejects oversized metadata before reading or ingesting", async () => {
    const { scope } = await createScope()
    let reads = 0
    const runtime = runtimeThatMustNotIngest()
    const guarded = withFileSystem(scope, {
      metadata: async () => ({ kind: "file", size: 1_025, modifiedAt: 1 }),
      read: async () => {
        reads += 1
        return new Uint8Array(1_025)
      }
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/large",
        maxBytes: 1_024
      })
    ).rejects.toThrow(/exceeds 1024 byte limit/)
    expect(reads).toBe(0)
  })

  it("rejects returned bytes that exceed the caller limit", async () => {
    const { scope } = await createScope()
    const runtime = runtimeThatMustNotIngest()
    const guarded = withFileSystem(scope, {
      metadata: async () => ({ kind: "file", size: 3, modifiedAt: 1 }),
      read: async () => new Uint8Array(4)
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/growing",
        maxBytes: 3
      })
    ).rejects.toThrow(/exceeds 3 byte limit/)
  })

  it("rejects files whose observed metadata changes during the read", async () => {
    const { scope } = await createScope()
    const runtime = runtimeThatMustNotIngest()
    let metadataCalls = 0
    const guarded = withFileSystem(scope, {
      metadata: async () => {
        metadataCalls += 1
        return {
          kind: "file",
          size: metadataCalls === 1 ? 3 : 4,
          modifiedAt: metadataCalls
        }
      },
      read: async () => new Uint8Array(3)
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/changing",
        maxBytes: 10
      })
    ).rejects.toThrow(/changed while being exported/)
  })

  it("rejects digest mismatches before ingesting", async () => {
    const { scope } = await createScope()
    const runtime = runtimeThatMustNotIngest()
    const guarded = withFileSystem(scope, {
      metadata: async () => ({ kind: "file", size: 3, modifiedAt: 1 }),
      read: async () => new Uint8Array([1, 2, 3])
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/digest",
        maxBytes: 10,
        expectedSha256: "0".repeat(64)
      })
    ).rejects.toThrow(/sha256 does not match/)
  })

  it("rejects unsupported providers before filesystem access", async () => {
    const { scope } = await createScope()
    let metadataCalls = 0
    const runtime = runtimeThatMustNotIngest()
    const denied: BorrowedExecutionScope = {
      ...scope,
      binding: {
        ...scope.binding,
        capabilities: {
          ...scope.binding.capabilities,
          artifactExport: { supported: false }
        }
      },
      fileSystem: withFileSystem(scope, {
        metadata: async () => {
          metadataCalls += 1
          return null
        }
      }).fileSystem
    }

    await expect(
      runtime.exportEnvironmentFile(denied, {
        path: "/virtual/denied",
        maxBytes: 10
      })
    ).rejects.toThrow(/does not support artifact export/)
    expect(metadataCalls).toBe(0)
  })

  it("enforces the runtime hard ceiling before filesystem access", async () => {
    const { scope } = await createScope()
    let metadataCalls = 0
    const runtime = runtimeThatMustNotIngest()
    const guarded = withFileSystem(scope, {
      metadata: async () => {
        metadataCalls += 1
        return null
      }
    })

    await expect(
      runtime.exportEnvironmentFile(guarded, {
        path: "/virtual/too-large",
        maxBytes: 50 * 1024 * 1024 + 1
      })
    ).rejects.toThrow(/exceeds 52428800 byte runtime limit/)
    expect(metadataCalls).toBe(0)
  })

  it("cannot export through a closed scope", async () => {
    const { rootDir, scope } = await createScope()
    const physicalPath = join(rootDir, "closed.txt")
    await writeFile(physicalPath, "closed")
    await scope.close()
    const runtime = runtimeThatMustNotIngest()

    await expect(
      runtime.exportEnvironmentFile(scope, {
        path: physicalPath,
        maxBytes: 100
      })
    ).rejects.toThrow(/execution scope is closed/i)
  })
})

async function createClient(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-artifact-store-"))
  tempDirs.push(storeDir)
  await mkdir(storeDir, { recursive: true })
  const client = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(client)
  return client
}

async function createScope(): Promise<{
  readonly rootDir: string
  readonly scope: ExecutionScope
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "wanex-artifact-scope-"))
  tempDirs.push(rootDir)
  const environment = new NativeExecutionEnvironment({
    environmentId: `native_artifact_test_${environments.size + 1}`,
    strategy: { kind: "direct" }
  })
  environments.add(environment)
  const scope = await environment.bind({
    scopeId: `artifact_test_${environments.size}`,
    policy: {
      revision: 1,
      filesystem: {
        roots: [{ id: "artifact", effects: ["read"] }],
        maxReadBytes: 50 * 1024 * 1024,
        maxDirectoryEntries: 1_000
      },
      process: {
        oneShot: false,
        managed: false,
        cleanup: "runtime_process_tree",
        environmentVariables: []
      },
      network: "unrestricted",
      isolation: "none",
      pty: false
    },
    fileSystemRoots: [{ id: "artifact", path: rootDir }]
  })
  return { rootDir, scope }
}

function withFileSystem(
  scope: BorrowedExecutionScope,
  overrides: Partial<ExecutionFileSystem>
): BorrowedExecutionScope {
  return {
    ...scope,
    fileSystem: {
      ...scope.fileSystem,
      ...overrides
    }
  }
}

function runtimeThatMustNotIngest(): WanexResourceRuntime {
  return new WanexResourceRuntime({
    storage: {
      async ingestResource(
        _request: IngestResourceRequest
      ): Promise<ResourceRecord> {
        throw new Error("unexpected resource ingest")
      }
    }
  })
}
