import { Entry } from "@napi-rs/keyring"
import {
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import {
  createWanexLocalKeychainSecretStoreFromBinding
} from "./binding.js"
import { WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME } from "./reference.js"

export class WanexLocalKeychainSecretStore implements SecretStorePort {
  readonly scheme = WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  private readonly delegate: SecretStorePort

  constructor(options: { readonly namespace: string }) {
    this.delegate = createWanexLocalKeychainSecretStoreFromBinding({
      namespace: options.namespace,
      binding: { Entry }
    })
  }

  async put(request: {
    readonly ref: string
    readonly value: string
  }): Promise<void> {
    await this.delegate.put(request)
  }

  async delete(ref: string): Promise<void> {
    await this.delegate.delete(ref)
  }

  async resolve(ref: string, context?: SecretResolveContext) {
    return await this.delegate.resolve(ref, context)
  }
}
