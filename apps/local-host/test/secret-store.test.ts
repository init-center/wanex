import { describe, expect, it } from "vitest"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretResolverPort,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import {
  composeLocalSecretStore,
  localSecretNamespace
} from "../src/index.js"
import {
  wanexLocalCredentialRef
} from "@wanex/local-credential-store"

describe("local host secret-store composition", () => {
  it("routes owned credentials to the injected store and external refs to the fallback resolver", async () => {
    const credentialStore = new MemorySecretStore()
    const fallbackRefs: string[] = []
    const fallbackSecretResolver: SecretResolverPort = {
      async resolve(ref: string) {
        fallbackRefs.push(ref)
        return new InMemoryResolvedSecret({
          ref,
          provider: "fallback",
          value: "external-secret"
        })
      }
    }
    const secrets = await composeLocalSecretStore({
      storage: {
        kind: "store-dir",
        storeDir: "/tmp/wanex-local-host-secret-store-test"
      },
      credentialStore,
      fallbackSecretResolver
    })
    const ownedRef = wanexLocalCredentialRef({
      scheme: credentialStore.scheme,
      namespace: secrets.namespace,
      connectionId: "provider-connection",
      revisionId: "revision-3"
    })
    await credentialStore.put({ ref: ownedRef, value: "owned-secret" })

    const owned = await secrets.secretResolver.resolve(ownedRef)
    expect(owned.reveal()).toBe("owned-secret")
    expect(owned.provider).toBe(credentialStore.scheme)
    owned.dispose()
    expect(fallbackRefs).toEqual([])

    const external = await secrets.secretResolver.resolve("env://WANEX_TEST_KEY")
    expect(external.reveal()).toBe("external-secret")
    expect(external.provider).toBe("fallback")
    external.dispose()
    expect(fallbackRefs).toEqual(["env://WANEX_TEST_KEY"])
  })

  it("fails closed when no resolver owns a non-local secret scheme", async () => {
    const credentialStore = new MemorySecretStore()
    const secrets = await composeLocalSecretStore({
      storage: {
        kind: "store-dir",
        storeDir: "/tmp/wanex-local-host-secret-store-no-fallback"
      },
      credentialStore
    })

    await expect(
      secrets.secretResolver.resolve("env://WANEX_TEST_KEY")
    ).rejects.toThrow("no secret resolver configured for scheme: env")
  })

  it("derives stable isolated namespaces from resolved local stores", () => {
    const first = localSecretNamespace({
      kind: "store-dir",
      storeDir: "/tmp/wanex-local-host-secret-store-a"
    })
    const second = localSecretNamespace({
      kind: "store-dir",
      storeDir: "/tmp/wanex-local-host-secret-store-b"
    })

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(first).not.toBe(second)
  })
})

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.values.get(ref)
    if (value === undefined) {
      throw new Error("test credential is not configured")
    }
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value
    })
  }
}
