import {
  bootstrapWanexStorage,
  type BootstrappedWanexStorage,
  type WanexBootstrapStorageConfig
} from "@wanex/runtime/bootstrap"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  type ProductAppShell,
  type ProductAppSurfaceAdapter
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
import {
  projectProductAppLocalProviderProfiles
} from "./provider-profile-read-model.js"
import { createStorageProductAppStateStore } from "./state-store-storage.js"
import { createProductAppLocalAttachmentUploadPort } from "./attachment-upload.js"

export type * from "./types.js"
export * from "./cli-open.js"
export * from "./cli-options.js"
export * from "./cli-provider-setup.js"
export * from "./cli-smoke.js"
export * from "./cli-summary.js"
export * from "./provider-profiles.js"
export * from "./provider-setup.js"
export * from "./state-store-storage.js"
export * from "./attachment-upload.js"

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
  let surface: ProductAppSurfaceAdapter | undefined
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
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
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

    surface = createProductAppSurfaceAdapter(productApp)
    const client = createProductAppWebHostSurfaceClient({ surface })
    webController = await createProductAppWebController({ client })
    const attachments = createProductAppLocalAttachmentUploadPort(productApp)
    host = await listenProductAppWebNodeHost({
      controller: webController,
      attachments,
      ...(options.web ?? {})
    })

    return createProductAppLocalWebAppHandle({
      runtime,
      productApp,
      surface,
      webController,
      host,
      attachments
    })
  } catch (error) {
    await closeStartedProductAppLocalWebApp({
      runtime,
      productApp,
      surface,
      host
    })
    throw error
  }
}

function createProductAppLocalWebAppHandle(request: {
  readonly runtime: BootstrappedWanexStorage
  readonly productApp: ProductAppShell
  readonly surface: ProductAppSurfaceAdapter
  readonly webController: ProductAppWebController
  readonly host: ProductAppWebNodeHostServer
  readonly attachments: ReturnType<typeof createProductAppLocalAttachmentUploadPort>
}): ProductAppLocalWebApp {
  let closePromise: Promise<void> | undefined
  return {
    productApp: request.productApp,
    providerProfiles: request.productApp.providerProfiles,
    providerSetup: createProductAppLocalProviderSetupCommands(
      request.productApp
    ),
    settings: createProductAppLocalSettingsCommands(request.productApp),
    attachments: request.attachments,
    webController: request.webController,
    host: request.host,
    url: request.host.url,
    async readSnapshot() {
      return await readProductAppLocalSnapshot(request)
    },
    async close() {
      if (closePromise !== undefined) {
        return await closePromise
      }
      closePromise = closeStartedProductAppLocalWebApp(request)
      return await closePromise
    }
  }
}

async function readProductAppLocalSnapshot(request: {
  readonly productApp: ProductAppShell
  readonly surface: ProductAppSurfaceAdapter
  readonly webController: ProductAppWebController
  readonly host: ProductAppWebNodeHostServer
}): Promise<ProductAppLocalSnapshot> {
  const web = await request.webController.refresh()
  return {
    kind: "product-app-local.snapshot",
    url: request.host.url,
    settings: request.productApp.readSettings(),
    providerProfiles: projectProductAppLocalProviderProfiles(
      await request.productApp.providerProfiles.listProviderProfiles()
    ),
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
  readonly surface: ProductAppSurfaceAdapter | undefined
  readonly host: ProductAppWebNodeHostServer | undefined
}): Promise<void> {
  let firstError: unknown
  for (const close of [
    async () => await request.host?.close(),
    async () => await request.surface?.dispose(),
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
