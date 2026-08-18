import { createHash } from "node:crypto"
import { join } from "node:path"
import { InMemoryResolvedSecret, type SecretStorePort } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { startLocalWebApp, type LocalWebApp } from "@wanex/local-host"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  productConversationRowResources,
  productConversationRowText
} from "./conversation-helpers.js"

const GENERATED_IMAGE_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 21, 34, 55, 89
])

export const capabilitySetupContinuationScenario = createEvalScenario({
  id: "product.capability-setup-linked-continuation",
  title: "Product Local configures an optional image capability and continues one linked Turn",
  tags: ["product", "local-host", "capability", "conversation", "resource", "security"],
  async run(context) {
    const storeDir = join(context.storeDir, "product-capability-setup-continuation")
    const conversationRequests: Record<string, unknown>[] = []
    const imageRequests: Record<string, unknown>[] = []
    const originalFetch = globalThis.fetch
    const appUrlBeforeSetup = { value: undefined as string | undefined }

    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        conversationRequests.push(body)
        switch (conversationRequests.length) {
          case 1:
            return openAIToolResponse(
              "capability_request",
              "call_eval_capability_request",
              { operation: "image.generate" }
            )
          case 2:
            return openAITextResponse("Image generation needs setup.")
          case 3:
            return openAIToolResponse(
              "image_generate",
              "call_eval_linked_image_generate",
              { prompt: "a trusted green square" }
            )
          case 4:
            return openAITextResponse("The trusted generated image is ready.")
          default:
            throw new Error("unexpected additional conversation provider request")
        }
      }
      if (url.endsWith("/images/generations")) {
        imageRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(
          JSON.stringify({
            data: [{ b64_json: Buffer.from(GENERATED_IMAGE_BYTES).toString("base64") }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      }
      throw new Error(`unexpected provider URL: ${url}`)
    }) as typeof globalThis.fetch

    let app: LocalWebApp | undefined
    try {
      app = await startLocalWebApp({
        storage: { kind: "store-dir", storeDir },
        serviceBin: context.serviceBin,
        credentialStore: new EvalSecretStore(),
        web: { hostname: "127.0.0.1" }
      })
      appUrlBeforeSetup.value = app.url

      const configured = await app.providers.saveProvider({
        presetId: "openai",
        conversationModelId: "eval-capability-conversation-model",
        credential: "eval-capability-secret",
        makeConversationActive: true
      })
      assert(
        configured.provider.endpoints.every(
          (endpoint) => !endpoint.model.operations.includes("image.generate")
        ),
        "conversation setup must leave optional image generation unconfigured"
      )

      const submitted = await app.shell.submitConversationOperation({
        sessionId: "ses_eval_capability_setup",
        text: "Generate a trusted green square."
      })
      assert(
        submitted.kind === "product.conversation-operation.found",
        "the source conversation must be admitted"
      )
      const source = await eventually(async () => {
        const result = await app!.shell.readTrackedConversationOperation({
          sessionId: "ses_eval_capability_setup"
        })
        assert(
          result.kind === "product.conversation-operation.found" &&
            result.operation.state === "succeeded",
          "the source capability request must settle"
        )
        const interaction = result.operation.transcript.rows
          .flatMap((row) => row.capabilityRequests)
          .find((request) => request.operation === "image.generate")
        assert(
          interaction?.setupRequired === true,
          "the source operation must expose one validated setup interaction"
        )
        return result
      })

      const setup = await app.capabilitySetup.setupImageGenerationAndContinue({
        operationId: source.operation.operationId,
        sessionId: source.operation.sessionId,
        operation: "image.generate",
        imageGenerationModelId: "eval-trusted-image-model"
      })
      assert(
        setup.kind === "local-host.capability-setup.continued",
        "trusted setup must create a linked continuation"
      )
      assert(
        setup.setup.endpoint.id === "openai.image-generate" &&
          setup.setup.endpoint.credentialConfigured &&
          setup.setup.readiness.status === "ready",
        "setup must create one ready credentialed image endpoint"
      )
      assert(
        app.url === appUrlBeforeSetup.value,
        "capability setup must not restart the local Product host"
      )

      const terminal = await eventually(async () => {
        const result = await app!.shell.readTrackedConversationOperation({
          sessionId: "ses_eval_capability_setup"
        })
        assert(
          result.kind === "product.conversation-operation.found" &&
            result.operation.state === "succeeded",
          "the linked continuation must settle"
        )
        return result
      })
      const generatedResource = terminal.operation.transcript.rows
        .flatMap(productConversationRowResources)
        .find((resource) => resource.kind === "image")
      assert(generatedResource !== undefined, "linked continuation must publish an image Resource")
      const generatedTool = terminal.operation.transcript.rows
        .flatMap((row) => row.parts)
        .find(
          (part) =>
            part.type === "tool" && part.name === "image_generate"
        )
      assert(
        generatedTool?.type === "tool" &&
          generatedTool.state === "succeeded",
        "Product must correlate the real image Tool call and result as one succeeded activity"
      )
      const preview = await readDeliveredImage(
        app,
        "ses_eval_capability_setup",
        generatedResource.resourceId,
        generatedResource.sha256
      )
      assert(
        Buffer.from(preview).equals(Buffer.from(GENERATED_IMAGE_BYTES)),
        "trusted delivery must return the exact generated bytes"
      )

      const history = await app.shell.readSessionTranscript({
        sessionId: "ses_eval_capability_setup"
      })
      assert(history.kind === "product.session-transcript.found", "Product history must be readable")
      const displayedUserRows = history.transcript.rows.filter((row) => row.role === "user")
      assert(
        displayedUserRows.length === 1 &&
          productConversationRowText(displayedUserRows[0]!) ===
            "Generate a trusted green square.",
        "Product history must display the original user prompt once"
      )
      assert(
        imageRequests.length === 1 && conversationRequests.length === 4,
        "linked continuation must generate exactly once with no duplicate Provider execution"
      )
      assert(
        generatedResource.sha256 ===
          createHash("sha256").update(GENERATED_IMAGE_BYTES).digest("hex"),
        "generated Resource evidence must match the exact preview bytes"
      )

      await app.close()
      app = undefined
      const storage = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin: context.serviceBin
      })
      try {
        const [inputs, turns] = await Promise.all([
          storage.listSessionInputs({ sessionId: "ses_eval_capability_setup" }),
          storage.listSessionTurns({ sessionId: "ses_eval_capability_setup" })
        ])
        assert(inputs.length === 2, "canonical Storage must retain source and continuation inputs")
        assert(turns.length === 2, "canonical Storage must retain two fresh Turns")
        assert(
          inputs.every((input) =>
            input.content.some(
              (part) =>
                part.type === "text" &&
                part.text === "Generate a trusted green square."
            )
          ),
          "both durable inputs must preserve the exact canonical source prompt"
        )
        assert(
          turns[1]?.regeneratesTurnId === turns[0]?.id,
          "the continuation Turn must link to the source Turn"
        )
        assert(
          !JSON.stringify(turns[0]?.executionBinding.toolSnapshot).includes("image_generate"),
          "the source Turn must not gain a Tool that was unconfigured at admission"
        )
        assert(
          JSON.stringify(turns[1]?.executionBinding.toolSnapshot).includes("image_generate"),
          "the continuation Turn must freeze image_generate in its Tool snapshot"
        )

        return {
          displayedUserPromptCount: 1,
          durableInputCount: inputs.length,
          durableTurnCount: turns.length,
          linkedContinuation: true,
          imageToolFrozen: true,
          generatedResourceId: generatedResource.resourceId,
          generatedResourceSha256: createHash("sha256").update(GENERATED_IMAGE_BYTES).digest("hex"),
          imageRequestCount: imageRequests.length,
          conversationRequestCount: conversationRequests.length,
          hostRestarted: false
        }
      } finally {
        await storage.dispose()
      }
    } finally {
      await app?.close()
      globalThis.fetch = originalFetch
    }
  }
})

class EvalSecretStore implements SecretStorePort {
  readonly scheme = "eval-secret"
  readonly #values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.#values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.#values.delete(ref)
  }

  async resolve(ref: string): Promise<InMemoryResolvedSecret> {
    const value = this.#values.get(ref)
    if (value === undefined) {
      throw new Error("evaluation credential is unavailable")
    }
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}

async function eventually<T>(assertion: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      return await assertion()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

function openAIToolResponse(
  name: string,
  toolCallId: string,
  input: Record<string, unknown>
): Response {
  return eventStreamResponse({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: toolCallId,
          function: { name, arguments: JSON.stringify(input) }
        }]
      },
      finish_reason: "tool_calls"
    }]
  })
}

function openAITextResponse(text: string): Response {
  return eventStreamResponse({
    choices: [{ delta: { content: text }, finish_reason: "stop" }]
  })
}

function eventStreamResponse(value: unknown): Response {
  return new Response(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  })
}

async function readDeliveredImage(
  app: LocalWebApp,
  sessionId: string,
  resourceId: string,
  sha256: string
): Promise<Uint8Array> {
  const prepared = await app.resourceDeliveries.prepare({
    audience: "eval-product-local",
    sessionId,
    resourceId,
    expectedSha256: sha256,
    purpose: "preview"
  })
  const opened = await app.resourceDeliveries.open({
    token: prepared.token,
    audience: "eval-product-local",
    method: "GET"
  })
  assert(opened.body !== undefined, "trusted delivery body must exist")
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of opened.body) {
    chunks.push(chunk)
    size += chunk.byteLength
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
