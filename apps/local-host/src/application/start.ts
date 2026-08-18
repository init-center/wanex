import { createController, type Controller } from "@wanex/web"
import { createHostSurfaceClient } from "@wanex/web/host"
import { createWanexAppProviderMutationCoordinator } from "@wanex/app/provider-mutation"
import { wanexLocalCredentialPolicy } from "@wanex/local-credential-store"
import {
  listenWebNodeHost,
  type WebNodeHostServer,
} from "../web-host/index.js"
import type {
  LocalSettingsCommands,
  LocalSnapshot,
  LocalWebApp,
  StartLocalWebAppOptions,
} from "../model.js"
import { createLocalProviderCommands } from "../provider/management.js"
import { projectLocalModelEndpoints } from "../provider/model-read-model.js"
import { createLocalCapabilitySetupCommands } from "../provider/capability.js"
import { createLocalModelCatalogService } from "../provider/catalog/index.js"
import {
  closeStartedLocalProductHost,
  startLocalProductHostInternal,
  type StartedLocalProductHost,
} from "./product.js"

export async function startLocalWebApp(
  options: StartLocalWebAppOptions,
): Promise<LocalWebApp> {
  const product = await startLocalProductHostInternal(options)
  let controller: Controller | undefined
  let host: WebNodeHostServer | undefined

  try {
    const modelCatalog = await createLocalModelCatalogService({
      storage: product.runtime.storage,
    })
    const providerMutation = createWanexAppProviderMutationCoordinator({
      credentialStore: product.secrets.credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace: product.secrets.namespace,
        scheme: product.secrets.credentialStore.scheme,
      }),
      modelEndpoints: product.shell.modelEndpoints,
      storage: product.runtime.storage,
    })
    try {
      await providerMutation.reconcilePending()
    } catch {
      // Durable intent remains for a strict retry before the next mutation.
    }
    const providers = createLocalProviderCommands({
      shell: product.shell,
      modelResolver: modelCatalog.resolver,
      mutationCoordinator: providerMutation,
    })
    const capabilitySetup = createLocalCapabilitySetupCommands({
      shell: product.shell,
    })
    const client = createHostSurfaceClient({ surface: product.surface })
    controller = await createController({ client })
    host = await listenWebNodeHost({
      controller,
      surfaceEvents: client,
      attachments: product.attachments,
      resourceDeliveries: product.resourceDeliveries,
      providers,
      modelCatalog,
      capabilitySetup,
      ...(options.web ?? {}),
    })

    return createLocalWebAppHandle({
      product,
      controller,
      host,
      providers,
      modelCatalog,
      capabilitySetup,
    })
  } catch (error) {
    await closeStartedLocalWebApp({ product, host })
    throw error
  }
}

function createLocalWebAppHandle(request: {
  readonly product: StartedLocalProductHost
  readonly controller: Controller
  readonly host: WebNodeHostServer
  readonly providers: ReturnType<typeof createLocalProviderCommands>
  readonly modelCatalog: Awaited<ReturnType<typeof createLocalModelCatalogService>>
  readonly capabilitySetup: ReturnType<typeof createLocalCapabilitySetupCommands>
}): LocalWebApp {
  let closePromise: Promise<void> | undefined
  return {
    shell: request.product.shell,
    teamConversations: request.product.shell.teamConversations,
    modelEndpoints: request.product.shell.modelEndpoints,
    providers: request.providers,
    modelCatalog: request.modelCatalog,
    capabilitySetup: request.capabilitySetup,
    settings: createLocalSettingsCommands(request.product.shell),
    attachments: request.product.attachments,
    resourceDeliveries: request.product.resourceDeliveries,
    controller: request.controller,
    host: request.host,
    url: request.host.url,
    async readSnapshot() {
      const web = await request.controller.refresh()
      return {
        kind: "local-host.snapshot",
        url: request.host.url,
        settings: request.product.shell.readSettings(),
        modelEndpoints: projectLocalModelEndpoints(
          await request.product.shell.modelEndpoints.listModelEndpoints(),
        ),
        web,
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
          exposesRawStorageClient: false,
          exposesRendererMutationApi: false,
        },
      } satisfies LocalSnapshot
    },
    async close() {
      closePromise ??= closeStartedLocalWebApp({
        product: request.product,
        host: request.host,
      })
      return await closePromise
    },
  }
}

function createLocalSettingsCommands(
  shell: StartedLocalProductHost["shell"],
): LocalSettingsCommands {
  return {
    readSettings: () => shell.readSettings(),
    selectSession: async (request) => await shell.selectSession(request),
    setLayout: async (request) => await shell.setLayout(request),
    setMode: async (request) => await shell.setMode(request),
    updatePreferences: async (request) =>
      await shell.updatePreferences(request),
  }
}

async function closeStartedLocalWebApp(request: {
  readonly product: StartedLocalProductHost
  readonly host: WebNodeHostServer | undefined
}): Promise<void> {
  let firstError: unknown
  try {
    await request.host?.close()
  } catch (error) {
    firstError = error
  }
  try {
    await closeStartedLocalProductHost(request.product)
  } catch (error) {
    firstError ??= error
  }
  if (firstError !== undefined) throw firstError
}
