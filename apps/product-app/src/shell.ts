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
  ProductAppContinueWorkbenchRequest,
  ProductAppContinueWorkbenchResult,
  ProductAppHomeOptions,
  ProductAppHomeReadModel,
  ProductAppInitialState,
  ProductAppLayout,
  ProductAppMode,
  ProductAppOpenWorkbenchRequest,
  ProductAppOpenWorkbenchResult,
  ProductAppProviderReadinessReadModel,
  ProductAppRendererPreferences,
  ProductAppSafeError,
  ProductAppSelectSessionRequest,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShell,
  ProductAppShellOptions,
  ProductAppShellStatus,
  ProductAppStartWorkbenchRequest,
  ProductAppStartWorkbenchResult,
  ProductAppStateSnapshot,
  ProductAppStateStore,
  ProductAppUpdatePreferencesRequest,
  ProductAppWorkbenchFailedResult
} from "./types.js"
import { createNoopProductAppStateStore } from "./state-store.js"
import {
  dispatchProductAppCommandJsonWithPolicy,
  dispatchProductAppCommandWithPolicy,
  executeProductAppCommandWithPolicy,
  previewProductAppCommandInvocationWithPolicy
} from "./command-port-policy.js"
import {
  productAppProviderNotReadyError,
  projectProductAppProviderReadiness
} from "./provider-readiness.js"

const defaultPreferences: ProductAppRendererPreferences = {
  theme: "system",
  density: "comfortable"
}

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
  const state = createMutableState(
    mergeInitialState(
      loadedState.found ? loadedState.state : undefined,
      options.state
    )
  )

  return {
    status() {
      return {
        kind: "product-app.status",
        disposed: backend.status().disposed,
        state: snapshotState(state),
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
      return await commitState(stateStore, state, {
        ...state,
        selectedSessionId: normalizeRequiredString(
          request.sessionId,
          "sessionId"
        )
      })
    },
    async setLayout(request) {
      return await commitState(stateStore, state, {
        ...state,
        layout: request.layout
      })
    },
    async setMode(request) {
      return await commitState(stateStore, state, {
        ...state,
        mode: request.mode
      })
    },
    async updatePreferences(request) {
      return await commitState(stateStore, state, {
        ...state,
        preferences: {
          ...state.preferences,
          ...request.preferences
        }
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
      return await openProductAppWorkbench(backend, stateStore, state, request)
    },
    async startWorkbench(request) {
      return await startProductAppWorkbench(backend, stateStore, state, request)
    },
    async continueWorkbench(request) {
      return await continueProductAppWorkbench(
        backend,
        stateStore,
        state,
        request
      )
    },
    async dispose() {
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
    state: snapshotState(state),
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
    state: snapshotState(state),
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
  stateStore: ProductAppStateStore,
  state: MutableProductAppState,
  request?: ProductAppOpenWorkbenchRequest
): Promise<ProductAppOpenWorkbenchResult> {
  const sessionId = resolveSessionId(state, request?.sessionId)
  if (sessionId === undefined) {
    return noSession()
  }
  await commitState(stateStore, state, {
    ...state,
    selectedSessionId: sessionId
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

async function startProductAppWorkbench(
  backend: ProductAppBackendShell,
  stateStore: ProductAppStateStore,
  state: MutableProductAppState,
  request: ProductAppStartWorkbenchRequest
): Promise<ProductAppStartWorkbenchResult> {
  const readiness = await readProductAppProviderReadiness(backend)
  if (!readiness.canRun) {
    return failedWorkbenchFromError(
      request.sessionId,
      productAppProviderNotReadyError(readiness)
    )
  }
  const turn = await backend.commands.runAgentTurn({
    text: request.text,
    ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
    ...(request.principalId === undefined ? {} : { principalId: request.principalId }),
    ...(request.inputId === undefined ? {} : { inputId: request.inputId }),
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey }),
    ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    ...(request.jobIdempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: request.jobIdempotencyKey })
  })
  await commitState(stateStore, state, {
    ...state,
    selectedSessionId: turn.sessionId
  })
  const envelope = await backend.dispatch({
    command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
    input: { sessionId: turn.sessionId }
  })
  if (!envelope.ok) {
    return failedWorkbench(turn.sessionId, envelope)
  }
  return {
    kind: "product-app.workbench.started",
    sessionId: turn.sessionId,
    turn,
    workbench: envelope.value as ProductAppStartWorkbenchResult extends {
      readonly workbench: infer T
    } ? T : never
  }
}

async function continueProductAppWorkbench(
  backend: ProductAppBackendShell,
  stateStore: ProductAppStateStore,
  state: MutableProductAppState,
  request: ProductAppContinueWorkbenchRequest
): Promise<ProductAppContinueWorkbenchResult> {
  const sessionId = resolveSessionId(state, request.sessionId)
  if (sessionId === undefined) {
    return noSession()
  }
  const readiness = await readProductAppProviderReadiness(backend)
  if (!readiness.canRun) {
    return failedWorkbenchFromError(
      sessionId,
      productAppProviderNotReadyError(readiness)
    )
  }
  await commitState(stateStore, state, {
    ...state,
    selectedSessionId: sessionId
  })
  const envelope = await backend.dispatch({
    command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.continueProductWorkbenchSession,
    input: {
      sessionId,
      text: request.text,
      ...(request.principalId === undefined ? {} : { principalId: request.principalId }),
      ...(request.inputId === undefined ? {} : { inputId: request.inputId }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: request.jobIdempotencyKey })
    }
  })
  if (!envelope.ok) {
    return failedWorkbench(sessionId, envelope)
  }
  return {
    kind: "product-app.workbench.continued",
    sessionId,
    result: envelope.value as ProductAppContinueWorkbenchResult extends {
      readonly result: infer T
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

function failedWorkbenchFromError(
  sessionId: string | undefined,
  error: ProductAppSafeError
): ProductAppWorkbenchFailedResult {
  return {
    kind: "product-app.workbench.failed",
    ...(sessionId === undefined ? {} : { sessionId }),
    error
  }
}

async function readProductAppProviderReadiness(
  backend: ProductAppBackendShell
): Promise<ProductAppProviderReadinessReadModel> {
  return projectProductAppProviderReadiness(
    await backend.commands.listProviderProfiles()
  )
}

function noSession(): ProductAppOpenWorkbenchResult & ProductAppContinueWorkbenchResult {
  return {
    kind: "product-app.workbench.no-session",
    message: "select a session before opening the workbench"
  }
}

interface MutableProductAppState {
  selectedSessionId?: string
  layout: ProductAppLayout
  mode: ProductAppMode
  preferences: ProductAppRendererPreferences
}

function createMutableState(
  initial: ProductAppInitialState | undefined
): MutableProductAppState {
  return {
    ...(initial?.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: initial.selectedSessionId }),
    layout: initial?.layout ?? "single",
    mode: initial?.mode ?? "chat",
    preferences: {
      ...defaultPreferences,
      ...(initial?.preferences ?? {})
    }
  }
}

function mergeInitialState(
  stored: ProductAppInitialState | undefined,
  explicit: ProductAppInitialState | undefined
): ProductAppInitialState | undefined {
  if (stored === undefined) {
    return explicit
  }
  if (explicit === undefined) {
    return stored
  }
  return {
    ...stored,
    ...explicit,
    preferences: {
      ...(stored.preferences ?? {}),
      ...(explicit.preferences ?? {})
    }
  }
}

async function commitState(
  store: ProductAppStateStore,
  current: MutableProductAppState,
  next: MutableProductAppState
): Promise<ProductAppStateSnapshot> {
  const snapshot = snapshotState(next)
  await store.save(snapshot)
  replaceState(current, next)
  return snapshot
}

function replaceState(
  current: MutableProductAppState,
  next: MutableProductAppState
): void {
  if (next.selectedSessionId === undefined) {
    delete current.selectedSessionId
  } else {
    current.selectedSessionId = next.selectedSessionId
  }
  current.layout = next.layout
  current.mode = next.mode
  current.preferences = { ...next.preferences }
}

function snapshotState(
  state: MutableProductAppState
): ProductAppStateSnapshot {
  return {
    ...(state.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: state.selectedSessionId }),
    layout: state.layout,
    mode: state.mode,
    preferences: { ...state.preferences }
  }
}

function resolveSessionId(
  state: MutableProductAppState,
  requestedSessionId: string | undefined
): string | undefined {
  const sessionId = requestedSessionId ?? state.selectedSessionId
  if (sessionId === undefined || sessionId.trim().length === 0) {
    return undefined
  }
  return sessionId
}

function normalizeRequiredString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`)
  }
  return value
}
