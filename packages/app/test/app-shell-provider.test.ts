import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexAppShell } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app provider commands", () => {
  it("initializes a trusted full provider profile at startup", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
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
        providerId: "openai-compatible",
        modelId: "startup-model",
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "startup-secret"
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
        providerId: "openai-compatible",
        modelId: "startup-model",
        baseUrl: "https://api.example.invalid/v1",
        hasApiKey: true,
        apiKeyRedacted: "***",
        active: true
      })
      expect(
        JSON.stringify(await app.commands.listProviderProfiles())
      ).not.toContain("startup-secret")
      await expect(
        storage.getConfig("provider.profile.startup-openai-compatible")
      ).resolves.toMatchObject({
        apiKey: "startup-secret"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("manages provider profiles through redacted product commands", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
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
        id: "app-shell-fake",
        kind: "fake",
        providerId: "fake",
        modelId: "app-shell-model",
        hasApiKey: false,
        active: true
      })

      await expect(
        app.commands.upsertProviderProfile({
          profile: {
            id: "openai-compatible-redacted",
            kind: "openai-compatible",
            providerId: "openai-compatible",
            modelId: "redacted-model",
            baseUrl: "https://api.example.invalid/v1",
            apiKey: "sk-secret-value"
          }
        })
      ).resolves.toEqual({
        id: "openai-compatible-redacted",
        kind: "openai-compatible",
        providerId: "openai-compatible",
        modelId: "redacted-model",
        baseUrl: "https://api.example.invalid/v1",
        hasApiKey: true,
        apiKeyRedacted: "***",
        active: false
      })
      await expect(
        app.commands.listProviderProfiles()
      ).resolves.toMatchObject({
        activeProfileId: "app-shell-fake",
        profiles: [
          {
            id: "app-shell-fake",
            active: true
          },
          {
            id: "openai-compatible-redacted",
            active: false,
            hasApiKey: true,
            apiKeyRedacted: "***"
          }
        ]
      })
      const storedProfile = await storage.getConfig(
        "provider.profile.openai-compatible-redacted"
      )
      expect(storedProfile).toMatchObject({
        apiKey: "sk-secret-value"
      })
      expect(
        JSON.stringify(
          await app.commands.readProviderProfile({
            profileId: "openai-compatible-redacted"
          })
        )
      ).not.toContain("sk-secret-value")

      await expect(
        app.commands.upsertProviderProfile({
          profile: {
            id: "second-fake",
            kind: "fake",
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
          text: "uses switched profile",
          sessionId: "ses_app_shell_profile_switch"
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


  it("keeps the active provider profile across app-shell restarts", async () => {
    const storeDir = await createStoreDir()
    const first = await createWanexAppShell({
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

    const second = await createWanexAppShell({
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
            id: "app-shell-fake",
            active: false
          },
          {
            id: "persisted-fake",
            active: true
          }
        ]
      })
      await expect(
        second.commands.runAgentTurn({
          text: "after restart",
          sessionId: "ses_app_shell_profile_restart"
        })
      ).resolves.toMatchObject({
        assistantText: "Fake response from persisted-model"
      })
    } finally {
      await second.dispose()
    }
  })

})
