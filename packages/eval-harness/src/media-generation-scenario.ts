import { join } from "node:path"
import { createWanexApp } from "@wanex/app"
import type { MediaGenerationProviderProfile } from "@wanex/protocol"
import type {
  MediaGenerationAdapter,
  MediaGenerationAdapterRequest,
  MediaGenerationMaterializedOutput,
  MediaGenerationPollResult,
  MediaGenerationSubmitResult
} from "@wanex/runtime/media-generation"
import { createEvalScenario } from "./runner.js"
import { assert } from "./scenario-utils.js"

export const mediaGenerationAppPathScenario = createEvalScenario({
  id: "media-generation.app-path",
  title: "App media generation persists checkpoints and materializes provider references",
  tags: ["app", "media", "provider", "resource"],
  async run(context) {
    const adapter = new EvalMediaGenerationAdapter()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: join(context.storeDir, "media-generation-app")
      },
      artifacts: { explicitPath: context.serviceBin },
      mediaGenerationAdapters: [adapter]
    })
    try {
      const receipt = await app.commands.submitMediaGeneration({
        providerProfileId: adapter.profile.id,
        prompt: "eval generated image",
        outputModality: "image",
        idempotencyKey: "eval-media-generation"
      })
      const operation = await waitForMediaGeneration(app, receipt.operationId)
      assert(operation.state === "succeeded", "media generation should succeed")
      assert(
        operation.externalOperationId === "eval-provider-operation",
        "provider acceptance must be durable"
      )
      assert(
        operation.outputReferences[0]?.providerFileId === "eval-provider-file",
        "provider file reference must remain operation evidence"
      )
      const resourceId = operation.outputResourceIds[0]
      assert(resourceId !== undefined, "generation should publish one resource")
      const resource = await app.commands.readResource({ resourceId })
      assert(resource?.state === "available", "generated resource must be available")
      assert(resource.sha256.length === 64, "generated resource must have sha256 evidence")
      return {
        operationId: operation.id,
        operationState: operation.state,
        externalOperationId: operation.externalOperationId,
        outputReferenceCount: operation.outputReferences.length,
        outputResourceId: resource.id,
        resourceState: resource.state,
        pollCount: adapter.pollCount,
        materializeCount: adapter.materializeCount
      }
    } finally {
      await app.dispose()
    }
  }
})

class EvalMediaGenerationAdapter implements MediaGenerationAdapter {
  readonly profile: MediaGenerationProviderProfile = {
    id: "eval-media-profile",
    adapterId: "eval-media-adapter",
    providerId: "eval-media-provider",
    modelId: "eval-media-model",
    input: ["text"],
    output: ["image"]
  }
  pollCount = 0
  materializeCount = 0

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "accepted",
      externalOperationId: "eval-provider-operation",
      providerCheckpoint: { cursor: 0 }
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    this.pollCount += 1
    if (this.pollCount === 1) {
      return {
        status: "pending",
        providerCheckpoint: { cursor: 1 },
        progress: { percent: 50 }
      }
    }
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "provider_file",
          provider: "eval-media-provider",
          fileId: "eval-provider-file",
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }

  async materialize(
    _reference: Parameters<NonNullable<MediaGenerationAdapter["materialize"]>>[0],
    _request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationMaterializedOutput> {
    this.materializeCount += 1
    return {
      bytes: Buffer.from("eval-generated-image"),
      mediaType: "image/png",
      kind: "image"
    }
  }
}

async function waitForMediaGeneration(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  operationId: string
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.commands.readMediaGenerationOperation({ operationId })
    if (
      result.kind === "found" &&
      ["succeeded", "failed", "cancelled", "recovery_required"].includes(
        result.operation.state
      )
    ) {
      return result.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Eval media generation did not reach terminal state")
}
