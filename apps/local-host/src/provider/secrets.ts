import { resolve } from "node:path"
import { resolveLocalStore } from "@wanex/storage"
import { wanexLocalCredentialNamespace } from "@wanex/local-credential-store"
import {
  schemeFromRef,
  type SecretResolveContext,
  type SecretResolverPort,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import type { LocalStorageConfig } from "../model.js"

export interface LocalSecretStoreComposition {
  readonly namespace: string
  readonly credentialStore: SecretStorePort
  readonly secretResolver: SecretResolverPort
}

export async function composeLocalSecretStore(options: {
  readonly storage: LocalStorageConfig
  readonly credentialStore?: SecretStorePort
  readonly fallbackSecretResolver?: SecretResolverPort
}): Promise<LocalSecretStoreComposition> {
  const namespace = localSecretNamespace(options.storage)
  const credentialStore =
    options.credentialStore ?? await createDefaultCredentialStore(namespace)
  return {
    namespace,
    credentialStore,
    secretResolver: composeSecretResolvers({
      credentialStore,
      ...(options.fallbackSecretResolver === undefined
        ? {}
        : { fallbackSecretResolver: options.fallbackSecretResolver })
    })
  }
}

async function createDefaultCredentialStore(
  namespace: string
): Promise<SecretStorePort> {
  const keychain = await import("@wanex/local-credential-store/keychain") as {
    readonly WanexLocalKeychainSecretStore: new (options: {
      readonly namespace: string
    }) => SecretStorePort
  }
  return new keychain.WanexLocalKeychainSecretStore({ namespace })
}

export function localSecretNamespace(
  storage: LocalStorageConfig
): string {
  const location =
    storage.kind === "profile"
      ? resolveLocalStore({
          rootDir: storage.rootDir,
          ...(storage.profileId === undefined
            ? {}
            : { profileId: storage.profileId })
        }).storeDir
      : resolve(storage.storeDir)
  return wanexLocalCredentialNamespace(location)
}

function composeSecretResolvers(options: {
  readonly credentialStore: SecretStorePort
  readonly fallbackSecretResolver?: SecretResolverPort
}): SecretResolverPort {
  return {
    async resolve(ref: string, context?: SecretResolveContext) {
      if (schemeFromRef(ref) === options.credentialStore.scheme.toLowerCase()) {
        return await options.credentialStore.resolve(ref, context)
      }
      if (options.fallbackSecretResolver === undefined) {
        throw new Error(`no secret resolver configured for scheme: ${schemeFromRef(ref)}`)
      }
      return await options.fallbackSecretResolver.resolve(ref, context)
    }
  }
}
