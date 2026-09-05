import { randomUUID } from "node:crypto"
import {
  startAssistantHost,
  type StartAssistantHostOptions
} from "@wanex/assistant-host/application"
import {
  bootstrapWanexStorage,
  type BootstrappedWanexStorage
} from "@wanex/runtime/bootstrap"
import type { RemoteAgentHostHttpHandler } from "@wanex/runtime/host"
import { localSecretNamespace } from "@wanex/assistant-host"
import { resolveLocalStore } from "@wanex/storage"
import { startWanexServerCoding } from "./coding.js"
import { parseWanexServerConfig } from "./config.js"
import {
  listenWanexServer,
  type WanexServerListener
} from "./listener.js"
import type {
  StartWanexServerOptions,
  StartedWanexServer,
  WanexServer,
  WanexServerState
} from "./model.js"
import { createWanexServerRemoteHandler } from "./remote.js"

interface WanexServerDependencies {
  readonly bootstrapStorage: typeof bootstrapWanexStorage
  readonly startAssistant: typeof startAssistantHost
  readonly startCoding: typeof startWanexServerCoding
  readonly createRemoteHandler: typeof createWanexServerRemoteHandler
  readonly listen: typeof listenWanexServer
  readonly createInstanceId: () => string
}

const defaultDependencies: WanexServerDependencies = {
  bootstrapStorage: bootstrapWanexStorage,
  startAssistant: startAssistantHost,
  startCoding: startWanexServerCoding,
  createRemoteHandler: createWanexServerRemoteHandler,
  listen: listenWanexServer,
  createInstanceId: randomUUID
}

export async function startWanexServer(
  options: StartWanexServerOptions
): Promise<WanexServer> {
  const started = await startWanexServerInternal(options, defaultDependencies)
  return Object.freeze({
    get state() {
      return started.state
    },
    endpoint: started.endpoint,
    readStatus: () => started.readStatus(),
    close: async () => await started.close()
  })
}

export async function startWanexServerInternal(
  options: StartWanexServerOptions,
  dependencyOverrides: Partial<WanexServerDependencies> = {}
): Promise<StartedWanexServer> {
  const dependencies: WanexServerDependencies = {
    ...defaultDependencies,
    ...dependencyOverrides
  }
  const config = parseWanexServerConfig(options.config)
  validateStartOptions(options)
  const location = resolveLocalStore({
    rootDir: config.dataRoot,
    profileId: config.profileId
  })
  let runtime: BootstrappedWanexStorage | undefined
  let assistantHost: Awaited<ReturnType<typeof startAssistantHost>> | undefined
  let codingHost: Awaited<ReturnType<typeof startWanexServerCoding>> | undefined
  let remoteHandler: RemoteAgentHostHttpHandler | undefined
  let listener: WanexServerListener | undefined

  try {
    runtime = await dependencies.bootstrapStorage({
      storage: {
        kind: "local-profile",
        mode: "persistent",
        rootDir: location.rootDir,
        profileId: location.profileId,
        ...(options.serviceBin === undefined ? {} : { serviceBin: options.serviceBin })
      },
      ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts })
    })
    const serviceBin = runtime.artifacts.systemService?.path ?? options.serviceBin
    const assistantOptions: StartAssistantHostOptions = {
      storage: {
        kind: "injected",
        handle: {
          core: runtime.storage,
          transport: runtime.transport
        },
        credentialNamespace: localSecretNamespace({
          kind: "profile",
          rootDir: location.rootDir,
          profileId: location.profileId
        })
      },
      ...(serviceBin === undefined ? {} : { serviceBin }),
      ...(options.modelEndpoints === undefined
        ? {}
        : { modelEndpoints: options.modelEndpoints }),
      ...(options.credentialStore === undefined
        ? {}
        : { credentialStore: options.credentialStore }),
      ...(options.secretResolver === undefined
        ? {}
        : { secretResolver: options.secretResolver }),
      ...(options.trustedProviderHost === undefined
        ? {}
        : { trustedProviderHost: options.trustedProviderHost })
    }
    assistantHost = await dependencies.startAssistant(assistantOptions)
    if (config.coding !== undefined) {
      if (serviceBin === undefined) {
        throw new Error("Wanex Server Coding requires a system service binary")
      }
      codingHost = await dependencies.startCoding({
        profileStoreDir: location.storeDir,
        storage: {
          core: runtime.storage,
          transport: runtime.transport
        },
        serviceBin,
        config: config.coding,
        secretResolver: assistantHost.secretResolver,
        modelEndpoints: assistantHost.modelEndpoints
      })
    }
    const host = Object.freeze({
      hostId: config.hostId,
      instanceId: dependencies.createInstanceId(),
      connectionKind: "remote_tls" as const,
      executionLocation: "remote" as const
    })
    remoteHandler = dependencies.createRemoteHandler({
      authentication: options.authentication,
      assistantHost,
      ...(codingHost === undefined ? {} : { codingHost }),
      host,
      ...(options.remoteLimits === undefined ? {} : { limits: options.remoteLimits })
    })
    listener = await dependencies.listen({
      config: config.listener,
      tls: options.tls,
      handler: remoteHandler,
      ...(options.remoteLimits?.requestTimeoutMs === undefined
        ? {}
        : { requestTimeoutMs: options.remoteLimits.requestTimeoutMs })
    })
    return createServerHandle({
      profileId: location.profileId,
      runtime,
      assistantHost,
      ...(codingHost === undefined ? {} : { codingHost }),
      remoteHandler,
      listener,
      ...(options.drainTimeoutMs === undefined
        ? {}
        : { drainTimeoutMs: options.drainTimeoutMs })
    })
  } catch (error) {
    listener?.destroyConnections()
    await listener?.close().catch(() => {})
    await remoteHandler?.close().catch(() => {})
    await codingHost?.close().catch(() => {})
    await assistantHost?.close().catch(() => {})
    await runtime?.dispose().catch(() => {})
    throw error
  }
}

function createServerHandle(request: {
  readonly profileId: string
  readonly runtime: BootstrappedWanexStorage
  readonly assistantHost: Awaited<ReturnType<typeof startAssistantHost>>
  readonly codingHost?: Awaited<ReturnType<typeof startWanexServerCoding>>
  readonly remoteHandler: RemoteAgentHostHttpHandler
  readonly listener: WanexServerListener
  readonly drainTimeoutMs?: number
}): StartedWanexServer {
  let state: WanexServerState = "open"
  let closePromise: Promise<void> | undefined
  return Object.freeze({
    get state() {
      return state
    },
    endpoint: request.listener.endpoint,
    assistantHost: request.assistantHost,
    ...(request.codingHost === undefined
      ? {}
      : { codingHost: request.codingHost }),
    remoteHandler: request.remoteHandler,
    readStatus() {
      return Object.freeze({
        kind: "wanex.server.status" as const,
        state,
        profileId: request.profileId,
        assistant: state === "open" ? "ready" as const : state,
        coding: request.codingHost === undefined
          ? "disabled" as const
          : state === "open" ? "ready" as const : state,
        listener: state === "open" ? "ready" as const : state,
        endpoint: request.listener.endpoint
      })
    },
    async close() {
      if (closePromise !== undefined) return await closePromise
      state = "closing"
      closePromise = (async () => {
        let firstError: unknown
        const listenerClose = request.listener.close().then(
          () => undefined,
          (error: unknown) => error
        )
        try {
          await request.remoteHandler.drain(request.drainTimeoutMs)
        } catch (error) {
          firstError = error
        } finally {
          request.listener.destroyConnections()
        }
        const listenerError = await listenerClose
        firstError ??= listenerError
        try {
          await request.codingHost?.close()
        } catch (error) {
          firstError ??= error
        }
        try {
          await request.assistantHost.close()
        } catch (error) {
          firstError ??= error
        }
        try {
          await request.runtime.dispose()
        } catch (error) {
          firstError ??= error
        } finally {
          state = "closed"
        }
        if (firstError !== undefined) throw firstError
      })()
      return await closePromise
    }
  })
}

function validateStartOptions(options: StartWanexServerOptions): void {
  if (
    typeof options.authentication !== "object" ||
    options.authentication === null ||
    typeof options.authentication.authenticateBearerToken !== "function"
  ) {
    throw new Error("Wanex Server authentication is required")
  }
  if (typeof options.tls !== "object" || options.tls === null) {
    throw new Error("Wanex Server TLS credentials are required")
  }
}
