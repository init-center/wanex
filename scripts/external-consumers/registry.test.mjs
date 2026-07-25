import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { startReadOnlyNpmRegistry } from "./registry.mjs"

describe("external consumer scoped registry", () => {
  it("serves exact package metadata and immutable tarball bytes", async () => {
    const bytes = Buffer.from("fixture-tarball")
    const registry = await startReadOnlyNpmRegistry({
      packages: [{
        manifest: {
          name: "@wanex/runtime",
          version: "1.2.3",
          type: "module"
        },
        filename: "wanex-runtime-1.2.3.tgz",
        bytes
      }]
    })
    try {
      const metadata = await fetch(`${registry.endpoint}/@wanex%2Fruntime`)
      expect(metadata.status).toBe(200)
      const body = await metadata.json()
      expect(body).toMatchObject({
        name: "@wanex/runtime",
        "dist-tags": { latest: "1.2.3" },
        versions: {
          "1.2.3": {
            name: "@wanex/runtime",
            version: "1.2.3",
            dist: {
              shasum: createHash("sha1").update(bytes).digest("hex")
            }
          }
        }
      })
      const tarball = await fetch(
        body.versions["1.2.3"].dist.tarball
      )
      expect(Buffer.from(await tarball.arrayBuffer())).toEqual(bytes)
      expect(tarball.headers.get("cache-control")).toContain("immutable")
    } finally {
      await registry.close()
      await registry.close()
    }
  })

  it("fails closed for unknown packages, tarballs, and methods", async () => {
    const registry = await startReadOnlyNpmRegistry({ packages: [] })
    try {
      await expect(fetch(`${registry.endpoint}/@wanex%2Fmissing`)).resolves.toMatchObject({ status: 404 })
      await expect(fetch(`${registry.endpoint}/tarballs/missing.tgz`)).resolves.toMatchObject({ status: 404 })
      await expect(fetch(`${registry.endpoint}/publish`, { method: "PUT" })).resolves.toMatchObject({ status: 405 })
    } finally {
      await registry.close()
    }
  })

  it("serves non-host native metadata without a downloadable tarball", async () => {
    const registry = await startReadOnlyNpmRegistry({
      packages: [{
        manifest: {
          name: "@wanex/system-service-win32-x64",
          version: "1.2.3",
          os: ["win32"],
          cpu: ["x64"]
        },
        filename: "wanex-system-service-win32-x64-1.2.3.tgz"
      }]
    })
    try {
      const metadata = await fetch(
        `${registry.endpoint}/@wanex%2Fsystem-service-win32-x64`
      )
      expect(metadata.status).toBe(200)
      const body = await metadata.json()
      const tarball = await fetch(body.versions["1.2.3"].dist.tarball)
      expect(tarball.status).toBe(404)
    } finally {
      await registry.close()
    }
  })
})
