import assert from "node:assert/strict"
import { join } from "node:path"
import { createWanexRuntime } from "@wanex/runtime"

const runtime = await createWanexRuntime({
  storage: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(required("WANEX_FIXTURE_ROOT"), "store"),
    serviceBin: required("WANEX_SYSTEM_SERVICE_BIN")
  },
  provider: {
    kind: "fake",
    id: "external-minimal-agent",
    modelId: "external-minimal-model",
    responseText: "external minimal agent complete"
  }
})

try {
  const result = await runtime.run({ text: "run the external minimal agent" })
  assert.equal(result.jobState, "succeeded")
  assert.equal(result.assistantText, "external minimal agent complete")
  assert.equal(result.workerResults.includes("completed"), true)
  process.stdout.write(`${JSON.stringify({
    id: "minimal-agent",
    ok: true,
    jobState: result.jobState,
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
