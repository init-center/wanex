import { afterEach, expect, it, vi } from "vitest"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createWanexApp } from "../src/index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

afterEach(() => vi.unstubAllGlobals())

it("projects native conversation images and restores exact resource content without exposing signatures", async () => {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  const requests: Record<string, unknown>[] = []
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body) as Record<string, unknown>)
    return { ok: true, status: 200, statusText: "OK", text: async () => "", body: (async function* () {
      yield `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [
        { text: "Before" }, { inlineData: { mimeType: "image/png", data: bytes.toString("base64") }, thoughtSignature: "private-signature" }, { text: "After" }
      ] }, finishReason: "STOP" }] })}\n\n`
    })() }
  })
  const storeDir = await createStoreDir()
  const options = { storage: { kind: "local-system-service" as const, storeDir, mode: "persistent" as const },
    artifacts: { explicitPath: serviceBin },
    modelEndpoint: { id: "direct-image", connection: { id: "direct-image", providerId: "google", baseUrl: "https://fixture.invalid", secretRef: "static:key" },
      protocol: { id: "gemini-generate-content" }, model: { id: "direct-image", operations: ["conversation"] as const,
        inputModalities: ["text", "image"] as const, outputModalities: ["text", "image"] as const, features: [],
        catalog: { source: "custom" as const, catalogId: "test", revision: "1" } } },
    secretResolver: new SecretResolver([new StaticSecretProvider({ values: { "static:key": "key" } })]) }
  let app = await createWanexApp(options)
  try {
    await app.commands.runAgentTurn({ sessionId: "direct-image", content: [{ type: "text", text: "create" }] })
    const first = await app.commands.readSessionTranscript({ sessionId: "direct-image" })
    const assistant = first.rows.find((row) => row.role === "assistant")!
    expect(assistant.parts.map((part) => part.type)).toEqual(["text", "resource", "text"])
    const image = assistant.parts.find((part) => part.type === "resource")!
    expect(JSON.stringify(first)).not.toMatch(/private-signature|iVBOR|secretRef|logicalPath/)
    expect((await app.commands.readResourceContent({ resourceId: image.resourceId, expectedSha256: image.sha256, offset: 0, limit: bytes.length }))?.content).toEqual(Uint8Array.from(bytes))
    await app.dispose()
    app = await createWanexApp(options)
    expect(await app.commands.readSessionTranscript({ sessionId: "direct-image" })).toEqual(first)
    await app.commands.runAgentTurn({ sessionId: "direct-image", content: [{ type: "text", text: "adjust" }] })
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).toContain("private-signature")
    expect(JSON.stringify(requests[1])).toContain(bytes.toString("base64"))
  } finally { await app.dispose() }
})
