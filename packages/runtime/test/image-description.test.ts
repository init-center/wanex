import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { ToolResultContentPart } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { toolResultPart } from "../src/tools/index.js"
import {
  createModelCapabilityRouteExecutionBinding,
  IMAGE_UNDERSTANDING_REQUIREMENT,
  OpenAICompatibleAdapter,
  type ProviderAdapter,
  type ProviderEvent
} from "../src/provider/index.js"
import { prepareProviderReplayResources } from "../src/resources/index.js"
import { createImageDescriber } from "../src/resources/image-description.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const stores: StorageTestStore[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (stores.length > 0) await stores.pop()?.dispose()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("image describer", () => {
  it("replaces a tool-result image with one cached description for a text-only model", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-image-description-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent", storeDir, serviceBin })
    stores.push(storage)
    const image = await storage.ingestResource({
      content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      kind: "image",
      mediaType: "image/png",
      origin: "tool_output"
    })
    const content: readonly ToolResultContentPart[] = [{
      type: "resource",
      resourceId: image.id,
      sha256: image.sha256,
      sizeBytes: image.sizeBytes,
      kind: "image",
      mediaType: "image/png"
    }]
    const conversation = new OpenAICompatibleAdapter({
      providerId: "deepseek",
      model: testConversationModel("text-only"),
      baseUrl: "https://text.example/v1",
      apiKey: "secret"
    })
    const visionModel = testConversationModel("vision", { inputModalities: ["text", "image"] })
    const seen: unknown[] = []
    const vision: ProviderAdapter = {
      outputModalities: ["text"],
      providerId: "vision-provider",
      protocol: { id: "openai-chat-completions" },
      model: visionModel,
      async *stream(request: { readonly messages: unknown }): AsyncIterable<ProviderEvent> {
        seen.push(request.messages)
        yield { type: "text_delta", partId: "text_0", delta: "A blue square." }
        yield { type: "finish", reason: "stop" }
      },
      buildReplayMessages: () => []
    } as unknown as ProviderAdapter
    const describer = createImageDescriber({
      storage,
      route: createModelCapabilityRouteExecutionBinding({
        requirement: IMAGE_UNDERSTANDING_REQUIREMENT,
        source: "configured",
        modelEndpoint: {
          id: "vision-endpoint",
          connection: { id: "vision-connection", providerId: "vision-provider" },
          protocol: { id: "openai-chat-completions" },
          model: visionModel
        }
      }),
      provider: vision
    })
    const prepare = async () => await describer.describe(await prepareProviderReplayResources(
      storage,
      { protocol: conversation.protocol, inputModalities: conversation.model.inputModalities },
      [{ role: "tool", content: [toolResultPart("call_image", content, false)] }],
      { describedImages: true }
    ))

    const first = await prepare()
    const second = await prepare()

    expect(seen).toHaveLength(1)
    expect(first).toEqual(second)
    const wire = JSON.stringify(conversation.buildReplayMessages(first))
    expect(wire).toContain(`[image ${image.id}, described by vision because this model cannot see images]`)
    expect(wire).toContain("A blue square.")
    expect(wire).not.toContain("image_url")
  })
})
