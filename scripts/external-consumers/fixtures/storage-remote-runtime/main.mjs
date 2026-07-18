import assert from "node:assert/strict"
import { createServer } from "node:http"
import { join } from "node:path"
import { createWanexRuntime } from "@wanex/runtime"
import {
  createStorageHandle,
  PersistentSystemServiceStorageWireTransport
} from "@wanex/storage"
import {
  createRemoteStorageControlPlane,
  createStorageWireTransportPool
} from "@wanex/storage-control-plane"

const fixtureRoot = required("WANEX_FIXTURE_ROOT")
const serviceBin = required("WANEX_SYSTEM_SERVICE_BIN")
const subjects = new Map([
  ["alpha-token", { subjectId: "alpha" }],
  ["beta-token", { subjectId: "beta" }]
])
const createdTransports = []
const pool = createStorageWireTransportPool({
  createTransport(subject) {
    createdTransports.push(subject.subjectId)
    return new PersistentSystemServiceStorageWireTransport({
      storeDir: join(fixtureRoot, "remote", subject.subjectId),
      serviceBin
    })
  }
})
const controlPlane = createRemoteStorageControlPlane({
  async authenticateBearerToken(token) {
    return subjects.get(token) ?? null
  },
  resolveStorageWireTransport: pool.resolveStorageWireTransport
})
const server = await startServer(controlPlane)
const alpha = createStorageHandle({
  kind: "remote-http",
  endpoint: server.endpoint,
  token: "alpha-token",
  timeoutMs: 5_000
})
const beta = createStorageHandle({
  kind: "remote-http",
  endpoint: server.endpoint,
  token: "beta-token",
  timeoutMs: 5_000
})
const runtime = await createWanexRuntime({
  storage: {
    kind: "remote-http",
    endpoint: server.endpoint,
    token: "alpha-token",
    timeoutMs: 5_000
  },
  provider: {
    kind: "fake",
    id: "external-remote-runtime",
    modelId: "external-remote-model",
    responseText: "external remote runtime complete"
  }
})

try {
  await alpha.core.putConfig("tenant.marker", { tenant: "alpha" })
  const alphaValue = await alpha.core.getConfig("tenant.marker")
  const betaValue = await beta.core.getConfig("tenant.marker")
  assert.deepEqual(alphaValue, { tenant: "alpha" })
  assert.equal(betaValue, null)

  const forbidden = await fetch(server.endpoint, {
    method: "POST",
    headers: {
      authorization: "Bearer alpha-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      storeDir: join(fixtureRoot, "remote", "beta"),
      request: {
        storage_rpc_version: 1,
        request_id: "external-forbidden",
        request: { command: "doctor" }
      }
    })
  })
  const forbiddenBody = await forbidden.json()
  assert.equal(forbidden.status, 400)
  assert.equal(forbiddenBody.error.code, "client_store_selector_forbidden")

  const run = await runtime.run({ text: "run over remote storage" })
  assert.equal(run.jobState, "succeeded")
  assert.equal(run.assistantText, "external remote runtime complete")
  assert.deepEqual([...new Set(createdTransports)].sort(), ["alpha", "beta"])
  assert.equal(createdTransports.filter((item) => item === "alpha").length, 1)
  process.stdout.write(`${JSON.stringify({
    id: "storage-remote-runtime",
    ok: true,
    alphaValue,
    betaValue,
    rejectedStoreSelector: forbiddenBody.error.code,
    createdTransports,
    runtimeJobState: run.jobState,
    assistantText: run.assistantText
  })}\n`)
} finally {
  await runtime.dispose()
  await runtime.dispose()
  await alpha.dispose()
  await alpha.dispose()
  await beta.dispose()
  await server.close()
  await pool.close()
  await pool.close()
}

async function startServer(controlPlane) {
  const server = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const text = Buffer.concat(chunks).toString("utf8")
      const result = await controlPlane.handle({
        method: request.method ?? "GET",
        headers: Object.fromEntries(Object.entries(request.headers).map(
          ([name, value]) => [name, Array.isArray(value) ? value.join(",") : value]
        )),
        body: text.length === 0 ? null : JSON.parse(text)
      })
      response.writeHead(result.status, result.headers)
      response.end(JSON.stringify(result.body))
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: String(error) }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("remote fixture server did not bind")
  }
  let closed = false
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return
      closed = true
      await new Promise((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error))
      })
    }
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
