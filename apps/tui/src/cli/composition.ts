import { resolve } from "node:path"
import type { JsonValue } from "@wanex/protocol"
import type { StartAssistantHostOptions } from "@wanex/assistant-host/application"
import { modelEndpointFromJson } from "@wanex/runtime/provider"
import {
  EnvSecretProvider,
  SecretResolver,
  schemeFromRef,
  type SecretResolverPort,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import {
  wanexLocalCredentialNamespace,
  WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
} from "@wanex/local-credential-store"
import type { TuiCliEnvironment } from "./model.js"
import type { Terminal } from "@earendil-works/pi-tui"
import {
  createTuiTrustedProviderHost,
  type TuiTrustedProviderHost
} from "../provider/host.js"

const supportedProviderProtocols = new Set([
  "fake",
  "openai-chat-completions",
  "anthropic-messages"
])

export interface TuiCliComposition {
  readonly hostOptions: StartAssistantHostOptions
  readonly trustedProviderHost?: TuiTrustedProviderHost
}

export function createTuiCliComposition(
  env: TuiCliEnvironment,
  host?: {
    readonly providerTerminal?: Terminal
    readonly signal?: AbortSignal
    readonly credentialStore?: SecretStorePort
  }
): TuiCliComposition {
  const storeDir = resolve(env.WANEX_STORE_DIR ?? defaultStoreDir())
  const modelEndpoint = resolveTuiCliModelEndpoint(env)
  const namespace = wanexLocalCredentialNamespace(storeDir)
  const credentialStore = host?.credentialStore ??
    createTuiCliCredentialStore(namespace)
  const trustedProviderHost = host?.providerTerminal === undefined
    ? undefined
    : createTuiTrustedProviderHost({
        terminal: host.providerTerminal,
        namespace,
        credentialStore,
        ...(host.signal === undefined ? {} : { signal: host.signal })
      })
  return {
    ...(trustedProviderHost === undefined ? {} : { trustedProviderHost }),
    hostOptions: {
      storage: {
        kind: "store-dir",
        mode: "persistent",
        storeDir
      },
      ...(env.WANEX_SYSTEM_SERVICE_BIN === undefined
        ? {}
        : { serviceBin: env.WANEX_SYSTEM_SERVICE_BIN }),
      credentialStore,
      secretResolver: createTuiCliSecretResolver({
        env,
        storeDir,
        credentialStore
      }),
      ...(trustedProviderHost === undefined ? {} : { trustedProviderHost }),
      ...(modelEndpoint === undefined ? {} : { modelEndpoint })
    }
  }
}

export function resolveTuiCliModelEndpoint(
  env: TuiCliEnvironment
): StartAssistantHostOptions["modelEndpoint"] {
  const values = endpointValues(env)
  if (values.every((value) => value === undefined)) {
    return undefined
  }
  requireTogether(env, [
    "WANEX_MODEL_ENDPOINT_ID",
    "WANEX_PROVIDER_PROTOCOL",
    "WANEX_PROVIDER_ID",
    "WANEX_PROVIDER_MODEL_ID"
  ])

  const protocolId = requiredValue(
    env.WANEX_PROVIDER_PROTOCOL,
    "WANEX_PROVIDER_PROTOCOL"
  )
  if (!supportedProviderProtocols.has(protocolId)) {
    throw new Error(`unsupported TUI Provider protocol: ${protocolId}`)
  }
  const fake = protocolId === "fake"
  if (fake) {
    rejectPresent(env, [
      "WANEX_PROVIDER_BASE_URL",
      "WANEX_PROVIDER_SECRET_REF",
      "WANEX_PROVIDER_PROTOCOL_VERSION"
    ], "fake Provider endpoint")
  } else {
    requireTogether(env, [
      "WANEX_PROVIDER_BASE_URL",
      "WANEX_PROVIDER_SECRET_REF"
    ])
  }

  const endpointId = requiredValue(
    env.WANEX_MODEL_ENDPOINT_ID,
    "WANEX_MODEL_ENDPOINT_ID"
  )
  const reasoningReplay = optionalValue(env.WANEX_MODEL_REASONING_REPLAY)
  return modelEndpointFromJson({
    id: endpointId,
    connection: {
      id: optionalValue(env.WANEX_PROVIDER_CONNECTION_ID) ?? endpointId,
      providerId: requiredValue(env.WANEX_PROVIDER_ID, "WANEX_PROVIDER_ID"),
      ...(fake
        ? {}
        : {
            baseUrl: requiredValue(
              env.WANEX_PROVIDER_BASE_URL,
              "WANEX_PROVIDER_BASE_URL"
            ),
            secretRef: requiredValue(
              env.WANEX_PROVIDER_SECRET_REF,
              "WANEX_PROVIDER_SECRET_REF"
            )
          })
    },
    protocol: {
      id: protocolId,
      ...(env.WANEX_PROVIDER_PROTOCOL_VERSION === undefined
        ? {}
        : {
            version: requiredValue(
              env.WANEX_PROVIDER_PROTOCOL_VERSION,
              "WANEX_PROVIDER_PROTOCOL_VERSION"
            )
          })
    },
    model: {
      id: requiredValue(
        env.WANEX_PROVIDER_MODEL_ID,
        "WANEX_PROVIDER_MODEL_ID"
      ),
      operations: csv(env.WANEX_MODEL_OPERATIONS ?? "conversation"),
      inputModalities: csv(env.WANEX_MODEL_INPUT_MODALITIES ?? "text"),
      outputModalities: csv(env.WANEX_MODEL_OUTPUT_MODALITIES ?? "text"),
      features: csv(env.WANEX_MODEL_FEATURES ?? "", true),
      ...(reasoningReplay === undefined
        ? {}
        : { behavior: { reasoningReplay } }),
      catalog: {
        source: fake ? "builtin" : "custom",
        catalogId: `wanex.tui.${endpointId}`,
        revision: "1"
      }
    }
  } as JsonValue)
}

export function createTuiCliSecretResolver(options: {
  readonly env: TuiCliEnvironment
  readonly storeDir: string
  readonly credentialStore?: SecretStorePort
}): SecretResolverPort {
  const environment = new SecretResolver([new EnvSecretProvider(options.env)])
  const credentialStore = options.credentialStore ??
    createTuiCliCredentialStore(
      wanexLocalCredentialNamespace(options.storeDir)
    )
  return {
    async resolve(ref, context) {
      const scheme = schemeFromRef(ref)
      if (scheme === "env") {
        return await environment.resolve(ref, context)
      }
      if (scheme !== WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME) {
        throw new Error(`no TUI secret resolver for scheme: ${scheme}`)
      }
      return await credentialStore.resolve(ref, context)
    }
  }
}

export function createTuiCliCredentialStore(
  namespace: string
): SecretStorePort {
  let delegate: Promise<SecretStorePort> | undefined
  const load = async (): Promise<SecretStorePort> => {
    delegate ??= import("@wanex/local-credential-store/keychain").then(
      ({ WanexLocalKeychainSecretStore }) =>
        new WanexLocalKeychainSecretStore({ namespace })
    )
    return await delegate
  }
  return {
    scheme: WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME,
    async put(request) {
      await (await load()).put(request)
    },
    async delete(ref) {
      await (await load()).delete(ref)
    },
    async resolve(ref, context) {
      return await (await load()).resolve(ref, context)
    }
  }
}

function endpointValues(
  env: TuiCliEnvironment
): readonly (string | undefined)[] {
  return [
    env.WANEX_MODEL_ENDPOINT_ID,
    env.WANEX_PROVIDER_CONNECTION_ID,
    env.WANEX_PROVIDER_PROTOCOL,
    env.WANEX_PROVIDER_PROTOCOL_VERSION,
    env.WANEX_PROVIDER_ID,
    env.WANEX_PROVIDER_BASE_URL,
    env.WANEX_PROVIDER_SECRET_REF,
    env.WANEX_PROVIDER_MODEL_ID,
    env.WANEX_MODEL_OPERATIONS,
    env.WANEX_MODEL_INPUT_MODALITIES,
    env.WANEX_MODEL_OUTPUT_MODALITIES,
    env.WANEX_MODEL_FEATURES,
    env.WANEX_MODEL_REASONING_REPLAY
  ]
}

function requireTogether(
  env: TuiCliEnvironment,
  names: readonly string[]
): void {
  const missing = names.filter((name) => optionalValue(env[name]) === undefined)
  if (missing.length > 0) {
    throw new Error(`${names.join(", ")} must be set together`)
  }
}

function rejectPresent(
  env: TuiCliEnvironment,
  names: readonly string[],
  owner: string
): void {
  const present = names.filter((name) => env[name] !== undefined)
  if (present.length > 0) {
    throw new Error(`${owner} does not accept ${present.join(", ")}`)
  }
}

function csv(value: string, emptyAllowed = false): string[] {
  if (emptyAllowed && value.trim().length === 0) {
    return []
  }
  const values = value.split(",").map((item) => item.trim())
  if (values.length === 0 || values.some((item) => item.length === 0)) {
    throw new Error("TUI endpoint list contains an empty value")
  }
  return values
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = optionalValue(value)
  if (normalized === undefined) {
    throw new Error(`${name} must not be empty`)
  }
  return normalized
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized
}

function defaultStoreDir(): string {
  return resolve(process.cwd(), ".wanex-tui")
}
