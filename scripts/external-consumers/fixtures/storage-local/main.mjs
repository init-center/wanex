import assert from "node:assert/strict"
import { join } from "node:path"
import { createStorageHandle } from "@wanex/storage"

const storeDir = join(required("WANEX_FIXTURE_ROOT"), "store")
const handle = createStorageHandle({
  kind: "local-system-service",
  mode: "persistent",
  storeDir,
  serviceBin: required("WANEX_SYSTEM_SERVICE_BIN")
})

try {
  await handle.core.putConfig("external.marker", { source: "packed-storage" })
  const value = await handle.core.getConfig("external.marker")
  const doctor = await handle.core.doctor()
  assert.deepEqual(value, { source: "packed-storage" })
  assert.equal(doctor.storePath, join(storeDir, "state.db"))
  assert.equal(doctor.schemaVersion > 0, true)
  process.stdout.write(`${JSON.stringify({
    id: "storage-local",
    ok: true,
    value,
    schemaVersion: doctor.schemaVersion,
    storePathMatched: doctor.storePath === join(storeDir, "state.db")
  })}\n`)
} finally {
  await handle.dispose()
  await handle.dispose()
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
