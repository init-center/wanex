import {
  bootstrapWanexStorage,
  type BootstrappedWanexStorage,
  type WanexBootstrapStorageConfig,
} from "@wanex/runtime/bootstrap"
import {
  createShell,
  createSurfaceAdapter,
  type Shell,
  type SurfaceAdapter,
} from "@wanex/product"
import { OpenAIImagesAdapter } from "@wanex/runtime/media-generation/openai-images"
import { createTeamStore } from "@wanex/storage/team"
import {
  createTeamConversationExecutionHost,
  createTeamDeliveryAgentContextResolver,
  TeamConversationRuntime,
  type TeamConversationExecutionHost,
} from "@wanex/team/conversation"
import type {
  LocalProductHost,
  LocalStorageConfig,
  StartLocalProductHostOptions,
} from "../model.js"
import { resolveLocalModelEndpoints, seedLocalModelEndpoints } from "../provider/endpoints.js"
import { composeLocalSecretStore } from "../provider/secrets.js"
import { createStorageStateStore } from "../state/storage.js"
import { createLocalAttachmentUploadPort } from "../resources/attachment.js"
import {
  createLocalResourceDeliveryAuthorizer,
  createLocalResourceDeliveryPort,
} from "../resources/delivery.js"
import { LocalToolPermissionPolicy } from "../provider/tool-permission.js"
import {
  createLocalTeamConversationAdapter,
  type LocalTeamConversationAdapter,
} from "../team/adapter.js"
import type { LocalPluginCompositionBinding } from "./plugin.js"

export interface StartedLocalProductHost {
  readonly runtime: BootstrappedWanexStorage
  readonly shell: Shell
  readonly surface: SurfaceAdapter
  readonly secrets: Awaited<ReturnType<typeof composeLocalSecretStore>>
  readonly teamAdapter: LocalTeamConversationAdapter
  readonly teamHost: TeamConversationExecutionHost
  readonly attachments: ReturnType<typeof createLocalAttachmentUploadPort>
  readonly resourceDeliveries: ReturnType<typeof createLocalResourceDeliveryPort>
  readonly pluginComposition?: LocalPluginCompositionBinding
}

export async function startLocalProductHost(
  options: StartLocalProductHostOptions,
): Promise<LocalProductHost> {
  return createLocalProductHostHandle(await startLocalProductHostInternal(options))
}

export async function startLocalProductHostInternal(
  options: StartLocalProductHostOptions,
): Promise<StartedLocalProductHost> {
  if (options.modelEndpoint !== undefined && options.modelEndpoints !== undefined) {
    throw new Error("local Product host accepts either modelEndpoint or modelEndpoints")
  }
  const modelEndpoints = resolveLocalModelEndpoints(options.modelEndpoints)
  const secrets = await composeLocalSecretStore({
    storage: options.storage,
    ...(options.credentialStore === undefined
      ? {}
      : { credentialStore: options.credentialStore }),
    ...(options.secretResolver === undefined
      ? {}
      : { fallbackSecretResolver: options.secretResolver }),
  })
  const runtime = await bootstrapWanexStorage({
    storage: toBootstrapStorage(options.storage, options.serviceBin),
  })
  const teamStorage = createTeamStore(runtime.transport)
  let shell: Shell | undefined
  let surface: SurfaceAdapter | undefined
  let teamHost: TeamConversationExecutionHost | undefined
  let pluginComposition: LocalPluginCompositionBinding | undefined
  const teamConversations = new TeamConversationRuntime({
    storage: teamStorage,
    principalId: "local-host-team",
    notifyWorkAvailable: () => teamHost?.wake(),
  })
  const teamAdapter = createLocalTeamConversationAdapter({
    runtime: teamConversations,
  })

  try {
    pluginComposition = await options.pluginComposition?.prepare({
      handle: {
        core: runtime.storage,
        transport: runtime.transport,
      },
    })
    shell = await createShell({
      storage: {
        kind: "injected",
        handle: {
          core: runtime.storage,
          transport: runtime.transport,
        },
      },
      secretResolver: secrets.secretResolver,
      mediaGenerationAdapters: [
        new OpenAIImagesAdapter({ secretResolver: secrets.secretResolver }),
      ],
      runtimeContext: {
        toolPermissionPolicy: new LocalToolPermissionPolicy(),
      },
      runtimeContextResolver: createTeamDeliveryAgentContextResolver({
        storage: teamStorage,
        prepareDelegatedExecutionBinding: async ({
          sessionId,
          inputId,
          turnId,
          content,
          origin,
        }) => {
          if (shell === undefined) {
            throw new Error("Product shell is not ready for Team delegation")
          }
          return await shell.trustedExecution.prepareExecutionBinding({
            sessionId,
            inputId,
            turnId,
            content,
            origin,
          })
        },
      }),
      observeSessionTurnResult() {
        teamHost?.wake()
      },
      stateStore: createStorageStateStore({ storage: runtime.storage }),
      teamConversations: teamAdapter.port,
      ...(options.modelEndpoint === undefined
        ? {}
        : { modelEndpoint: options.modelEndpoint }),
      ...(options.trustedProviderHost === undefined
        ? {}
        : { trustedProviderHost: options.trustedProviderHost }),
      ...(options.initialState === undefined
        ? {}
        : { state: options.initialState }),
      ...(pluginComposition === undefined
        ? {}
        : pluginComposition.productBinding),
    })
    const startedShell = shell
    await seedLocalModelEndpoints({ shell, modelEndpoints })
    teamHost = createTeamConversationExecutionHost({
      storage: runtime.storage,
      teamStorage,
      prepareExecutionBinding: async ({ plan, content, origin }) =>
        await startedShell.trustedExecution.prepareExecutionBinding({
          sessionId: plan.sessionId,
          inputId: plan.inputId,
          turnId: plan.turnId,
          content,
          origin,
        }),
      wakeAgentHost: () => startedShell.trustedExecution.wake(),
      notifyTeamChanged: (event) => teamAdapter.notify(event),
    })
    teamHost.start()
    surface = createSurfaceAdapter(shell)
    const attachments = createLocalAttachmentUploadPort(shell)
    const resourceDeliveries = createLocalResourceDeliveryPort(
      shell.trustedResources,
      { authorizer: createLocalResourceDeliveryAuthorizer(shell) },
    )
    await pluginComposition?.start()
    return {
      runtime,
      shell,
      surface,
      secrets,
      teamAdapter,
      teamHost,
      attachments,
      resourceDeliveries,
      ...(pluginComposition === undefined ? {} : { pluginComposition }),
    }
  } catch (error) {
    await closeStartedLocalProductHost({
      runtime,
      shell,
      surface,
      teamHost,
      teamAdapter,
      ...(pluginComposition === undefined ? {} : { pluginComposition }),
    })
    throw error
  }
}

export function createLocalProductHostHandle(
  started: StartedLocalProductHost,
): LocalProductHost {
  let closePromise: Promise<void> | undefined
  return {
    shell: started.shell,
    surface: started.surface,
    teamConversations: started.shell.teamConversations,
    modelEndpoints: started.shell.modelEndpoints,
    attachments: started.attachments,
    resourceDeliveries: started.resourceDeliveries,
    async close() {
      closePromise ??= closeStartedLocalProductHost(started)
      return await closePromise
    },
  }
}

export async function closeStartedLocalProductHost(request: {
  readonly runtime: BootstrappedWanexStorage
  readonly shell: Shell | undefined
  readonly surface: SurfaceAdapter | undefined
  readonly teamHost: TeamConversationExecutionHost | undefined
  readonly teamAdapter: LocalTeamConversationAdapter
  readonly pluginComposition?: LocalPluginCompositionBinding
}): Promise<void> {
  let firstError: unknown
  for (const close of [
    async () => await request.pluginComposition?.stop(),
    async () => await request.teamHost?.dispose(),
    async () => await request.surface?.dispose(),
    async () => await request.shell?.dispose(),
    async () => request.teamAdapter.dispose(),
    async () => await request.pluginComposition?.dispose(),
    async () => await request.runtime.dispose(),
  ]) {
    try {
      await close()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== undefined) throw firstError
}

function toBootstrapStorage(
  storage: LocalStorageConfig,
  serviceBin: string | undefined,
): WanexBootstrapStorageConfig {
  const artifact = serviceBin === undefined ? {} : { serviceBin }
  if (storage.kind === "profile") {
    return {
      kind: "local-profile",
      ...(storage.mode === undefined ? {} : { mode: storage.mode }),
      rootDir: storage.rootDir,
      ...(storage.profileId === undefined ? {} : { profileId: storage.profileId }),
      ...artifact,
    }
  }
  return {
    kind: "local-system-service",
    ...(storage.mode === undefined ? {} : { mode: storage.mode }),
    storeDir: storage.storeDir,
    ...artifact,
  }
}
