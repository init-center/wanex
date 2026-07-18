import {
  bootstrapWanexStorage,
  type BootstrappedWanexStorage,
  type WanexBootstrapStorageConfig
} from "@wanex/runtime/bootstrap"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  type ProductAppShell
} from "@wanex/product-app"
import {
  createProductAppWebController,
  type ProductAppWebController
} from "@wanex/product-app-web"
import {
  createProductAppWebHostSurfaceClient
} from "@wanex/product-app-web/host"
import {
  listenProductAppWebNodeHost,
  type ProductAppWebNodeHostServer
} from "./web-host/index.js"
import type {
  ProductAppLocalSnapshot,
  ProductAppLocalSettingsCommands,
  ProductAppLocalStorageConfig,
  ProductAppLocalWebApp,
  StartProductAppLocalWebAppOptions
} from "./types.js"
import {
  resolveProductAppLocalProviderProfiles,
  seedProductAppLocalProviderProfiles
} from "./provider-profiles.js"
import {
  createProductAppLocalProviderSetupCommands
} from "./provider-setup.js"
import { createStorageProductAppStateStore } from "./state-store-storage.js"

export type * from "./types.js"
export * from "./cli-open.js"
export * from "./cli-options.js"
export * from "./cli-provider-setup.js"
export * from "./cli-smoke.js"
export * from "./cli-summary.js"
export * from "./provider-profiles.js"
export * from "./provider-setup.js"
export * from "./state-store-storage.js"

export async function startProductAppLocalWebApp(
  options: StartProductAppLocalWebAppOptions
): Promise<ProductAppLocalWebApp> {
  const providerProfiles = resolveProductAppLocalProviderProfiles(
    options.providerProfiles
  )
  const runtime = await bootstrapWanexStorage({
    storage: toBootstrapStorage(options.storage, options.serviceBin)
  })

  let productApp: ProductAppShell | undefined
  let webController: ProductAppWebController | undefined
  let host: ProductAppWebNodeHostServer | undefined

  try {
    productApp = await createProductAppShell({
      storage: {
        kind: "injected",
        handle: {
          core: runtime.storage,
          transport: runtime.transport
        }
      },
      stateStore: createStorageProductAppStateStore({
        storage: runtime.storage
      }),
      providerProfile: providerProfiles.primaryProfile,
      ...(options.initialState === undefined
        ? {}
        : { state: options.initialState })
    })
    await seedProductAppLocalProviderProfiles({
      productApp,
      providerProfiles
    })

    const surface = createProductAppSurfaceAdapter(productApp)
    const client = createProductAppWebHostSurfaceClient({ surface })
    webController = await createProductAppWebController({ client })
    host = await listenProductAppWebNodeHost({
      controller: webController,
      ...(options.web ?? {})
    })

    return createProductAppLocalWebAppHandle({
      runtime,
      productApp,
      webController,
      host
    })
  } catch (error) {
    await closeStartedProductAppLocalWebApp({
      runtime,
      productApp,
      host
    })
    throw error
  }
}

function createProductAppLocalWebAppHandle(request: {
  readonly runtime: BootstrappedWanexStorage
  readonly productApp: ProductAppShell
  readonly webController: ProductAppWebController
  readonly host: ProductAppWebNodeHostServer
}): ProductAppLocalWebApp {
  let closed = false
  return {
    productApp: request.productApp,
    providerProfiles: request.productApp.providerProfiles,
    providerSetup: createProductAppLocalProviderSetupCommands(
      request.productApp
    ),
    settings: createProductAppLocalSettingsCommands(request.productApp),
    webController: request.webController,
    host: request.host,
    url: request.host.url,
    async readSnapshot() {
      return await readProductAppLocalSnapshot(request)
    },
    async close() {
      if (closed) {
        return
      }
      closed = true
      await closeStartedProductAppLocalWebApp(request)
    }
  }
}

async function readProductAppLocalSnapshot(request: {
  readonly productApp: ProductAppShell
  readonly webController: ProductAppWebController
  readonly host: ProductAppWebNodeHostServer
}): Promise<ProductAppLocalSnapshot> {
  const web = await request.webController.refresh()
  return {
    kind: "product-app-local.snapshot",
    url: request.host.url,
    settings: request.productApp.readSettings(),
    providerProfiles: await request.productApp.providerProfiles.listProviderProfiles(),
    web: web.snapshot,
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesRendererMutationApi: false
    }
  }
}

function createProductAppLocalSettingsCommands(
  productApp: ProductAppShell
): ProductAppLocalSettingsCommands {
  return {
    readSettings: () => productApp.readSettings(),
    selectSession: async (request) => await productApp.selectSession(request),
    setLayout: async (request) => await productApp.setLayout(request),
    setMode: async (request) => await productApp.setMode(request),
    updatePreferences: async (request) =>
      await productApp.updatePreferences(request)
  }
}

async function closeStartedProductAppLocalWebApp(request: {
  readonly runtime: BootstrappedWanexStorage
  readonly productApp: ProductAppShell | undefined
  readonly host: ProductAppWebNodeHostServer | undefined
}): Promise<void> {
  let firstError: unknown
  for (const close of [
    async () => await request.host?.close(),
    async () => await request.productApp?.dispose(),
    async () => await request.runtime.dispose()
  ]) {
    try {
      await close()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== undefined) {
    throw firstError
  }
}

function toBootstrapStorage(
  storage: ProductAppLocalStorageConfig,
  serviceBin: string
): WanexBootstrapStorageConfig {
  if (storage.kind === "profile") {
    return {
      kind: "local-profile",
      ...(storage.mode === undefined ? {} : { mode: storage.mode }),
      rootDir: storage.rootDir,
      ...(storage.profileId === undefined ? {} : { profileId: storage.profileId }),
      serviceBin
    }
  }
  return {
    kind: "local-system-service",
    ...(storage.mode === undefined ? {} : { mode: storage.mode }),
    storeDir: storage.storeDir,
    serviceBin
  }
}
