import { describe, expect, it } from "vitest"
import { createWanexApp } from "../src/index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

describe("@wanex/app public App Host", () => {
  it("owns durable commands, configurable workers, restart, and final disposal", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "public-app-test",
        modelId: "public-app-model"
      }),
      workerCount: 2
    })

    try {
      expect(app.status()).toMatchObject({
        disposed: false,
        started: true,
        workerCount: 2,
        activeModelEndpointId: "public-app-test"
      })
      expect(app.events.subscribeConversationEvents).toBeTypeOf("function")
      expect(app.events.subscribeGoalEvents).toBeTypeOf("function")

      await app.stop()
      expect(app.status()).toMatchObject({
        disposed: false,
        started: false,
        workerCount: 2
      })
      const submitted = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "hello public app" }],
        sessionId: "ses_public_app"
      })
      await expect(
        app.commands.readConversationOperation(submitted)
      ).resolves.toMatchObject({
        kind: "found",
        operation: { state: "queued" }
      })

      app.start()
      const completed = await eventually(async () => {
        const result = await app.commands.readConversationOperation(submitted)
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            result: {
              assistantText: "Fake response from public-app-model",
              messageCount: 2
            }
          }
        })
        return result
      })
      expect(completed).toMatchObject({
        kind: "found",
        reference: {
          sessionId: "ses_public_app"
        }
      })
    } finally {
      await app.dispose()
      await app.dispose()
    }

    expect(app.status().disposed).toBe(true)
  })
})

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}
