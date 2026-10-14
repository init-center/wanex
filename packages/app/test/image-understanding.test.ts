import { afterEach, describe, expect, it, vi } from "vitest"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/index.js"
import { setWanexAppImageUnderstandingEndpoint } from "../src/image-understanding.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("@wanex/app image understanding for text-only models", () => {
  it("describes an attachment once through the chosen endpoint and replays only text", async () => {
    const storeDir = await createStoreDir()
    const requests: Array<{ readonly url: string; readonly body: Record<string, unknown> }> = []
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push({ url, body })
      return textResponse(
        url.startsWith("https://vision.example.test")
          ? "A red triangle on a white background with the label TEST."
          : "It is a red triangle."
      )
    })
    const secretRef = "static://image-understanding"
    const conversation = appTestModelEndpoint({
      endpointId: "text-only-chat",
      protocolId: "openai-chat-completions",
      providerId: "openai-compatible",
      modelId: "text-only-model",
      baseUrl: "https://text.example.test/v1",
      secretRef
    })
    const vision = appTestModelEndpoint({
      endpointId: "vision-chat",
      protocolId: "openai-chat-completions",
      providerId: "openai-compatible",
      modelId: "vision-model",
      baseUrl: "https://vision.example.test/v1",
      secretRef,
      inputModalities: ["text", "image"]
    })
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: conversation,
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: "test-key" } })
      ]),
      runtimeContext: { toolPermissionPolicy: new AllowAllToolsPolicy() }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await app.commands.upsertModelEndpoint({ modelEndpoint: vision, makeActive: false })
      const image = await storage.ingestResource({
        content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload"
      })
      const content = [
        { type: "text" as const, text: "What is this?" },
        { type: "resource" as const, resourceId: image.id }
      ]

      // Without an explicit choice, a text-only model still refuses images.
      await expect(app.commands.submitConversationOperation({
        sessionId: "session-no-vision",
        content
      })).rejects.toThrow("does not support image input")

      await setWanexAppImageUnderstandingEndpoint({ storage, modelEndpointId: vision.id })
      const first = await app.commands.submitConversationOperation({
        sessionId: "session-vision",
        content
      })
      await settled(app, first)

      const visionRequests = requests.filter((request) => request.url.startsWith("https://vision."))
      const chatRequests = requests.filter((request) => request.url.startsWith("https://text."))
      expect(visionRequests).toHaveLength(1)
      expect(JSON.stringify(visionRequests[0]?.body)).toContain("data:image/png;base64,")
      const chat = JSON.stringify(chatRequests[0]?.body)
      expect(chat).not.toContain("image_url")
      expect(chat).toContain(`[image ${image.id}, described by vision-model because this model cannot see images]`)
      expect(chat).toContain("label TEST")

      // A later turn reuses the durable description instead of asking again.
      const second = await app.commands.submitConversationOperation({
        sessionId: "session-vision",
        content: [{ type: "text", text: "And its colour?" }]
      })
      await settled(app, second)
      expect(requests.filter((request) => request.url.startsWith("https://vision."))).toHaveLength(1)
      const provenance = await storage.listResourceProvenance({ causeKind: "image_description" })
      expect(provenance).toHaveLength(1)
      expect(provenance[0]?.inputResources).toEqual([expect.objectContaining({ resourceId: image.id })])
      // The canonical transcript keeps the original image.
      const messages = await storage.listSessionMessages({ sessionId: first.sessionId })
      expect(JSON.stringify(messages[0]?.content)).toContain(image.id)
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })
})

describe("@wanex/app image_analyze", () => {
  it("asks the chosen endpoint about conversation images only", async () => {
    const storeDir = await createStoreDir()
    const requests: Array<{ readonly url: string; readonly body: string }> = []
    let chatCalls = 0
    let imageId = ""
    let foreignId = ""
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const body = String(init?.body)
      requests.push({ url, body })
      if (url.startsWith("https://vision.example.test")) {
        return textResponse(
          body.includes("serial number")
            ? "The serial number is WX-42."
            : "A photo of a device label."
        )
      }
      chatCalls += 1
      if (chatCalls === 1) {
        return toolCallResponse("call_analyze", "image_analyze", {
          question: "What is the serial number?",
          images: [imageId]
        })
      }
      if (chatCalls === 3) {
        return toolCallResponse("call_foreign", "image_analyze", {
          question: "What is this?",
          images: [foreignId]
        })
      }
      return textResponse("Done.")
    })
    const secretRef = "static://image-analyze"
    const conversation = appTestModelEndpoint({
      endpointId: "text-only-chat",
      protocolId: "openai-chat-completions",
      providerId: "openai-compatible",
      modelId: "text-only-model",
      baseUrl: "https://text.example.test/v1",
      secretRef
    })
    const vision = appTestModelEndpoint({
      endpointId: "vision-chat",
      protocolId: "openai-chat-completions",
      providerId: "openai-compatible",
      modelId: "vision-model",
      baseUrl: "https://vision.example.test/v1",
      secretRef,
      inputModalities: ["text", "image"]
    })
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: conversation,
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: "test-key" } })
      ]),
      runtimeContext: { toolPermissionPolicy: new AllowAllToolsPolicy() }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await app.commands.upsertModelEndpoint({ modelEndpoint: vision, makeActive: false })
      // A text-only endpoint cannot be chosen, and nothing is offered until one is.
      await expect(app.commands.setImageUnderstandingEndpoint({
        endpointId: conversation.id
      })).rejects.toThrow("cannot read images")
      expect((await app.commands.listModelEndpoints()).imageUnderstandingEndpointId)
        .toBeUndefined()
      await expect(app.commands.setImageUnderstandingEndpoint({
        endpointId: vision.id
      })).resolves.toMatchObject({ imageUnderstandingEndpointId: vision.id })

      const image = await storage.ingestResource({
        content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload"
      })
      const foreign = await storage.ingestResource({
        content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"), label: "other-session",
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload"
      })
      imageId = image.id
      foreignId = foreign.id

      const first = await app.commands.submitConversationOperation({
        sessionId: "session-analyze",
        content: [
          { type: "text", text: "Read the serial number." },
          { type: "resource", resourceId: image.id }
        ]
      })
      await settled(app, first)
      const chat = requests.filter((request) => request.url.startsWith("https://text."))
      expect(chat[0]?.body).toContain('"image_analyze"')
      const question = requests.find((request) =>
        request.url.startsWith("https://vision.") && request.body.includes("serial number")
      )
      expect(question?.body).toContain("data:image/png;base64,")
      expect(chat[1]?.body).toContain("The serial number is WX-42.")
      expect(chat[1]?.body).not.toContain("image_url")

      // An image this conversation has never seen is not sent anywhere.
      const visionBefore = requests.filter((request) => request.url.startsWith("https://vision.")).length
      const second = await app.commands.submitConversationOperation({
        sessionId: "session-analyze",
        content: [{ type: "text", text: "Now the other one." }]
      })
      await settled(app, second)
      expect(requests.filter((request) => request.url.startsWith("https://vision.")))
        .toHaveLength(visionBefore)
      expect(requests.at(-1)?.body).toContain("is not part of this conversation")

      // Turning it off removes the tool from the next Turn.
      await app.commands.setImageUnderstandingEndpoint({ endpointId: null })
      const third = await app.commands.submitConversationOperation({
        sessionId: "session-plain",
        content: [{ type: "text", text: "Hello." }]
      })
      await settled(app, third)
      expect(requests.at(-1)?.body).not.toContain('"image_analyze"')
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })
})

async function settled(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  submitted: Awaited<ReturnType<Awaited<ReturnType<typeof createWanexApp>>["commands"]["submitConversationOperation"]>>
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await expect(app.commands.readConversationOperation(submitted)).resolves.toMatchObject({
        kind: "found",
        operation: { state: "succeeded" }
      })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

function textResponse(text: string) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}

function toolCallResponse(id: string, name: string, input: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(input) }
            }]
          },
          finish_reason: "tool_calls"
        }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}
