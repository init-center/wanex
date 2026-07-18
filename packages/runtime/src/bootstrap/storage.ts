import {
  resolveSystemServiceBinary,
  type ResolvedSystemServiceBinary,
  type ResolveSystemServiceBinaryOptions
} from "./artifacts.js"
import {
  createStorageHandle,
  type CoreStore,
  type LocalSystemServiceStorageMode,
  type StorageHandle,
  type StorageTransport
} from "@wanex/storage"

export const WANEX_RUNTIME_BOOTSTRAP = "wanex-runtime-bootstrap" as const

export type WanexBootstrapStorageConfig =
  | WanexBootstrapLocalSystemServiceStorageConfig
  | WanexBootstrapLocalProfileStorageConfig
  | WanexBootstrapRemoteHttpStorageConfig
  | WanexBootstrapInjectedStorageConfig

export interface WanexBootstrapLocalSystemServiceStorageConfig {
  readonly kind: "local-system-service"
  readonly mode?: LocalSystemServiceStorageMode
  readonly storeDir: string
  readonly serviceBin?: string
}

export interface WanexBootstrapLocalProfileStorageConfig {
  readonly kind: "local-profile"
  readonly mode?: LocalSystemServiceStorageMode
  readonly rootDir: string
  readonly profileId?: string
  readonly serviceBin?: string
}

export interface WanexBootstrapRemoteHttpStorageConfig {
  readonly kind: "remote-http"
  readonly endpoint: string
  readonly token: string
  readonly timeoutMs?: number
}

export interface WanexBootstrapInjectedStorageConfig {
  readonly kind: "injected"
  readonly handle: Pick<StorageHandle, "core" | "transport">
}

export interface BootstrapWanexStorageOptions {
  readonly storage: WanexBootstrapStorageConfig
  readonly artifacts?: ResolveSystemServiceBinaryOptions
}

export interface BootstrappedWanexStorage {
  readonly storage: CoreStore
  readonly transport: StorageTransport
  readonly artifacts: BootstrappedWanexArtifacts
  dispose(): Promise<void>
}

export interface BootstrappedWanexArtifacts {
  readonly systemService?: ResolvedSystemServiceBinary
}

export async function bootstrapWanexStorage(
  options: BootstrapWanexStorageOptions
): Promise<BootstrappedWanexStorage> {
  if (options.storage.kind === "injected") {
    const injected = options.storage
    let disposed = false
    return {
      storage: injected.handle.core,
      transport: injected.handle.transport,
      artifacts: {},
      async dispose() {
        if (disposed) {
          return
        }
        disposed = true
      }
    }
  }

  if (options.storage.kind === "remote-http") {
    const handle = createStorageHandle(options.storage)
    return {
      storage: handle.core,
      transport: handle.transport,
      artifacts: {},
      dispose: () => handle.dispose()
    }
  }

  const explicitPath = options.storage.serviceBin ?? options.artifacts?.explicitPath
  const systemService = await resolveSystemServiceBinary({
    ...options.artifacts,
    ...(explicitPath === undefined ? {} : { explicitPath })
  })
  const handle =
    options.storage.kind === "local-profile"
      ? createStorageHandle({
          kind: "local-profile",
          ...(options.storage.mode === undefined ? {} : { mode: options.storage.mode }),
          rootDir: options.storage.rootDir,
          ...(options.storage.profileId === undefined
            ? {}
            : { profileId: options.storage.profileId }),
          serviceBin: systemService.path
        })
      : createStorageHandle({
          kind: "local-system-service",
          ...(options.storage.mode === undefined ? {} : { mode: options.storage.mode }),
          storeDir: options.storage.storeDir,
          serviceBin: systemService.path
        })

  return {
    storage: handle.core,
    transport: handle.transport,
    artifacts: {
      systemService
    },
    dispose: () => handle.dispose()
  }
}
