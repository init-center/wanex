import { createHash } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { crc32, deflateSync } from "node:zlib"
import { afterEach, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { prepareProviderReplayResources } from "../src/resources/input.js"
import { providerInputResources } from "../src/execution/core/provider-response.js"
import { resourceLabel, toolResultResourceDescriptor } from "../src/provider/replay.js"
import { toolResultPart } from "../src/tools/parts.js"
import { WanexMediaGenerationRuntime } from "../src/media-generation/runtime.js"
import type { MediaGenerationSubmitRequest } from "../src/media-generation/types.js"
import { modelEndpointExecutionBinding } from "../src/provider/model-endpoint.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

const stores: StorageTestStore[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) await store.dispose()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function store(mode: "persistent" | "oneshot") {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-image-preparation-"))
  dirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode, storeDir,
    serviceBin: join(import.meta.dirname, `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`) })
  stores.push(storage)
  return storage
}

it.each(["persistent", "oneshot"] as const)("%s prepares a derived input without changing history or tool reference identity", async (mode) => {
  const storage = await store(mode)
  const original = await storage.ingestResource({ content: widePng(), kind: "image", mediaType: "image/png", origin: "user_upload" })
  const part = { type: "resource" as const, id: "image", resourceId: original.id, sha256: original.sha256,
    sizeBytes: original.sizeBytes, kind: "image" as const, mediaType: "image/png" }
  const messages = [{ role: "user" as const, content: [part] }]
  const provider = { protocol: { id: "openai-chat-completions" as const }, inputModalities: ["image" as const] }
  const prepared = await prepareProviderReplayResources(storage, provider, messages)
  const image = prepared[0]!.content[0]!
  if (image.type !== "resource") throw new Error("expected prepared image")
  expect(image.resourceId).not.toBe(original.id)
  expect(image.originalResource?.resourceId).toBe(original.id)
  expect(resourceLabel(image)).toBe(`[image ${original.id}]`)
  expect(toolResultResourceDescriptor(image).resourceId).toBe(original.id)
  expect(createHash("sha256").update(image.bytes).digest("hex")).toBe(image.sha256)
  expect(image.bytes.byteLength).toBe(image.sizeBytes)
  expect(providerInputResources(prepared)).toMatchObject([{ resourceId: image.resourceId, sha256: image.sha256 }])
  expect(messages[0]!.content[0]).toEqual(part)
  expect(await storage.getResource({ resourceId: original.id })).toEqual(original)
  const derivative = await storage.getResource({ resourceId: image.resourceId })
  expect(derivative).toMatchObject({ width: 4096, height: 1 })
  const provenance = await storage.listResourceProvenance({ resourceId: image.resourceId })
  expect(provenance).toMatchObject([{ cause: { kind: "image_normalization" }, inputResources: [{ resourceId: original.id }] }])
  expect(await prepareProviderReplayResources(storage, provider, messages)).toEqual(prepared)
  const tool = await prepareProviderReplayResources(storage, provider, [{ role: "tool", content: [toolResultPart("call", [part], false)] }])
  const toolPart = tool[0]!.content[0]!
  if (toolPart.type !== "tool_result" || toolPart.content[0]?.type !== "resource") throw new Error("expected image tool result")
  expect(toolPart.content[0].resourceId).toBe(image.resourceId)
  expect(resourceLabel(toolPart.content[0])).toBe(`[image ${original.id}]`)
})

it("keeps signed Gemini replay bytes exact even when the image exceeds the normalization edge", async () => {
  const storage = await store("persistent")
  const bytes = widePng()
  const original = await storage.ingestResource({ content: bytes, kind: "image", mediaType: "image/png", origin: "model_output" })
  const part = { type: "resource" as const, id: "image", resourceId: original.id, sha256: original.sha256,
    sizeBytes: original.sizeBytes, kind: "image" as const, mediaType: "image/png" }
  const prepared = await prepareProviderReplayResources(storage, {
    providerId: "gemini", modelId: "test", protocol: { id: "gemini-generate-content" }, inputModalities: ["image"]
  }, [{ role: "assistant", content: [part], providerState: [{ providerId: "gemini", modelId: "test",
    stateKind: "opaque", replayPolicy: "required", payload: { protocol: "gemini-generate-content", partId: "image", signature: "opaque" } }] }])
  const image = prepared[0]!.content[0]!
  if (image.type !== "resource") throw new Error("expected preserved image")
  expect(image.resourceId).toBe(original.id)
  expect(image.bytes).toEqual(new Uint8Array(bytes))
  expect(image.originalResource).toBeUndefined()
  expect(await storage.listResourceProvenance({ causeKind: "image_normalization" })).toEqual([])
})

it("rejects corrupt input before provider preparation, without creating provenance", async () => {
  const storage = await store("persistent")
  const original = await storage.ingestResource({ content: Buffer.from("not an image"), kind: "image", mediaType: "image/png", origin: "user_upload" })
  await expect(storage.prepareImageResource({ resource: { resourceId: original.id, sha256: original.sha256,
    sizeBytes: original.sizeBytes, kind: "image", mediaType: "image/png" }, mode: "normalize" })).rejects.toThrow("corrupt")
  expect(await storage.listResourceProvenance({ causeKind: "image_normalization" })).toEqual([])
})

it("freezes the normalized reference before media admission and sends those exact bytes", async () => {
  const storage = await store("persistent")
  const original = await storage.ingestResource({ content: widePng(), kind: "image", mediaType: "image/png", origin: "user_upload" })
  let submitted: MediaGenerationSubmitRequest | undefined
  const endpoint = { id: "fixture", connection: { id: "fixture", providerId: "fixture" }, protocol: { id: "fixture" },
    model: { ...testConversationModel("image"), operations: ["image.generate" as const], inputModalities: ["text" as const, "image" as const],
      outputModalities: ["image" as const], features: [] } }
  const runtime = new WanexMediaGenerationRuntime({ storage, workerId: "image-preparation", adapters: [{
    protocolId: "fixture", canExecute: () => true,
    async submit(request) { submitted = request; return { status: "rejected", error: "fixture stops after capture" } },
    async poll() { throw new Error("synchronous fixture must not poll") }
  }] })
  const admitted = await runtime.submit({ operation: "image.generate", modelEndpoint: modelEndpointExecutionBinding(endpoint),
    inputResourceIds: [original.id], prompt: "use this reference", outputModality: "image" })
  const frozen = admitted.operation.binding.request.inputResources[0]!
  expect(frozen.resourceId).not.toBe(original.id)
  await runtime.runOnce()
  expect(submitted?.inputs[0]?.resource).toEqual(frozen)
  expect(createHash("sha256").update(submitted!.inputs[0]!.bytes).digest("hex")).toBe(frozen.sha256)
  expect((await runtime.get(admitted.operation.id))?.binding).toEqual(admitted.operation.binding)
  expect(await storage.listResourceProvenance({ resourceId: frozen.resourceId })).toMatchObject([
    { inputResources: [{ resourceId: original.id }] }
  ])
})

function widePng(): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(8192, 0)
  header.writeUInt32BE(2, 4)
  header[8] = 8
  header[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(8192 * 4, 127)])
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat([row, row]))), chunk("IEND", Buffer.alloc(0))])
}
