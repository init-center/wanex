import assert from "node:assert/strict"
import { join } from "node:path"
import { createWanexApp } from "@wanex/app"

const fixtureRoot = required("WANEX_FIXTURE_ROOT")
const imageEndpoint = externalImageEndpoint()
const app = await createWanexApp({
  storage: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(fixtureRoot, "store")
  },
  modelEndpoint: {
    id: "external-trusted-app",
    connection: { id: "external-trusted-app", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "external-app-model",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "wanex.external-app-model",
        revision: "1"
      }
    }
  },
  mediaGenerationAdapters: [externalImageAdapter(imageEndpoint)]
})

try {
  await app.commands.upsertModelEndpoint({
    modelEndpoint: imageEndpoint,
    makeActive: false
  })
  const status = app.status()
  const serializedStatus = JSON.stringify(status)
  assert.equal(serializedStatus.includes(fixtureRoot), false)
  const receipt = await app.commands.submitConversationOperation({
    content: [{ type: "text", text: "run the external trusted app" }]
  })
  const operation = await waitForTerminal(app, receipt)
  assert.equal(operation.state, "succeeded")
  assert.equal(operation.result?.assistantText.length > 0, true)
  const mediaReceipt = await app.commands.submitMediaGeneration({
    operation: "image.generate",
    prompt: "external consumer image",
    outputModality: "image"
  })
  const mediaOperation = await waitForMediaTerminal(app, mediaReceipt.operationId)
  assert.equal(mediaOperation.state, "succeeded")
  assert.equal(mediaOperation.outputResourceIds.length, 1)
  process.stdout.write(`${JSON.stringify({
    id: "trusted-app",
    ok: true,
    assistantText: operation.result?.assistantText,
    operationState: operation.state,
    operationReference: receipt,
    mediaOperationState: mediaOperation.state,
    mediaResourceId: mediaOperation.outputResourceIds[0],
    statusKeys: Object.keys(status).sort()
  })}\n`)
} finally {
  await app.dispose()
  await app.dispose()
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}

async function waitForTerminal(app, reference) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.commands.readConversationOperation(reference)
    if (result.kind === "found" &&
      ["succeeded", "failed", "cancelled", "interrupted", "recovery_required"]
        .includes(result.operation.state)) {
      return result.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("trusted App operation did not reach terminal state")
}

async function waitForMediaTerminal(app, operationId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.commands.readMediaGenerationOperation({ operationId })
    if (result.kind === "found" &&
      ["succeeded", "failed", "cancelled", "recovery_required"]
        .includes(result.operation.state)) {
      return result.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("trusted App media operation did not reach terminal state")
}

function externalImageAdapter(imageEndpoint) {
  return {
    protocolId: imageEndpoint.protocol.id,
    canExecute(modelEndpoint) {
      return modelEndpoint.protocol.id === imageEndpoint.protocol.id &&
        modelEndpoint.model.operations.includes("image.generate") &&
        modelEndpoint.model.inputModalities.includes("text") &&
        modelEndpoint.model.outputModalities.includes("image")
    },
    async submit() {
      return {
        status: "completed",
        outputs: [
          {
            kindOfOutput: "inline_bytes",
            bytes: Buffer.from("external-generated-image"),
            mediaType: "image/png",
            kind: "image"
          }
        ]
      }
    },
    async poll() {
      throw new Error("external image adapter does not poll")
    }
  }
}

function externalImageEndpoint() {
  return {
    id: "external-image-profile",
    connection: {
      id: "external-image-connection",
      providerId: "external-image-provider"
    },
    protocol: { id: "external-image-protocol" },
    model: {
      id: "external-image-model",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: "wanex.external-image-model",
        revision: "1"
      }
    }
  }
}
