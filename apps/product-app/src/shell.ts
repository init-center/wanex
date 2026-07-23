import {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT,
  createProductAppBackendShell
} from "@wanex/product-app/backend"
import type {
  ProductAppBackendShell,
  ProductAppBackendCommandPortEnvelope
} from "@wanex/product-app/backend"
import type {
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppHomeOptions,
  ProductAppHomeReadModel,
  ProductAppOpenWorkbenchRequest,
  ProductAppOpenWorkbenchResult,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppSelectSessionRequest,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShell,
  ProductAppShellOptions,
  ProductAppShellStatus,
  ProductAppStateSnapshot,
  ProductAppSubmitConversationOperationRequest,
  ProductAppUpdatePreferencesRequest,
  ProductAppWorkbenchFailedResult
} from "./types.js"
import { createNoopProductAppStateStore } from "./state-store.js"
import { createProductAppConversationEventHub } from "./conversation-events.js"
import {
  cancelProductAppTrackedConversationOperation,
  readProductAppTrackedConversationOperation,
  regenerateProductAppTrackedConversationOperation,
  submitProductAppConversationOperation
} from "./conversation-operation.js"
import {
  copyProductAppState,
  createProductAppState,
  createProductAppStateCoordinator,
  productAppStateSnapshot,
  resolveProductAppSessionId,
  type MutableProductAppState,
  type ProductAppStateCoordinator
} from "./product-state.js"
import {
  dispatchProductAppCommandJsonWithPolicy,
  dispatchProductAppCommandWithPolicy,
  executeProductAppCommandWithPolicy,
  previewProductAppCommandInvocationWithPolicy
} from "./command-port-policy.js"
import { projectProductAppProviderReadiness } from "./provider-readiness.js"
import {
  prepareProductAppConversationAttachment,
  readProductAppConversationAttachments,
  removeProductAppConversationAttachment
} from "./attachments.js"

const availableLayouts = ["single", "split", "diagnostics"] as const
const availableModes = ["chat", "workbench", "diagnostics"] as const
const availableThemes = ["system", "light", "dark"] as const
const availableDensities = ["comfortable", "compact"] as const

export async function createProductAppShell(
  options: ProductAppShellOptions
): Promise<ProductAppShell> {
  const stateStore = options.stateStore ?? createNoopProductAppStateStore()
  const loadedState = await stateStore.load()
  const backend = await createProductAppBackendShell(options)
  const state = createProductAppState(
    loadedState.found ? loadedState.state : undefined,
    options.state
  )
  const stateCoordinator = createProductAppStateCoordinator({
    store: stateStore,
    state
  })
  const conversationEvents = createProductAppConversationEventHub({
    backend,
    state
  })

  return {
    events: conversationEvents,
    trustedResources: {
      ingestResource: backend.commands.ingestResource,
      readResource: backend.commands.readResource
    },
    status() {
      return {
        kind: "product-app.status",
        disposed: backend.status().disposed,
        state: productAppStateSnapshot(state),
        product: backend.status(),
        integrationContractKind: PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.kind
      }
    },
    async readHome(options) {
      return await readProductAppHome(backend, state, options)
    },
    readSettings() {
      return readProductAppSettings(backend, state)
    },
    async selectSession(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = copyProductAppState(current)
        next.selectedSessionId = normalizeRequiredString(
          request.sessionId,
          "sessionId"
        )
        return {
          value: productAppStateSnapshot(next),
          next
        }
      })
    },
    async setLayout(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = { ...copyProductAppState(current), layout: request.layout }
        return { value: productAppStateSnapshot(next), next }
      })
    },
    async setMode(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = { ...copyProductAppState(current), mode: request.mode }
        return { value: productAppStateSnapshot(next), next }
      })
    },
    async updatePreferences(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = {
          ...copyProductAppState(current),
          preferences: {
            ...current.preferences,
            ...request.preferences
          }
        }
        return { value: productAppStateSnapshot(next), next }
      })
    },
    providerProfiles: {
      readActiveProviderProfile:
        backend.commands.readActiveProviderProfile,
      setActiveProviderProfile:
        backend.commands.setActiveProviderProfile,
      upsertProviderProfile:
        backend.commands.upsertProviderProfile,
      readProviderProfile:
        backend.commands.readProviderProfile,
      listProviderProfiles:
        backend.commands.listProviderProfiles
    },
    readProductCommands() {
      return backend.commands.readProductCommands()
    },
    async dispatchProductCommand(request) {
      return await dispatchProductAppCommandWithPolicy({
        backend,
        command: request
      })
    },
    async dispatchProductCommandJson(body) {
      return await dispatchProductAppCommandJsonWithPolicy({
        backend,
        body
      })
    },
    async previewProductCommandInvocation(request) {
      return await previewProductAppCommandInvocationWithPolicy({
        backend,
        request
      })
    },
    async executeProductCommand(request) {
      return await executeProductAppCommandWithPolicy({
        backend,
        command: request
      })
    },
    async readExecutionReference(request) {
      return await backend.commands.readExecutionReference(request)
    },
    async openWorkbench(request) {
      return await openProductAppWorkbench(
        backend,
        stateCoordinator,
        request
      )
    },
    async prepareConversationAttachment(request) {
      return await prepareProductAppConversationAttachment({
        backend,
        state: stateCoordinator,
        input: request
      })
    },
    readConversationAttachments(request = {}) {
      return readProductAppConversationAttachments({
        state,
        input: request
      })
    },
    async removeConversationAttachment(request) {
      return await removeProductAppConversationAttachment({
        state: stateCoordinator,
        input: request
      })
    },
    async submitConversationOperation(request) {
      return await submitProductAppConversationOperation({
        backend,
        state: stateCoordinator,
        input: request
      })
    },
    async readTrackedConversationOperation(request = {}) {
      return await readProductAppTrackedConversationOperation({
        backend,
        state,
        input: request
      })
    },
    async cancelTrackedConversationOperation(request) {
      return await cancelProductAppTrackedConversationOperation({
        backend,
        state,
        input: request
      })
    },
    async regenerateTrackedConversationOperation(request = {}) {
      return await regenerateProductAppTrackedConversationOperation({
        backend,
        state: stateCoordinator,
        input: request
      })
    },
    async dispose() {
      await conversationEvents.dispose()
      await backend.dispose()
    }
  }
}

async function readProductAppHome(
  backend: ProductAppBackendShell,
  state: MutableProductAppState,
  options?: ProductAppHomeOptions
): Promise<ProductAppHomeReadModel> {
  const [product, providerProfiles] = await Promise.all([
    backend.commands.readProductOverview(options?.overview),
    backend.commands.listProviderProfiles()
  ])
  return {
    kind: "product-app.home",
    state: productAppStateSnapshot(state),
    product,
    providerReadiness: projectProductAppProviderReadiness(providerProfiles),
    integration: PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT,
    rendererBoundary: PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.rendererBoundary,
    commandPort: {
      adapter: "app-owned-command-port",
      commandCount: Object.keys(PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS).length
    }
  }
}

function readProductAppSettings(
  backend: ProductAppBackendShell,
  state: MutableProductAppState
): ProductAppSettingsReadModel {
  const product = backend.status()
  const rendererBoundary = PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.rendererBoundary
  return {
    kind: "product-app.settings",
    state: productAppStateSnapshot(state),
    profile: {
      configuredProviderProfileId: product.providerProfileId,
      activeProviderProfileId: product.activeProviderProfileId,
      agentContextConfigured: product.agentContext.configured,
      agentContextRevision: product.agentContext.revision
    },
    renderer: {
      layout: state.layout,
      mode: state.mode,
      preferences: { ...state.preferences },
      availableLayouts,
      availableModes,
      availableThemes,
      availableDensities
    },
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false
    },
    integration: {
      rendererCalls: rendererBoundary.rendererCalls,
      rendererMayOpenStorage: false,
      rendererMayReceiveStorePath: false,
      rendererMayReceiveServiceBinaryPath: false
    }
  }
}

async function openProductAppWorkbench(
  backend: ProductAppBackendShell,
  state: ProductAppStateCoordinator,
  request?: ProductAppOpenWorkbenchRequest
): Promise<ProductAppOpenWorkbenchResult> {
  const sessionId = resolveProductAppSessionId(state.state, request?.sessionId)
  if (sessionId === undefined) {
    return noSession()
  }
  await state.mutate(async (current) => {
    const next = copyProductAppState(current)
    next.selectedSessionId = sessionId
    return { value: undefined, next }
  })
  const envelope = await backend.dispatch({
    command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
    input: { sessionId }
  })
  if (!envelope.ok) {
    return failedWorkbench(sessionId, envelope)
  }
  return {
    kind: "product-app.workbench.opened",
    sessionId,
    workbench: envelope.value as ProductAppOpenWorkbenchResult extends {
      readonly workbench: infer T
    } ? T : never
  }
}

function failedWorkbench(
  sessionId: string,
  envelope: ProductAppBackendCommandPortEnvelope
): ProductAppWorkbenchFailedResult {
  if (envelope.ok) {
    throw new Error("expected failed workbench envelope")
  }
  return {
    kind: "product-app.workbench.failed",
    sessionId,
    error: envelope.error
  }
}

function noSession(): ProductAppOpenWorkbenchResult {
  return {
    kind: "product-app.workbench.no-session",
    message: "select a session before opening the workbench"
  }
}

function normalizeRequiredString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return value
}
