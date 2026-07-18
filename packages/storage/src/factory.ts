import { resolveLocalStore } from "./store-locator.js"
import {
  HttpStorageWireTransport,
  OneShotSystemServiceStorageWireTransport,
  PersistentSystemServiceStorageWireTransport,
  ProtocolStorageTransport,
  type StorageTransport
} from "./transport.js"
import { createCoreStore } from "./store-core.js"
import type { CoreStore } from "./types.js"

export type LocalSystemServiceStorageMode = "oneshot" | "persistent"

export interface LocalSystemServiceStorageConfig {
  readonly kind: "local-system-service"
  readonly mode?: LocalSystemServiceStorageMode
  readonly storeDir: string
  readonly serviceBin: string
}

export interface LocalProfileStorageConfig {
  readonly kind: "local-profile"
  readonly mode?: LocalSystemServiceStorageMode
  readonly rootDir: string
  readonly profileId?: string
  readonly serviceBin: string
}

export interface RemoteHttpStorageConfig {
  readonly kind: "remote-http"
  readonly endpoint: string
  readonly token: string
  readonly timeoutMs?: number
}

export type CreateStorageConfig =
  | LocalSystemServiceStorageConfig
  | LocalProfileStorageConfig
  | RemoteHttpStorageConfig

export interface StorageHandle {
  readonly transport: StorageTransport
  readonly core: CoreStore
  dispose(): Promise<void>
}

export interface InjectedStorageTransportOptions {
  readonly ownership: "owned" | "borrowed"
}

export function createStorageHandle(config: CreateStorageConfig): StorageHandle {
  return createStorageHandleFromTransport(createStorageTransport(config), {
    ownership: "owned"
  })
}

export function createStorageHandleFromTransport(
  transport: StorageTransport,
  options: InjectedStorageTransportOptions
): StorageHandle {
  let disposed = false
  return {
    transport,
    core: createCoreStore(transport),
    async dispose() {
      if (disposed) {
        return
      }
      disposed = true
      if (options.ownership === "owned") {
        await transport.close?.()
      }
    }
  }
}

function createStorageTransport(config: CreateStorageConfig): StorageTransport {
  if (config.kind === "remote-http") {
    return new ProtocolStorageTransport(
      new HttpStorageWireTransport({
        endpoint: config.endpoint,
        token: config.token,
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs })
      }),
      { negotiation: "remote" }
    )
  }
  if (config.kind === "local-profile") {
    const location = resolveLocalStore({
      rootDir: config.rootDir,
      ...(config.profileId === undefined ? {} : { profileId: config.profileId })
    })
    return createStorageTransport({
      kind: "local-system-service",
      ...(config.mode === undefined ? {} : { mode: config.mode }),
      storeDir: location.storeDir,
      serviceBin: config.serviceBin
    })
  }
  if ((config.mode ?? "persistent") === "persistent") {
    return new ProtocolStorageTransport(
      new PersistentSystemServiceStorageWireTransport({
        storeDir: config.storeDir,
        serviceBin: config.serviceBin
      }),
      { negotiation: "persistent" }
    )
  }
  return new ProtocolStorageTransport(
    new OneShotSystemServiceStorageWireTransport({
      storeDir: config.storeDir,
      serviceBin: config.serviceBin
    }),
    { negotiation: "oneshot" }
  )
}
