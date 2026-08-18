import { describe, expect, it } from "vitest"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

describe("@wanex/app trusted Provider host", () => {
  it("configures an empty profile once without exposing the credential", async () => {
    const storeDir = await createStoreDir()
    const credentialStore = new TestSecretStore()
    const credential = "onboarding-secret-value"
    const observed: unknown[] = []
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      trustedProviderHost: {
        credentialStore,
        credentialPolicy: testCredentialPolicy,
        createRevisionId: () => "revision-1",
        async requestInitialReplacement(endpoints) {
          observed.push(endpoints)
          return {
            connectionId: "connection_onboarding-provider",
            credential,
            modelEndpoints: [appTestModelEndpoint({
              endpointId: "onboarding-provider",
              protocolId: "openai-chat-completions",
              providerId: "openai-compatible",
              modelId: "onboarding-model",
              baseUrl: "https://provider.example.test/v1"
            })],
            makeActiveEndpointId: "onboarding-provider"
          }
        }
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      expect(observed).toEqual([{ endpoints: [] }])
      await expect(app.commands.readActiveModelEndpoint()).resolves
        .toMatchObject({
          id: "onboarding-provider",
          credentialConfigured: true,
          active: true
        })
      expect(app.status().activeModelEndpointId).toBe("onboarding-provider")
      expect(JSON.stringify(await app.commands.listModelEndpoints()))
        .not.toContain(credential)
      await expect(storage.getConfig("model.endpoint.onboarding-provider"))
        .resolves.toMatchObject({
          connection: {
            secretRef:
              "test-secret://host/connection_onboarding-provider.revision-1"
          }
        })
      expect(credentialStore.values()).toEqual([
        [
          "test-secret://host/connection_onboarding-provider.revision-1",
          credential
        ]
      ])
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("lets a configured profile bypass mutation without touching credentials", async () => {
    const storeDir = await createStoreDir()
    const seed = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "already-configured",
        modelId: "configured-model"
      })
    })
    await seed.dispose()
    const credentialStore = new TestSecretStore()
    let callbackCount = 0
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      trustedProviderHost: {
        credentialStore,
        credentialPolicy: testCredentialPolicy,
        async requestInitialReplacement(endpoints) {
          callbackCount += 1
          expect(endpoints).toMatchObject({
            activeEndpointId: "already-configured",
            endpoints: [{ id: "already-configured", active: true }]
          })
          return undefined
        }
      }
    })

    try {
      expect(callbackCount).toBe(1)
      expect(credentialStore.values()).toEqual([])
      await expect(app.commands.readActiveModelEndpoint()).resolves
        .toMatchObject({ id: "already-configured", active: true })
    } finally {
      await app.dispose()
    }
  })

  it("disposes the partially started App when onboarding fails", async () => {
    const storeDir = await createStoreDir()
    const credentialStore = new TestSecretStore()
    let releaseCount = 0

    await expect(createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      trustedProviderHost: {
        credentialStore,
        credentialPolicy: testCredentialPolicy,
        bindMutationCoordinator() {
          return () => {
            releaseCount += 1
          }
        },
        async requestInitialReplacement() {
          throw new Error("onboarding cancelled")
        }
      }
    })).rejects.toThrow("onboarding cancelled")

    const restarted = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })
    await restarted.dispose()
    expect(credentialStore.values()).toEqual([])
    expect(releaseCount).toBe(1)
  })

  it("binds the mutation coordinator only to the trusted host and releases it once", async () => {
    const storeDir = await createStoreDir()
    const credentialStore = new TestSecretStore()
    let bound = false
    let releaseCount = 0
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      trustedProviderHost: {
        credentialStore,
        credentialPolicy: testCredentialPolicy,
        bindMutationCoordinator(coordinator) {
          bound = typeof coordinator.replace === "function" &&
            typeof coordinator.remove === "function"
          return () => {
            releaseCount += 1
          }
        },
        async requestInitialReplacement() {
          return undefined
        }
      }
    })

    expect(bound).toBe(true)
    expect("providerMutation" in app).toBe(false)
    await app.dispose()
    await app.dispose()
    expect(releaseCount).toBe(1)
  })
})

const testCredentialPolicy = {
  scheme: "test-secret",
  createRef(input: { readonly connectionId: string; readonly revisionId: string }) {
    return `test-secret://host/${input.connectionId}.${input.revisionId}`
  },
  ownsRef(ref: string) {
    return ref.startsWith("test-secret://host/")
  }
}

class TestSecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly secrets = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }) {
    this.secrets.set(request.ref, request.value)
  }

  async delete(ref: string) {
    this.secrets.delete(ref)
  }

  async resolve(ref: string, _context?: SecretResolveContext) {
    const value = this.secrets.get(ref)
    if (value === undefined) throw new Error("test credential is missing")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }

  values(): readonly (readonly [string, string])[] {
    return [...this.secrets.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  }
}
