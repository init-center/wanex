import { describe, expect, it } from "vitest"
import {
  createWanexLocalKeychainSecretStoreFromBinding,
  type WanexLocalKeychainEntry
} from "../src/binding.js"
import {
  isWanexLocalCredentialRef,
  wanexLocalCredentialPolicy,
  wanexLocalCredentialRef
} from "../src/reference.js"

describe("@wanex/local-credential-store", () => {
  it("stores, resolves, disposes, and deletes an owned credential", async () => {
    const entries = new Map<string, string>()
    const accesses: string[] = []
    const namespace = "b".repeat(64)
    const store = createWanexLocalKeychainSecretStoreFromBinding({
      namespace,
      binding: {
        Entry: class implements WanexLocalKeychainEntry {
          private readonly key: string

          constructor(service: string, account: string) {
            this.key = `${service}:${account}`
            accesses.push(this.key)
          }

          setPassword(value: string): void {
            entries.set(this.key, value)
          }

          deleteCredential(): boolean {
            return entries.delete(this.key)
          }

          getPassword(): string | null {
            return entries.get(this.key) ?? null
          }
        }
      }
    })
    const ref = wanexLocalCredentialRef({
      namespace,
      connectionId: "desktop-provider",
      revisionId: "revision-2"
    })

    await store.put({ ref, value: "desktop-secret" })
    const resolved = await store.resolve(ref)
    expect(resolved.reveal()).toBe("desktop-secret")
    resolved.dispose()
    expect(resolved.disposed).toBe(true)
    expect(() => resolved.reveal()).toThrow("secret has been disposed")
    expect(accesses).toEqual([
      `com.wanex.product.${namespace}:desktop-provider.revision-2`,
      `com.wanex.product.${namespace}:desktop-provider.revision-2`
    ])

    await store.delete(ref)
    await expect(store.resolve(ref)).rejects.toThrow(
      "keychain credential is not configured"
    )
  })

  it("rejects empty values, malformed refs, and another namespace", async () => {
    const namespace = "c".repeat(64)
    const store = createWanexLocalKeychainSecretStoreFromBinding({
      namespace,
      binding: {
        Entry: class implements WanexLocalKeychainEntry {
          setPassword(): void {}
          deleteCredential(): boolean { return false }
          getPassword(): string | null { return null }
        }
      }
    })
    const ref = wanexLocalCredentialRef({
      namespace,
      connectionId: "provider",
      revisionId: "revision"
    })

    await expect(store.put({ ref, value: "" })).rejects.toThrow(
      "credential value must not be empty"
    )
    await expect(store.resolve("not-a-ref")).rejects.toThrow(
      "keychain secret ref is invalid"
    )
    await expect(store.resolve(
      `wanex-keychain://${"d".repeat(64)}/provider.revision`
    )).rejects.toThrow("not owned by this local host")
  })

  it("normalizes one strict opaque reference contract", () => {
    const namespace = "e".repeat(64)
    const ref = wanexLocalCredentialRef({
      namespace,
      connectionId: "provider/with space",
      revisionId: "revision_3"
    })

    expect(ref).toBe(
      `wanex-keychain://${namespace}/provider%2Fwith%20space.revision_3`
    )
    expect(isWanexLocalCredentialRef({ ref, namespace })).toBe(true)
    expect(isWanexLocalCredentialRef({
      ref,
      namespace: "f".repeat(64)
    })).toBe(false)
    expect(() => wanexLocalCredentialRef({
      namespace: "short",
      connectionId: "provider",
      revisionId: "revision"
    })).toThrow("credential namespace")
    expect(() => wanexLocalCredentialRef({
      namespace,
      connectionId: "provider",
      revisionId: "revision.with.dot"
    })).toThrow("credential revision id is invalid")
  })

  it("creates one reusable host-owned credential policy", () => {
    const namespace = "a".repeat(64)
    const policy = wanexLocalCredentialPolicy({
      namespace,
      scheme: "test-secret"
    })
    const ref = policy.createRef({
      connectionId: "provider/with space",
      revisionId: "revision-4"
    })

    expect(policy.scheme).toBe("test-secret")
    expect(ref).toBe(
      `test-secret://${namespace}/provider%2Fwith%20space.revision-4`
    )
    expect(policy.ownsRef(ref)).toBe(true)
    expect(policy.ownsRef(
      `test-secret://${"f".repeat(64)}/provider.revision-4`
    )).toBe(false)
  })
})
