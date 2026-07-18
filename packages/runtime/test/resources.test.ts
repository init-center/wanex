import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  providerOutputToIngestRequest,
  resourceToContextSummary,
  resourceToMessagePart,
  resourceToProviderInput,
  resourceToUiDescriptor,
  resourcesToArtifactBundle,
  sha256Bytes,
  stableResourceLogicalPath,
  WanexResourceRuntime
} from "../src/resources/index.js"

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

describe("@wanex/runtime/resources", () => {
  it("normalizes and ingests base64 model image outputs", async () => {
    const client = await createClient()
    const runtime = new WanexResourceRuntime({ storage: client })
    const bytes = Buffer.from("fake-png")

    const record = await runtime.ingestProviderOutput({
      kindOfOutput: "base64",
      data: bytes.toString("base64"),
      mediaType: "image/png",
      provider: "openai",
      label: "generated image",
      metadata: { prompt: "small square" },
      width: 2,
      height: 3
    })

    expect(record).toMatchObject({
      kind: "image",
      origin: "model_output",
      mediaType: "image/png",
      label: "generated image",
      metadata: { prompt: "small square" },
      width: 2,
      height: 3
    })
    expect(record.logicalPath).toBe(
      stableResourceLogicalPath("image", bytes, "image/png")
    )
    await expect(
      readFile(join(client.storeDir, "files", record.logicalPath), "utf8")
    ).resolves.toBe("fake-png")
  })

  it("normalizes inline tool bytes as log resources", async () => {
    const client = await createClient()
    const runtime = new WanexResourceRuntime({ storage: client })
    const bytes = new TextEncoder().encode("test output\n")

    const record = await runtime.ingestProviderOutput({
      kindOfOutput: "inline_bytes",
      bytes,
      mediaType: "text/plain",
      kind: "log",
      origin: "tool_output",
      label: "test log"
    })

    expect(record.kind).toBe("log")
    expect(record.origin).toBe("tool_output")
    expect(record.mediaType).toBe("text/plain")
    expect(record.logicalPath).toBe(
      stableResourceLogicalPath("log", bytes, "text/plain")
    )
    await expect(
      readFile(join(client.storeDir, "files", record.logicalPath), "utf8")
    ).resolves.toBe("test output\n")
  })

  it("records provider-file references without provider-specific shape leaks", async () => {
    const client = await createClient()
    const runtime = new WanexResourceRuntime({ storage: client })

    const record = await runtime.ingestProviderOutput({
      kindOfOutput: "provider_file",
      provider: "openai",
      fileId: "file_123",
      mediaType: "image/png",
      origin: "provider_file",
      label: "provider hosted image"
    })

    expect(record.kind).toBe("image")
    expect(record.origin).toBe("provider_file")
    expect(record.source).toEqual({
      provider: "openai",
      providerFileId: "file_123"
    })
    const placeholder = await readFile(
      join(client.storeDir, "files", record.logicalPath),
      "utf8"
    )
    expect(placeholder).toBe("provider file reference: openai/file_123\n")
  })

  it("requires provider identity for provider-owned references", () => {
    expect(() =>
      providerOutputToIngestRequest({
        kindOfOutput: "provider_file",
        fileId: "file_missing_provider"
      })
    ).toThrow("provider is required")

    expect(() =>
      providerOutputToIngestRequest({
        kindOfOutput: "async_operation",
        operationId: "op_missing_provider"
      })
    ).toThrow("provider is required")
  })

  it("uses stable sha256 based paths for identical content", () => {
    const bytes = new TextEncoder().encode("stable")
    expect(stableResourceLogicalPath("artifact", bytes)).toBe(
      `resources/artifact/${sha256Bytes(bytes)}`
    )
    expect(stableResourceLogicalPath("image", bytes, "image/webp")).toBe(
      `resources/image/${sha256Bytes(bytes)}.webp`
    )
  })

  it("projects resources to message parts and UI descriptors without paths", () => {
    const resource = resourceRecord({
      id: "res_image_projection",
      logicalPath: "resources/image/private.png",
      kind: "image",
      mediaType: "image/png",
      label: "preview",
      width: 640,
      height: 480
    })

    expect(resourceToMessagePart(resource)).toEqual({
      type: "resource",
      id: "resource_res_image_projection",
      resourceId: "res_image_projection",
      mediaType: "image/png"
    })
    expect(resourceToUiDescriptor(resource)).toEqual({
      resourceId: "res_image_projection",
      kind: "image",
      previewKind: "image",
      label: "preview",
      mediaType: "image/png",
      sizeBytes: 12,
      sha256: "sha256",
      width: 640,
      height: 480,
      state: "available",
      origin: "model_output"
    })
    expect(JSON.stringify(resourceToUiDescriptor(resource))).not.toContain(
      "private.png"
    )
  })

  it("projects provider-owned and remote resources for multimodal inputs", () => {
    const providerFile = resourceRecord({
      id: "res_provider_file",
      kind: "image",
      mediaType: "image/png",
      source: {
        provider: "openai",
        providerFileId: "file_123"
      }
    })
    const remote = resourceRecord({
      id: "res_remote_video",
      kind: "video",
      mediaType: "video/mp4",
      durationMs: 1_000,
      source: {
        sourceUrl: "https://cdn.example/video.mp4",
        sourceExpiresAt: 123
      }
    })
    const local = resourceRecord({
      id: "res_local_audio",
      kind: "audio",
      mediaType: "audio/mpeg",
      durationMs: 2_000
    })

    expect(resourceToProviderInput(providerFile)).toEqual({
      resourceId: "res_provider_file",
      kind: "image",
      mediaType: "image/png",
      sourceKind: "provider_file",
      provider: "openai",
      providerFileId: "file_123"
    })
    expect(resourceToProviderInput(remote)).toEqual({
      resourceId: "res_remote_video",
      kind: "video",
      mediaType: "video/mp4",
      durationMs: 1_000,
      sourceKind: "remote_url",
      url: "https://cdn.example/video.mp4",
      expiresAt: 123
    })
    expect(resourceToProviderInput(local)).toEqual({
      resourceId: "res_local_audio",
      kind: "audio",
      mediaType: "audio/mpeg",
      durationMs: 2_000,
      sourceKind: "local_resource",
      sha256: "sha256",
      sizeBytes: 12
    })
  })

  it("creates compact context summaries and artifact bundles", () => {
    const patch = resourceRecord({
      id: "res_patch",
      kind: "patch",
      mediaType: "text/x-diff",
      label: "workspace patch"
    })
    const log = resourceRecord({
      id: "res_log",
      kind: "log",
      mediaType: "text/plain",
      label: "test log"
    })

    expect(resourceToContextSummary(patch)).toMatchObject({
      resourceId: "res_patch",
      text: "[resource: workspace patch, text/x-diff, 12 bytes, resourceId=res_patch]",
      tokenEstimate: expect.any(Number)
    })
    expect(resourcesToArtifactBundle([patch, log])).toMatchObject({
      resources: [
        {
          resourceId: "res_patch",
          previewKind: "patch"
        },
        {
          resourceId: "res_log",
          previewKind: "log"
        }
      ],
      providerInputs: [
        {
          resourceId: "res_patch",
          sourceKind: "local_resource"
        },
        {
          resourceId: "res_log",
          sourceKind: "local_resource"
        }
      ],
      contextSummaries: [
        {
          resourceId: "res_patch"
        },
        {
          resourceId: "res_log"
        }
      ]
    })
  })
})

function resourceRecord(
  override: Partial<Parameters<typeof resourceToUiDescriptor>[0]>
): Parameters<typeof resourceToUiDescriptor>[0] {
  return {
    id: "res",
    logicalPath: "resources/artifact/res",
    kind: "artifact",
    origin: "model_output",
    state: "available",
    sizeBytes: 12,
    sha256: "sha256",
    createdAt: 1,
    updatedAt: 1,
    ...override
  }
}

async function createClient(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-resource-runtime-"))
  tempDirs.push(storeDir)
  await mkdir(storeDir, { recursive: true })
  const client = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(client)
  return client
}
