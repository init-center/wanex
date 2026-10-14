import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { PersistentSystemServiceStorageWireTransport } from "../src/transport-local-persistent.js"
import type { StorageRpcRequestEnvelope } from "../src/generated/storage-rpc.js"

const request = (id: string): StorageRpcRequestEnvelope => ({
  storage_rpc_version: 1, request_id: id, request: { command: "doctor" }
})

async function fixture(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "wanex-response-routing-"))
  const script = join(dir, "service.mjs")
  await writeFile(script, `
import { createInterface } from "node:readline"
const requests = []
const reply = (id) => process.stdout.write(JSON.stringify({
  storage_rpc_version: 1, request_id: id, ok: true, value: id
}) + "\\n")
createInterface({ input: process.stdin }).on("line", (line) => {
  requests.push(JSON.parse(line))
  ${source}
})
`)
  const transport = new PersistentSystemServiceStorageWireTransport({
    storeDir: dir, serviceBin: process.execPath, serviceArgsPrefix: [script]
  })
  return { transport, close: async () => {
    await transport.close()
    await rm(dir, { recursive: true, force: true })
  } }
}

describe("persistent response routing", () => {
  it("pairs reversed replies by request ID without serializing calls", async () => {
    const f = await fixture(`if (requests.length === 2) {
      reply(requests[1].request_id)
      reply(requests[0].request_id)
    }`)
    try {
      const result = await Promise.all([
        f.transport.exchange(request("image")), f.transport.exchange(request("ordinary"))
      ])
      expect(result).toEqual([
        { storage_rpc_version: 1, request_id: "image", ok: true, value: "image" },
        { storage_rpc_version: 1, request_id: "ordinary", ok: true, value: "ordinary" }
      ])
    } finally { await f.close() }
  })

  it("rejects a duplicate in-flight ID without replacing its owner", async () => {
    const f = await fixture(`if (requests.length === 2) {
      reply(requests[0].request_id)
      reply(requests[1].request_id)
    }`)
    try {
      const [first, duplicate, other] = await Promise.allSettled([
        f.transport.exchange(request("same")), f.transport.exchange(request("same")),
        f.transport.exchange(request("other"))
      ])
      expect([first, duplicate].filter(result => result.status === "fulfilled")).toEqual([
        { status: "fulfilled", value: {
          storage_rpc_version: 1, request_id: "same", ok: true, value: "same"
        } }
      ])
      expect([first, duplicate].filter(result => result.status === "rejected")).toMatchObject([
        { status: "rejected", reason: { code: "local_persistent_duplicate_request_id" } }
      ])
      expect(other).toMatchObject({ status: "fulfilled", value: { request_id: "other" } })
    } finally { await f.close() }
  })

  for (const response of ["unknown", "duplicate"]) {
    it(`fails all unresolved calls on an ${response} response`, async () => {
      const f = await fixture(`if (requests.length === 3) {
        ${response === "duplicate" ? 'reply("one"); reply("one")' : 'reply("unknown")'}
      }`)
      try {
        const results = await Promise.allSettled([
          f.transport.exchange(request("one")), f.transport.exchange(request("two")),
          f.transport.exchange(request("three"))
        ])
        for (const result of results.slice(response === "duplicate" ? 1 : 0)) {
          expect(result).toMatchObject({ status: "rejected", reason: {
            code: "local_persistent_unmatched_response"
          } })
        }
        if (response === "duplicate") expect(results[0]).toMatchObject({ status: "fulfilled" })
      } finally { await f.close() }
    })
  }
})
