import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  ResourceInputEvidence,
  ResourceRecord,
  ToolResultContentPart
} from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  toolResultPart,
  ToolRegistry,
  type ToolDefinition
} from "../src/tools/index.js"
import {
  AnthropicAdapter,
  OpenAICompatibleAdapter
} from "../src/provider/index.js"
import { prepareProviderReplayResources } from "../src/resources/index.js"
import { createStartedTurn } from "./durable-turn-test-fixture.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const stores: StorageTestStore[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (stores.length > 0) await stores.pop()?.dispose()
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("resource-bearing Tool results", () => {
  it("publishes exact provenance, reuses settlement, and references without false provenance", async () => {
    const { storage } = await createStore("wanex-tool-resource-")
    const input = await storage.ingestResource({
      content: Uint8Array.from([9, 8, 7]),
      kind: "image",
      mediaType: "image/png",
      origin: "user_upload"
    })
    const fixture = await createStartedTurn(storage, { suffix: "tool_resource" })
    const source = await fixture.session.appendMessage({
      ...fixture.execution,
      role: "assistant",
      idempotencyKey: "tool-resource:source",
      content: [
        toolCall("call_publish", "publish_image"),
        toolCall("call_reference", "reference_image")
      ]
    })
    if (source === null) throw new Error("failed to append Tool source message")

    let publishedResourceId: string | undefined
    let publishInvocations = 0
    const registry = new ToolRegistry()
    registry.register(tool("publish_image", async (invocation) => {
      publishInvocations += 1
      const resource = await invocation.resources.publish({
        content: Uint8Array.from([1, 2, 3, 4]),
        kind: "image",
        mediaType: "image/png",
        inputResourceIds: [input.id]
      })
      publishedResourceId = resource.resourceId
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: [
          { type: "text", text: "created image" },
          ...jsonToolResultContent({ width: 1, height: 1 }),
          resource
        ]
      }
    }))
    registry.register(tool("reference_image", async (invocation) => ({
      outcome: "succeeded",
      toolCallId: invocation.toolCallId,
      content: [await invocation.resources.reference(requirePublishedId())]
    })))

    const publishRequest = executionRequest(
      fixture.execution,
      storage,
      source.id,
      "call_publish",
      "publish_image"
    )
    const published = await registry.execute(publishRequest)
    expect(published).toMatchObject({
      state: "completed",
      invoked: true,
      result: {
        isError: false,
        content: [
          { type: "text", text: "created image" },
          { type: "json", value: { width: 1, height: 1 } },
          { type: "resource", resourceId: expect.any(String) }
        ],
        contentDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    })
    const reused = await registry.execute(publishRequest)
    expect(reused).toMatchObject({ state: "completed", invoked: false })
    expect(publishInvocations).toBe(1)
    expect(reused.state === "completed" && published.state === "completed"
      ? reused.result
      : undefined).toEqual(
      published.state === "completed" ? published.result : undefined
    )

    const [publishExecution] = await storage.listToolExecutions({
      turnId: fixture.execution.turnId
    })
    if (publishExecution === undefined) throw new Error("missing publish execution")
    const publishProvenance = await storage.listResourceProvenance({
      causeKind: "tool_execution",
      causeId: publishExecution.id
    })
    expect(publishProvenance).toHaveLength(1)
    expect(publishProvenance[0]).toMatchObject({
      resource: { resourceId: requirePublishedId() },
      cause: {
        executionId: publishExecution.id,
        sessionId: fixture.execution.sessionId,
        turnId: fixture.execution.turnId,
        sourceMessageId: source.id,
        toolCallId: "call_publish"
      },
      inputResources: [{ resourceId: input.id, sha256: input.sha256 }]
    })

    const referenced = await registry.execute(executionRequest(
      fixture.execution,
      storage,
      source.id,
      "call_reference",
      "reference_image"
    ))
    expect(referenced).toMatchObject({
      state: "completed",
      result: { content: [{ resourceId: requirePublishedId() }] }
    })
    const referenceExecution = (await storage.listToolExecutions({
      turnId: fixture.execution.turnId
    })).find((execution) => execution.toolCallId === "call_reference")
    if (referenceExecution === undefined) throw new Error("missing reference execution")
    await expect(storage.listResourceProvenance({
      causeKind: "tool_execution",
      causeId: referenceExecution.id
    })).resolves.toEqual([])

    function requirePublishedId(): string {
      if (publishedResourceId === undefined) throw new Error("resource was not published")
      return publishedResourceId
    }
  })

  it("lowers ordered Tool resources per provider and rejects changed native bytes", async () => {
    const { storage, storeDir } = await createStore("wanex-tool-replay-")
    const resource = await storage.ingestResource({
      content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      kind: "image",
      mediaType: "image/png",
      origin: "tool_output"
    })
    const resultContent: readonly ToolResultContentPart[] = [
        { type: "text" as const, text: "created" },
        { type: "json" as const, value: { ok: true } },
        {
          type: "resource" as const,
          resourceId: resource.id,
          sha256: resource.sha256,
          sizeBytes: resource.sizeBytes,
          kind: resource.kind,
          ...(resource.mediaType === undefined
            ? {}
            : { mediaType: resource.mediaType })
        }
      ]
    const message = {
      role: "tool" as const,
      content: [toolResultPart("call_media", resultContent, false)]
    }

    const openAI = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("openai-tool-resource", {
        inputModalities: ["text", "image"]
      }),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })
    const openAIPrepared = await prepareProviderReplayResources(
      storage,
      {
        protocol: openAI.protocol,
        inputModalities: openAI.model.inputModalities
      },
      [message]
    )
    const openAIWire = openAI.buildReplayMessages(openAIPrepared)
    expect(openAIWire).toHaveLength(2)
    expect(openAIWire[0]).toMatchObject({
      role: "tool",
      tool_call_id: "call_media"
    })
    expect(JSON.stringify(openAIWire[0])).not.toContain(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64").toString("base64"))
    expect(JSON.stringify(openAIWire[0])).toContain(resource.sha256)
    // Chat Completions tool messages cannot hold images; the pixels follow.
    expect(openAIWire[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Images returned by the tool calls above:" },
        { type: "text", text: `Tool call call_media returned [image ${resource.id}]` },
        { type: "image_url", image_url: { url: `data:image/png;base64,${Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64").toString("base64")}` } }
      ]
    })

    const textOnly = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("openai-text-only-tool-resource", {
        inputModalities: ["text"]
      }),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })
    const textOnlyWire = textOnly.buildReplayMessages(await prepareProviderReplayResources(
      storage,
      { protocol: textOnly.protocol, inputModalities: textOnly.model.inputModalities },
      [message]
    ))
    expect(textOnlyWire).toHaveLength(1)
    expect(JSON.stringify(textOnlyWire)).not.toContain(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64").toString("base64"))

    const secondMessage = {
      role: "tool" as const,
      content: [toolResultPart("call_media_second", resultContent, false)]
    }
    const blockWire = openAI.buildReplayMessages(await prepareProviderReplayResources(
      storage,
      { protocol: openAI.protocol, inputModalities: openAI.model.inputModalities },
      [message, secondMessage, { role: "assistant" as const, content: [{ type: "text" as const, id: "answer", text: "done" }] }]
    ))
    expect(blockWire.map((entry) => (entry as { role: string }).role))
      .toEqual(["tool", "tool", "user", "assistant"])
    expect(JSON.stringify(blockWire[2]).match(/"type":"image_url"/gu)).toHaveLength(2)

    const anthropic = new AnthropicAdapter({
      providerId: "anthropic",
      model: testConversationModel("anthropic-tool-resource", {
        inputModalities: ["text", "image"]
      }),
      baseUrl: "https://api.anthropic.example/v1",
      apiKey: "secret"
    })
    const anthropicPrepared = await prepareProviderReplayResources(
      storage,
      {
        protocol: anthropic.protocol,
        inputModalities: anthropic.model.inputModalities
      },
      [message]
    )
    expect(anthropic.buildReplayMessages(anthropicPrepared)).toMatchObject([{
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "call_media",
        content: [
          { type: "text", text: "created" },
          { type: "text", text: '{"ok":true}' },
          { type: "text", text: `[image ${resource.id}]` },
          {
            type: "image",
            source: { media_type: "image/png", data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64").toString("base64") }
          }
        ]
      }]
    }])

    await writeFile(
      join(storeDir, "files", resource.logicalPath),
      new Uint8Array(resource.sizeBytes)
    )
    await expect(prepareProviderReplayResources(
      storage,
      {
        protocol: anthropic.protocol,
        inputModalities: anthropic.model.inputModalities
      },
      [message]
    )).rejects.toThrow("image content hash changed")
  })

  it("projects each OpenAI Tool result as its own message and rejects digest drift", async () => {
    const { storage } = await createStore("wanex-tool-openai-replay-")
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("openai-multiple-tool-results"),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })
    const first = toolResultPart("call_first", jsonToolResultContent({ first: true }), false)
    const second = toolResultPart("call_second", [{ type: "text", text: "second" }], false)
    const message = { role: "tool" as const, content: [first, second] }
    const prepared = await prepareProviderReplayResources(
      storage,
      {
        protocol: adapter.protocol,
        inputModalities: adapter.model.inputModalities
      },
      [message]
    )

    expect(adapter.buildReplayMessages(prepared)).toMatchObject([
      { role: "tool", tool_call_id: "call_first" },
      { role: "tool", tool_call_id: "call_second" }
    ])
    await expect(prepareProviderReplayResources(
      storage,
      {
        protocol: adapter.protocol,
        inputModalities: adapter.model.inputModalities
      },
      [{
        role: "tool",
        content: [{ ...first, contentDigest: "0".repeat(64) }]
      }]
    )).rejects.toThrow("tool result content digest mismatch: call_first")
  })

  it("uses metadata fallback for unsupported Anthropic Tool resources", async () => {
    const { storage } = await createStore("wanex-tool-anthropic-fallback-")
    const audio = await storage.ingestResource({
      content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
      kind: "audio",
      mediaType: "audio/mpeg",
      origin: "tool_output"
    })
    const adapter = new AnthropicAdapter({
      providerId: "anthropic",
      model: testConversationModel("anthropic-audio-fallback", {
        inputModalities: ["text", "image"]
      }),
      baseUrl: "https://api.anthropic.example/v1",
      apiKey: "secret"
    })
    const prepared = await prepareProviderReplayResources(
      storage,
      {
        protocol: adapter.protocol,
        inputModalities: adapter.model.inputModalities
      },
      [{
        role: "tool",
        content: [toolResultPart("call_audio", [resourceEvidence(audio)], false)]
      }]
    )
    const wire = adapter.buildReplayMessages(prepared)

    expect(wire).toMatchObject([{
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "call_audio",
        content: [{ type: "text", text: expect.stringContaining(audio.sha256) }]
      }]
    }])
    expect(JSON.stringify(wire)).not.toContain(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64").toString("base64"))
  })

  it("rejects aggregate Tool resource replay above 50 MiB before byte reads", async () => {
    const resources = [
      syntheticResource("resource_large_a", "a".repeat(64), 25 * 1024 * 1024),
      syntheticResource("resource_large_b", "b".repeat(64), 25 * 1024 * 1024),
      syntheticResource("resource_large_c", "c".repeat(64), 1)
    ]
    const records = new Map(resources.map((resource) => [resource.id, resource]))
    let byteReads = 0
    const storage = {
      async getResource(request: { readonly resourceId: string }) {
        return records.get(request.resourceId) ?? null
      },
      async readResourceContent() {
        byteReads += 1
        throw new Error("metadata-only replay must not read bytes")
      },
      async prepareImageResource() {
        throw new Error("metadata-only replay must not prepare images")
      }
    }
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("openai-aggregate-bound"),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })

    await expect(prepareProviderReplayResources(
      storage,
      {
        protocol: adapter.protocol,
        inputModalities: adapter.model.inputModalities
      },
      [{
        role: "tool",
        content: resources.map((resource, index) => toolResultPart(
          `call_large_${index}`,
          [resourceEvidence(resource)],
          false
        ))
      }]
    )).rejects.toThrow("provider replay resources exceed the 52428800 byte input limit")
    expect(byteReads).toBe(0)
  })
})

async function createStore(prefix: string): Promise<{
  readonly storage: StorageTestStore
  readonly storeDir: string
}> {
  const storeDir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(storage)
  await storage.doctor()
  return { storage, storeDir }
}

function toolCall(toolCallId: string, toolName: string) {
  return {
    type: "tool_call" as const,
    id: `part_${toolCallId}`,
    toolCallId,
    toolName,
    input: {}
  }
}

function tool(
  name: string,
  invoke: ToolDefinition["invoke"]
): ToolDefinition {
  return {
    name,
    description: `${name} test Tool`,
    inputSchema: { type: "object", additionalProperties: false },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.${name}`,
      implementationRevision: "1"
    }),
    invoke
  }
}

function executionRequest(
  execution: Awaited<ReturnType<typeof createStartedTurn>>["execution"],
  storage: StorageTestStore,
  sourceMessageId: string,
  toolCallId: string,
  toolName: string
) {
  return {
    ...execution,
    sourceMessageId,
    call: toolCall(toolCallId, toolName),
    idempotencyKey: `tool-result-resource:${toolCallId}`,
    permissionPolicy: new AllowAllToolsPolicy(),
    storage
  }
}

function resourceEvidence(resource: ResourceRecord): ResourceInputEvidence & {
  readonly type: "resource"
} {
  return {
    type: "resource",
    resourceId: resource.id,
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}

function syntheticResource(
  id: string,
  sha256: string,
  sizeBytes: number
): ResourceRecord {
  return {
    id,
    logicalPath: `resources/${id}`,
    kind: "artifact",
    origin: "tool_output",
    state: "available",
    sizeBytes,
    sha256,
    createdAt: 1,
    updatedAt: 1
  }
}
