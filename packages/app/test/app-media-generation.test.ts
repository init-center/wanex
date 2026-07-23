import { describe, expect, it } from "vitest"
import type { MediaGenerationProviderProfile } from "@wanex/protocol"
import type {
  MediaGenerationAdapter,
  MediaGenerationPollResult,
  MediaGenerationSubmitResult
} from "@wanex/runtime/media-generation"
import { createWanexApp } from "../src/index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app media generation facade", () => {
  it("submits, reads, and cancels through the public app commands", async () => {
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir: await createStoreDir()
      },
      artifacts: { explicitPath: serviceBin },
      mediaGenerationAdapters: [new ImmediateImageAdapter()]
    })

    try {
      const submitted = await app.commands.submitMediaGeneration({
        providerProfileId: "app-image-profile",
        prompt: "public app image",
        outputModality: "image"
      })
      expect(submitted).toMatchObject({
        operationId: expect.any(String),
        jobId: expect.any(String),
        state: "queued"
      })

      await eventually(async () => {
        await expect(
          app.commands.readMediaGenerationOperation(submitted)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            outputResourceIds: [expect.any(String)]
          }
        })
      })

      await app.stop()
      const queued = await app.commands.submitMediaGeneration({
        providerProfileId: "app-image-profile",
        prompt: "cancel before dispatch",
        outputModality: "image"
      })
      await expect(
        app.commands.cancelMediaGeneration({
          operationId: queued.operationId,
          reason: "no longer needed"
        })
      ).resolves.toEqual({
        operationId: queued.operationId,
        status: "cancelled",
        state: "cancelled"
      })
      await expect(
        app.commands.readMediaGenerationOperation(queued)
      ).resolves.toMatchObject({
        kind: "found",
        operation: { state: "cancelled" }
      })
    } finally {
      await app.dispose()
    }
  })
})

class ImmediateImageAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile = {
    id: "app-image-profile",
    adapterId: "app-image-adapter",
    providerId: "app-image-provider",
    modelId: "app-image-model",
    input: ["text"],
    output: ["image"]
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "inline_bytes",
          bytes: Buffer.from("app-generated-image"),
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("immediate image adapter does not poll")
  }
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}
