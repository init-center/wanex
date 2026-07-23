import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app provider commands", () => {
  it("initializes a trusted full provider profile at startup", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "startup-openai-compatible",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "startup-model",
        baseUrl: "https://api.example.invalid/v1",
        secretRef: "env://STARTUP_PROVIDER_API_KEY"
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(app.commands.readActiveProviderProfile()).resolves.toEqual({
        id: "startup-openai-compatible",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "startup-model",
        baseUrl: "https://api.example.invalid/v1",
        credentialConfigured: true,
        active: true
      })
      expect(
        JSON.stringify(await app.commands.listProviderProfiles())
      ).not.toContain("STARTUP_PROVIDER_API_KEY")
      await expect(
        storage.getConfig("provider.profile.startup-openai-compatible")
      ).resolves.toMatchObject({
        secretRef: "env://STARTUP_PROVIDER_API_KEY"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("manages provider profiles through redacted product commands", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(app.commands.readActiveProviderProfile()).resolves.toEqual({
        id: "wanex-app-fake",
        kind: "fake",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "fake",
        modelId: "wanex-app-model",
        credentialConfigured: false,
        active: true
      })

      await expect(
        app.commands.upsertProviderProfile({
          profile: {
            id: "openai-compatible-redacted",
            kind: "openai-compatible",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "openai-compatible",
            modelId: "redacted-model",
            baseUrl: "https://api.example.invalid/v1",
            secretRef: "env://REDACTED_PROVIDER_API_KEY"
          }
        })
      ).resolves.toEqual({
        id: "openai-compatible-redacted",
        kind: "openai-compatible",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "openai-compatible",
        modelId: "redacted-model",
        baseUrl: "https://api.example.invalid/v1",
        credentialConfigured: true,
        active: false
      })
      await expect(
        app.commands.listProviderProfiles()
      ).resolves.toMatchObject({
        activeProfileId: "wanex-app-fake",
        profiles: [
          {
            id: "openai-compatible-redacted",
            active: false,
            credentialConfigured: true,
          },
          {
            id: "wanex-app-fake",
            active: true
          }
        ]
      })
      const storedProfile = await storage.getConfig(
        "provider.profile.openai-compatible-redacted"
      )
      expect(storedProfile).toMatchObject({
        secretRef: "env://REDACTED_PROVIDER_API_KEY"
      })
      expect(
        JSON.stringify(
          await app.commands.readProviderProfile({
            profileId: "openai-compatible-redacted"
          })
        )
      ).not.toContain("REDACTED_PROVIDER_API_KEY")

      await expect(
        app.commands.upsertProviderProfile({
          profile: {
            id: "second-fake",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "second-model"
          },
          makeActive: true
        })
      ).resolves.toMatchObject({
        id: "second-fake",
        active: true
      })
      expect(app.status()).toMatchObject({
        activeProviderProfileId: "second-fake"
      })
      await expect(
        app.commands.runAgentTurn({
          content: [{ type: "text", text: "uses switched profile" }],
          sessionId: "ses_wanex_app_profile_switch"
        })
      ).resolves.toMatchObject({
        assistantText: "Fake response from second-model"
      })

      await expect(
        app.commands.setActiveProviderProfile({
          profileId: "missing-profile"
        })
      ).rejects.toThrow("provider profile not found: missing-profile")
      await expect(
        app.commands.safeCommand({
          command: "setActiveProviderProfile",
          run: () =>
            app.commands.setActiveProviderProfile({
              profileId: "missing-profile"
            })
        })
      ).resolves.toEqual({
        ok: false,
        command: "setActiveProviderProfile",
        error: {
          code: "validation_error",
          category: "validation",
          message: "provider profile not found: missing-profile"
        }
      })
      await expect(
        app.commands.readProviderProfile({
          profileId: "missing-profile"
        })
      ).resolves.toBeNull()
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("keeps the active provider profile across wanex-app restarts", async () => {
    const storeDir = await createStoreDir()
    const first = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await expect(
        first.commands.upsertProviderProfile({
          profile: {
            id: "persisted-fake",
            kind: "fake",
            capabilities: { input: ["text"], output: ["text"] },
            providerId: "fake",
            modelId: "persisted-model"
          },
          makeActive: true
        })
      ).resolves.toMatchObject({
        id: "persisted-fake",
        active: true
      })
    } finally {
      await first.dispose()
    }

    const second = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      expect(second.status()).toMatchObject({
        activeProviderProfileId: "persisted-fake"
      })
      await expect(second.commands.listProviderProfiles()).resolves.toMatchObject({
        activeProfileId: "persisted-fake",
        profiles: [
          {
            id: "persisted-fake",
            active: true
          },
          {
            id: "wanex-app-fake",
            active: false
          }
        ]
      })
      await expect(
        second.commands.runAgentTurn({
          content: [{ type: "text", text: "after restart" }],
          sessionId: "ses_wanex_app_profile_restart"
        })
      ).resolves.toMatchObject({
        assistantText: "Fake response from persisted-model"
      })
    } finally {
      await second.dispose()
    }
  })

  it("freezes provider policy per turn and regenerates as a fresh binding", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "first-profile",
        kind: "fake",
        capabilities: { input: ["text"], output: ["text"] },
        providerId: "fake",
        modelId: "first-model"
      },
      workerCount: 2
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await app.stop()
      const first = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "first admission" }],
        sessionId: "ses_app_provider_binding_first"
      })
      await app.commands.upsertProviderProfile({
        profile: {
          id: "second-profile",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "second-model"
        },
        makeActive: true
      })
      const second = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "second admission" }],
        sessionId: "ses_app_provider_binding_second"
      })

      const firstQueued = (
        await storage.listSessionTurns({ sessionId: first.sessionId })
      )[0]
      const secondQueued = (
        await storage.listSessionTurns({ sessionId: second.sessionId })
      )[0]
      expect(firstQueued?.executionBinding.provider.profileId).toBe(
        "first-profile"
      )
      expect(secondQueued?.executionBinding.provider.profileId).toBe(
        "second-profile"
      )

      app.start()
      await terminalOperation(app, first)
      await terminalOperation(app, second)

      const regenerated = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "regenerate first with current policy" }],
        sessionId: first.sessionId,
        regeneratesTurnId: first.turnId
      })
      expect(regenerated.inputId).not.toBe(first.inputId)
      expect(regenerated.turnId).not.toBe(first.turnId)
      expect(regenerated.jobId).not.toBe(first.jobId)
      await terminalOperation(app, regenerated)

      const turns = await storage.listSessionTurns({
        sessionId: first.sessionId
      })
      expect(turns).toHaveLength(2)
      expect(turns[0]).toMatchObject({
        id: first.turnId
      })
      expect(turns[0]?.regeneratesTurnId).toBeUndefined()
      expect(turns[0]?.executionBinding.provider.profileId).toBe(
        "first-profile"
      )
      expect(turns[1]).toMatchObject({
        id: regenerated.turnId,
        regeneratesTurnId: first.turnId
      })
      expect(turns[1]?.executionBinding.provider.profileId).toBe(
        "second-profile"
      )
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

})

async function terminalOperation(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  reference: {
    readonly sessionId: string
    readonly inputId: string
    readonly turnId: string
    readonly jobId: string
  }
) {
  let lastState = "missing"
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await app.commands.readConversationOperation(reference)
    if (result.kind === "found") {
      lastState = result.operation.state
      if (result.operation.state === "succeeded") {
        return result.operation
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`conversation operation did not succeed: ${lastState}`)
}
