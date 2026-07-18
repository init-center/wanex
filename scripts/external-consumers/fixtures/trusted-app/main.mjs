import assert from "node:assert/strict"
import { join } from "node:path"
import { createWanexApp } from "@wanex/app"

const fixtureRoot = required("WANEX_FIXTURE_ROOT")
const serviceBin = required("WANEX_SYSTEM_SERVICE_BIN")
const app = await createWanexApp({
  storage: {
    kind: "local-system-service",
    mode: "persistent",
    storeDir: join(fixtureRoot, "store"),
    serviceBin
  },
  provider: {
    id: "external-trusted-app",
    kind: "fake",
    modelId: "external-app-model"
  }
})

try {
  const status = app.status()
  const serializedStatus = JSON.stringify(status)
  assert.equal(serializedStatus.includes(fixtureRoot), false)
  assert.equal(serializedStatus.includes(serviceBin), false)
  const result = await app.run({ text: "run the external trusted app" })
  assert.equal(result.assistantText.length > 0, true)
  assert.equal(result.jobStatuses.includes("succeeded"), true)
  process.stdout.write(`${JSON.stringify({
    id: "trusted-app",
    ok: true,
    assistantText: result.assistantText,
    jobStatuses: result.jobStatuses,
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
