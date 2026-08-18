import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import type { ProviderAdapter, ProviderRequest } from "../src/provider/index.js"
import {
  AnthropicAdapter,
  OpenAICompatibleAdapter
} from "../src/provider/index.js"
import { WanexAgentRuntime } from "../src/execution/agent-runtime/index.js"
import { testConversationModel } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("resource-bearing provider input", () => {
  it("freezes resource evidence and resolves exact bytes before provider execution", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-resource-turn-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const imageBytes = Uint8Array.from([137, 80, 78, 71, 1, 2, 3])
    const resource = await storage.ingestResource({
      content: imageBytes,
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload",
      label: "fixture image"
    })
    const provider = new ResourceRecordingProvider()
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "resource_turn_worker",
      provider
    })

    try {
      const result = await runtime.submitAndRunUserTurn({
        sessionId: "ses_resource_turn",
        content: [
          { type: "text", text: "describe this image" },
          { type: "resource", resourceId: resource.id }
        ]
      })

      if (result.run.worker.status === "failed") {
        throw result.run.worker.error
      }
      expect(result.run.worker).toMatchObject({ status: "completed" })
      expect(result.receipt.turn.executionBinding.modelEndpoint.model)
        .toMatchObject({
          inputModalities: ["text", "image"],
          outputModalities: ["text"]
        })
      expect(result.receipt.turn.executionBinding.resources).toEqual([
        {
          resourceId: resource.id,
          sha256: resource.sha256,
          sizeBytes: imageBytes.byteLength,
          kind: "image",
          mediaType: "image/png"
        }
      ])
      expect(provider.resourceBytes).toEqual(imageBytes)
      expect(result.messages[0]?.content).toEqual([
        { type: "text", id: "user_text_0", text: "describe this image" },
        {
          type: "resource",
          id: "user_resource_1",
          resourceId: resource.id,
          sha256: resource.sha256,
          sizeBytes: imageBytes.byteLength,
          kind: "image",
          mediaType: "image/png"
        }
      ])
      expect(JSON.stringify(result.messages)).not.toContain("iVBOR")
    } finally {
      await runtime.stop()
      await storage.dispose()
    }
  })

  it("lowers image bytes into OpenAI-compatible data URLs", () => {
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("vision-model", {
        inputModalities: ["text", "image"]
      }),
      baseUrl: "https://api.example/v1",
      apiKey: "secret"
    })
    expect(adapter.buildReplayMessages([resourceMessage("image", "image/png")]))
      .toEqual([
        {
          role: "user",
          content: [
            { type: "text", text: "inspect" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,AQID" }
            }
          ]
        }
      ])
  })

  it("binds direct Anthropic document input to the Anthropic adapter kind", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-anthropic-binding-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const document = await storage.ingestResource({
      content: Uint8Array.from([37, 80, 68, 70]),
      mediaType: "application/pdf",
      kind: "document",
      origin: "user_upload"
    })
    const runtime = new WanexAgentRuntime({
      storage,
      provider: new AnthropicAdapter({
        providerId: "anthropic",
        model: testConversationModel("claude-document", {
          inputModalities: ["text", "image", "document"]
        }),
        baseUrl: "https://api.anthropic.example/v1",
        apiKey: "secret"
      })
    })

    try {
      const submitted = await runtime.submitUserTurn({
        sessionId: "ses_anthropic_binding",
        content: [{ type: "resource", resourceId: document.id }]
      })

      expect(submitted.session.title).toBe("Resource conversation")
      expect(submitted.receipt.turn.executionBinding.modelEndpoint).toMatchObject({
        protocol: { id: "anthropic-messages" },
        connection: { providerId: "anthropic" },
        model: {
          inputModalities: ["text", "image", "document"],
          outputModalities: ["text"]
        }
      })
      expect(submitted.receipt.turn.executionBinding.resources).toEqual([
        {
          resourceId: document.id,
          sha256: document.sha256,
          sizeBytes: document.sizeBytes,
          kind: "document",
          mediaType: "application/pdf"
        }
      ])
    } finally {
      await runtime.stop()
      await storage.dispose()
    }
  })

  it("rejects resource bytes that change after turn admission", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-resource-change-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const resource = await storage.ingestResource({
      content: Uint8Array.from([1, 2, 3]),
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    const provider = new ResourceRecordingProvider()
    const runtime = new WanexAgentRuntime({
      storage,
      workerId: "resource_change_worker",
      provider
    })

    try {
      await runtime.submitUserTurn({
        sessionId: "ses_resource_change",
        content: [{ type: "resource", resourceId: resource.id }]
      })
      await writeFile(
        join(storeDir, "files", resource.logicalPath),
        Uint8Array.from([3, 2, 1])
      )

      const run = await runtime.runOnce()

      expect(run.worker.status).toBe("failed")
      if (run.worker.status !== "failed") {
        throw new Error("expected changed resource bytes to fail the turn")
      }
      expect(run.worker.error.message).toContain("resource bytes changed")
      expect(provider.resourceBytes).toBeUndefined()
    } finally {
      await runtime.stop()
      await storage.dispose()
    }
  })

  it("rejects duplicate resource references before durable turn submission", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-resource-duplicate-"))
    tempDirs.push(storeDir)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const resource = await storage.ingestResource({
      content: Uint8Array.from([1, 2, 3]),
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    const runtime = new WanexAgentRuntime({
      storage,
      provider: new ResourceRecordingProvider()
    })

    try {
      await expect(runtime.submitUserTurn({
        sessionId: "ses_resource_duplicate",
        content: [
          { type: "resource", resourceId: resource.id },
          { type: "resource", resourceId: resource.id }
        ]
      })).rejects.toThrow(`agent runtime resource is duplicated: ${resource.id}`)
      await expect(storage.listSessionTurns({
        sessionId: "ses_resource_duplicate"
      })).resolves.toEqual([])
    } finally {
      await runtime.stop()
      await storage.dispose()
    }
  })

  it("lowers Anthropic image and PDF blocks without changing message order", () => {
    const adapter = new AnthropicAdapter({
      providerId: "anthropic",
      model: testConversationModel("claude-vision", {
        inputModalities: ["text", "image", "document"]
      }),
      baseUrl: "https://api.anthropic.example/v1",
      apiKey: "secret"
    })
    expect(adapter.buildReplayMessages([
      resourceMessage("image", "image/png"),
      resourceMessage("document", "application/pdf")
    ])).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "inspect" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "AQID"
            }
          }
        ]
      },
      {
        role: "user",
        content: [
          { type: "text", text: "inspect" },
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: "AQID"
            }
          }
        ]
      }
    ])
  })

  it("fails unsupported resource shapes before invoking provider fetch", async () => {
    let called = false
    const adapter = new OpenAICompatibleAdapter({
      providerId: "openai",
      model: testConversationModel("vision-model", {
        inputModalities: ["text", "image"]
      }),
      baseUrl: "https://api.example/v1",
      apiKey: "secret",
      fetch: async () => {
        called = true
        throw new Error("must not fetch")
      }
    })
    const events = []
    for await (const event of adapter.stream({
      messages: [preparedResourceMessage("document", "application/pdf")]
    })) {
      events.push(event)
    }
    expect(called).toBe(false)
    expect(events).toEqual([
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ phase: "request" })
      })
    ])
  })
})

class ResourceRecordingProvider implements ProviderAdapter {
  readonly protocol = { id: "openai-chat-completions" } as const
  readonly providerId = "recording-openai"
  readonly model = testConversationModel("recording-vision", {
    inputModalities: ["text", "image"]
  })
  resourceBytes: Uint8Array | undefined

  async *stream(request: ProviderRequest) {
    const resource = request.messages
      .flatMap((message) => message.content)
      .find((part) => part.type === "resource")
    this.resourceBytes = resource?.bytes
    yield { type: "text_delta" as const, partId: "text_0", delta: "image" }
    yield { type: "finish" as const, reason: "stop" as const }
  }

  buildReplayMessages() {
    return []
  }
}

function resourceMessage(kind: "image" | "document", mediaType: string) {
  return preparedResourceMessage(kind, mediaType)
}

function preparedResourceMessage(
  kind: "image" | "document",
  mediaType: string
) {
  return {
    role: "user" as const,
    content: [
      { type: "text" as const, id: "text", text: "inspect" },
      {
        type: "resource" as const,
        id: "resource",
        resourceId: `res_${kind}`,
        sha256: "a".repeat(64),
        sizeBytes: 3,
        kind,
        mediaType,
        bytes: Uint8Array.from([1, 2, 3])
      }
    ]
  }
}
