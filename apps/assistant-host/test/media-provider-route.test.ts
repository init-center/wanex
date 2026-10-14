import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { startAssistantWebApp, type AssistantWebApp } from "../src/index.js"
import { browserAssets } from "./support/browser-assets.js"
import { InMemoryResolvedSecret, type SecretResolveContext, type SecretStorePort } from "@wanex/runtime/secrets"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const apps: AssistantWebApp[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("independent media provider management", () => {
  it("keeps media profiles out of the conversation provider route", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-media-provider-route-"))
    tempDirs.push(storeDir)
    const app = await startAssistantWebApp({
      browserAssets,
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore: new TestSecretStore(),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const token = await readHostSessionToken(app.url)
    const headers = {
      "content-type": "application/json",
      "x-wanex-host-session": token
    }

    const saved = await fetch(`${app.url}/wanex/assistant/media-providers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        presetId: "gemini-image",
        modelId: "gemini-2.5-flash-image",
        credential: "test-gemini-key"
      })
    })
    const savedBody = await saved.json() as {
      readonly providers: { readonly providers: readonly {
        readonly connectionId: string
        readonly endpoints: readonly { readonly id: string; readonly protocol: { readonly id: string } }[]
      }[] }
      readonly imageGeneration: { readonly status: string }
    }
    expect(savedBody.providers.providers).toHaveLength(1)
    expect(savedBody.providers.providers[0]?.endpoints[0]?.protocol.id).toBe("gemini-image")
    expect(savedBody.providers.providers[0]?.endpoints[0]).toMatchObject({
      model: { generationOptions: [{ name: "aspect_ratio", type: "string", enum: expect.arrayContaining(["1:1", "16:9"]) }] }
    })
    expect(savedBody.imageGeneration.status).toBe("ready")

    await expect(app.providers.listProviders()).resolves.toMatchObject({ providers: [] })
    await expect(app.mediaProviders.listProviders()).resolves.toMatchObject({
      providers: [{ endpoints: [{ protocol: { id: "gemini-image" } }] }]
    })

    const endpointId = savedBody.providers.providers[0]?.endpoints[0]?.id
    const selected = await fetch(`${app.url}/wanex/assistant/media-providers`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ modelEndpointId: endpointId })
    })
    expect(selected.status).toBe(200)
    expect(await selected.json()).toMatchObject({
      kind: "web.media-provider-route-response",
      imageGeneration: { status: "ready", selectedEndpoint: { id: endpointId } }
    })

    const removed = await fetch(`${app.url}/wanex/assistant/media-providers`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        connectionId: savedBody.providers.providers[0]?.connectionId
      })
    })
    expect(removed.status).toBe(200)
    await expect(app.mediaProviders.listProviders()).resolves.toMatchObject({ providers: [] })
  })
})

class TestSecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  async put(_request: { readonly ref: string; readonly value: string }): Promise<void> {}
  async delete(_ref: string): Promise<void> {}
  async resolve(ref: string, _context?: SecretResolveContext): Promise<InMemoryResolvedSecret> {
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value: "test-gemini-key" })
  }
}

async function readHostSessionToken(url: string): Promise<string> {
  const html = await (await fetch(url)).text()
  const match = /data-host-session-token="([^"]+)"/.exec(html)
  if (match?.[1] === undefined) throw new Error("host session token was not rendered")
  return match[1]
}
