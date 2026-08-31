import { createController, type Controller } from "@wanex/assistant-ui"
import { createHostSurfaceClient } from "@wanex/assistant-ui/host"
import { createWanexAppProviderMutationCoordinator } from "@wanex/app/provider-mutation"
import { wanexLocalCredentialPolicy } from "@wanex/local-credential-store"
import {
  listenWebNodeHost,
  type WebNodeHostServer,
} from "../web-host/index.js"
import type {
  LocalConfigurationPort,
  LocalSettingsCommands,
  AssistantHostSnapshot,
  AssistantWebApp,
  StartAssistantWebAppOptions,
} from "../model.js"
import { createLocalProviderCommands } from "../provider/management.js"
import { projectLocalModelEndpoints } from "../provider/model-read-model.js"
import { createLocalCapabilitySetupCommands } from "../provider/capability.js"
import { createLocalModelCatalogService } from "../provider/catalog/index.js"
import {
  closeStartedAssistantHost,
  startAssistantHostInternal,
  type StartedAssistantHost,
} from "./assistant.js"

export async function startAssistantWebApp(
  options: StartAssistantWebAppOptions,
): Promise<AssistantWebApp> {
  const assistant = await startAssistantHostInternal(options)
  let controller: Controller | undefined
  let host: WebNodeHostServer | undefined

  try {
    const modelCatalog = await createLocalModelCatalogService({
      storage: assistant.runtime.storage,
    })
    const providerMutation = createWanexAppProviderMutationCoordinator({
      credentialStore: assistant.secrets.credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace: assistant.secrets.namespace,
        scheme: assistant.secrets.credentialStore.scheme,
      }),
      modelEndpoints: assistant.shell.modelEndpoints,
      storage: assistant.runtime.storage,
    })
    try {
      await providerMutation.reconcilePending()
    } catch {
      // Durable intent remains for a strict retry before the next mutation.
    }
    const providers = createLocalProviderCommands({
      shell: assistant.shell,
      modelResolver: modelCatalog.resolver,
      mutationCoordinator: providerMutation,
    })
    const capabilitySetup = createLocalCapabilitySetupCommands({
      shell: assistant.shell,
    })
    const client = createHostSurfaceClient({ surface: assistant.surface })
    controller = await createController({ client })
    host = await listenWebNodeHost({
      controller,
      surfaceEvents: client,
      attachments: assistant.attachments,
      resourceDeliveries: assistant.resourceDeliveries,
      providers,
      modelCatalog,
      capabilitySetup,
      ...(options.web ?? {}),
    })

    return createAssistantWebAppHandle({
      assistant,
      controller,
      host,
      providers,
      modelCatalog,
      capabilitySetup,
    })
  } catch (error) {
    await closeStartedAssistantWebApp({ assistant, host })
    throw error
  }
}

function createAssistantWebAppHandle(request: {
  readonly assistant: StartedAssistantHost
  readonly controller: Controller
  readonly host: WebNodeHostServer
  readonly providers: ReturnType<typeof createLocalProviderCommands>
  readonly modelCatalog: Awaited<ReturnType<typeof createLocalModelCatalogService>>
  readonly capabilitySetup: ReturnType<typeof createLocalCapabilitySetupCommands>
}): AssistantWebApp {
  let closePromise: Promise<void> | undefined
  return {
    shell: request.assistant.shell,
    teamConversations: request.assistant.shell.teamConversations,
    modelEndpoints: request.assistant.shell.modelEndpoints,
    providers: request.providers,
    modelCatalog: request.modelCatalog,
    capabilitySetup: request.capabilitySetup,
    settings: createLocalSettingsCommands(request.assistant.shell),
    secretResolver: request.assistant.secrets.secretResolver,
    configuration: createLocalConfigurationPort(request.assistant.runtime.storage),
    attachments: request.assistant.attachments,
    resourceDeliveries: request.assistant.resourceDeliveries,
    controller: request.controller,
    host: request.host,
    url: request.host.url,
    async readSnapshot() {
      const web = await request.controller.refresh()
      return {
        kind: "assistant-host.snapshot",
        url: request.host.url,
        settings: request.assistant.shell.readSettings(),
        modelEndpoints: projectLocalModelEndpoints(
          await request.assistant.shell.modelEndpoints.listModelEndpoints(),
        ),
        web,
        privacy: {
          exposesStorePath: false,
          exposesServiceBinaryPath: false,
          exposesSecrets: false,
          exposesRawStorageClient: false,
          exposesRendererMutationApi: false,
        },
      } satisfies AssistantHostSnapshot
    },
    async close() {
      closePromise ??= closeStartedAssistantWebApp({
        assistant: request.assistant,
        host: request.host,
      })
      return await closePromise
    },
  }
}

function createLocalConfigurationPort(
  storage: StartedAssistantHost["runtime"]["storage"],
): LocalConfigurationPort {
  return {
    getConfig: async (key) => await storage.getConfig(key),
    getConfigEntry: async (key) => await storage.getConfigEntry(key),
    listConfigEntries: async (request) =>
      await storage.listConfigEntries(request),
    compareAndApplyConfigMutations: async (request) =>
      await storage.compareAndApplyConfigMutations(request),
  }
}

function createLocalSettingsCommands(
  shell: StartedAssistantHost["shell"],
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

async function closeStartedAssistantWebApp(request: {
  readonly assistant: StartedAssistantHost
  readonly host: WebNodeHostServer | undefined
}): Promise<void> {
  let firstError: unknown
  try {
    await request.host?.close()
  } catch (error) {
    firstError = error
  }
  try {
    await closeStartedAssistantHost(request.assistant)
  } catch (error) {
    firstError ??= error
  }
  if (firstError !== undefined) throw firstError
}
