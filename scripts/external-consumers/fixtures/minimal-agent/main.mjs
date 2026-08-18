import assert from "node:assert/strict"
import { join } from "node:path"
import { createWanexRuntime } from "@wanex/runtime"

const runtime = await createWanexRuntime({
  storage: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(required("WANEX_FIXTURE_ROOT"), "store")
  },
  modelEndpoint: {
    id: "external-minimal-agent",
    connection: { id: "external-minimal-agent", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "external-minimal-model",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "wanex.external-minimal-model",
        revision: "1"
      }
    }
  },
  fakeResponseText: "external minimal agent complete"
})

try {
  const result = await runtime.run({
    content: [{ type: "text", text: "run the external minimal agent" }]
  })
  assert.equal(result.state, "succeeded")
  assert.equal(result.assistantText, "external minimal agent complete")
  assert.equal(result.workerResults.includes("completed"), true)
  process.stdout.write(`${JSON.stringify({
    id: "minimal-agent",
    ok: true,
    state: result.state,
    assistantText: result.assistantText,
    messageCount: result.messageCount
  })}\n`)
} finally {
  await runtime.dispose()
  await runtime.dispose()
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
