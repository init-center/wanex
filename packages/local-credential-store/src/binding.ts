import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import {
  normalizeWanexLocalCredentialNamespace,
  WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
} from "./reference.js"

export interface WanexLocalKeychainEntry {
  setPassword(value: string): void
  deleteCredential(): boolean
  getPassword(): string | null
}

export interface WanexLocalKeychainBinding {
  readonly Entry: new (
    service: string,
    account: string
  ) => WanexLocalKeychainEntry
}

export function createWanexLocalKeychainSecretStoreFromBinding(options: {
  readonly namespace: string
  readonly binding: WanexLocalKeychainBinding
}): SecretStorePort {
  return new BindingBackedWanexLocalKeychainSecretStore(options)
}

class BindingBackedWanexLocalKeychainSecretStore implements SecretStorePort {
  readonly scheme = WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  private readonly namespace: string
  private readonly service: string
  private readonly binding: WanexLocalKeychainBinding

  constructor(options: {
    readonly namespace: string
    readonly binding: WanexLocalKeychainBinding
  }) {
    this.namespace = normalizeWanexLocalCredentialNamespace(options.namespace)
    this.service = `com.wanex.product.${this.namespace}`
    this.binding = options.binding
  }

  async put(request: {
    readonly ref: string
    readonly value: string
  }): Promise<void> {
    if (request.value.length === 0) {
      throw new Error("credential value must not be empty")
    }
    this.entryFor(request.ref).setPassword(request.value)
  }

  async delete(ref: string): Promise<void> {
    this.entryFor(ref).deleteCredential()
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.entryFor(ref).getPassword()
    if (value === null || value.length === 0) {
      throw new Error("keychain credential is not configured")
    }
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value
    })
  }

  private entryFor(ref: string): WanexLocalKeychainEntry {
    return new this.binding.Entry(
      this.service,
      accountFromRef(ref, this.namespace)
    )
  }
}

function accountFromRef(ref: string, expectedNamespace: string): string {
  let url: URL
  try {
    url = new URL(ref)
  } catch {
    throw new Error("keychain secret ref is invalid")
  }
  if (
    url.protocol !== `${WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME}:` ||
    url.hostname !== expectedNamespace ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error("keychain secret ref is not owned by this local host")
  }
  const rawAccount = url.pathname.slice(1)
  if (rawAccount.length === 0 || rawAccount.includes("/")) {
    throw new Error("keychain secret ref account is invalid")
  }
  let account: string
  try {
    account = decodeURIComponent(rawAccount)
  } catch {
    throw new Error("keychain secret ref account is invalid")
  }
  if (account.length === 0) {
    throw new Error("keychain secret ref account is invalid")
  }
  return account
}
