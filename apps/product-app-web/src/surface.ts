import {
  idleProductAppWebCommandPreview
} from "./command-preview-view.js"
import { idleProductAppWebCommandExecution } from "./command-execution-view.js"
import {
  idleProductAppWebExecutionActivity,
  refreshProductAppWebExecutionActivity
} from "./execution-activity-view.js"
import {
  failedProductAppWebOperationStatus,
  idleProductAppWebOperationStatus,
  isFailedProductAppWebActionResult,
  runProductAppWebSurfaceAction,
  withProductAppWebActionDiagnostic
} from "./surface-action.js"
import {
  buildProductAppWebViewModel,
  productAppWebDiagnostics
} from "./view-model.js"
import {
  idleProductAppWebWorkbench,
  normalizeProductAppWebWorkbenchForSelectedSession
} from "./workbench-view.js"
import type {
  CreateProductAppWebSurfaceOptions,
  ProductAppWebAction,
  ProductAppWebActionResult,
  ProductAppWebCommandPreviewViewModel,
  ProductAppWebCommandExecutionViewModel,
  ProductAppWebExecutionActivityViewModel,
  ProductAppWebOperationStatusViewModel,
  ProductAppWebPollEventsOptions,
  ProductAppWebSnapshot,
  ProductAppWebSurface,
  ProductAppWebWorkbenchViewModel
} from "./types.js"

export async function createProductAppWebSurface(
  options: CreateProductAppWebSurfaceOptions
): Promise<ProductAppWebSurface> {
  const now = options.now ?? Date.now
  const eventLimit = options.eventLimit ?? 20
  let snapshot = await readSnapshot({
    options,
    now,
    eventCursor: 0,
    eventLimit,
    homeOptions: options.homeOptions,
    operationStatus: idleProductAppWebOperationStatus(),
    commandPreview: idleProductAppWebCommandPreview(),
    commandExecution: idleProductAppWebCommandExecution(),
    executionActivity: idleProductAppWebExecutionActivity(),
    workbench: undefined
  })

  return {
    snapshot() {
      return snapshot
    },
    async refresh(homeOptions) {
      snapshot = await readSnapshot({
        options,
        now,
        eventCursor: snapshot.eventCursor,
        eventLimit,
        homeOptions: homeOptions ?? options.homeOptions,
        operationStatus: snapshot.operationStatus,
        commandPreview: snapshot.commandPreview,
        commandExecution: snapshot.commandExecution,
        executionActivity: snapshot.executionActivity,
        workbench: snapshot.workbench
      })
      return snapshot
    },
    async pollEvents(pollOptions) {
      snapshot = await readEventSnapshot({
        options,
        now,
        snapshot,
        eventLimit: pollOptions?.limit ?? eventLimit
      })
      return snapshot
    },
    async dispatchAction(action) {
      const result = await dispatchProductAppWebAction({
        options,
        action,
        now,
        eventCursor: snapshot.eventCursor,
        eventLimit,
        commandPreview: snapshot.commandPreview,
        commandExecution: snapshot.commandExecution,
        executionActivity: snapshot.executionActivity,
        workbench: snapshot.workbench
      })
      snapshot = result.snapshot
      return result
    }
  }
}

async function readEventSnapshot(request: {
  readonly options: CreateProductAppWebSurfaceOptions
  readonly now: () => number
  readonly snapshot: ProductAppWebSnapshot
  readonly eventLimit: number
}): Promise<ProductAppWebSnapshot> {
  const [events, executionActivity] = await Promise.all([
    request.options.client.readSurfaceEvents({
      afterSequence: request.snapshot.eventCursor,
      limit: request.eventLimit
    }),
    refreshProductAppWebExecutionActivity({
      client: request.options.client,
      previous: request.snapshot.executionActivity,
      now: request.now
    })
  ])
  const eventCursor = events.ok
    ? maxSequence(request.snapshot.eventCursor, events.events)
    : request.snapshot.eventCursor
  const base = {
    ...request.snapshot,
    generatedAt: request.now(),
    events,
    eventCursor,
    operationStatus: request.snapshot.operationStatus,
    executionActivity,
    diagnostics: productAppWebDiagnostics({
      descriptor: request.snapshot.descriptor,
      status: request.snapshot.status,
      home: request.snapshot.home,
      settings: request.snapshot.settings,
      providerProfiles: request.snapshot.providerProfiles,
      commandCatalog: request.snapshot.commandCatalog,
      events
    })
  }
  return {
    ...base,
    view: buildProductAppWebViewModel(base)
  }
}

async function readSnapshot(request: {
  readonly options: CreateProductAppWebSurfaceOptions
  readonly now: () => number
  readonly eventCursor: number
  readonly eventLimit: number
  readonly homeOptions: CreateProductAppWebSurfaceOptions["homeOptions"]
  readonly operationStatus: ProductAppWebOperationStatusViewModel
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly workbench: ProductAppWebWorkbenchViewModel | undefined
}): Promise<ProductAppWebSnapshot> {
  const [descriptor, status, home, settings, providerProfiles, commandCatalog] = await Promise.all([
    request.options.client.descriptor(),
    request.options.client.status(),
    request.options.client.readHome(request.homeOptions),
    request.options.client.readSettings(),
    request.options.client.listProviderProfiles(),
    request.options.client.readProductCommands()
  ])
  const events = await request.options.client.readSurfaceEvents({
    afterSequence: request.eventCursor,
    limit: request.eventLimit
  })
  const eventCursor = events.ok
    ? maxSequence(request.eventCursor, events.events)
    : request.eventCursor
  const selectedSessionId = status.ok ? status.value.state.selectedSessionId : undefined
  const workbench = normalizeProductAppWebWorkbenchForSelectedSession(
    request.workbench ?? idleProductAppWebWorkbench(selectedSessionId),
    selectedSessionId
  )
  const base = {
    kind: "product-app-web.snapshot" as const,
    generatedAt: request.now(),
    descriptor,
    status,
    home,
    settings,
    providerProfiles,
    commandCatalog,
    events,
    eventCursor,
    operationStatus: request.operationStatus,
    commandPreview: request.commandPreview,
    commandExecution: request.commandExecution,
    executionActivity: request.executionActivity,
    workbench,
    diagnostics: productAppWebDiagnostics({
      descriptor,
      status,
      home,
      settings,
      providerProfiles,
      commandCatalog,
      events
    })
  }
  return {
    ...base,
    view: buildProductAppWebViewModel(base)
  }
}

async function dispatchProductAppWebAction(request: {
  readonly options: CreateProductAppWebSurfaceOptions
  readonly action: ProductAppWebAction
  readonly now: () => number
  readonly eventCursor: number
  readonly eventLimit: number
  readonly commandPreview: ProductAppWebCommandPreviewViewModel
  readonly commandExecution: ProductAppWebCommandExecutionViewModel
  readonly executionActivity: ProductAppWebExecutionActivityViewModel
  readonly workbench: ProductAppWebWorkbenchViewModel
}): Promise<ProductAppWebActionResult> {
  try {
    const transition = await runProductAppWebSurfaceAction({
      options: request.options,
      action: request.action,
      now: request.now,
      commandPreview: request.commandPreview,
      commandExecution: request.commandExecution,
      executionActivity: request.executionActivity,
      workbench: request.workbench
    })
    const snapshot = await readSnapshot({
      options: request.options,
      now: request.now,
      eventCursor: request.eventCursor,
      eventLimit: request.eventLimit,
      homeOptions: request.options.homeOptions,
      operationStatus: transition.operationStatus,
      commandPreview: transition.commandPreview,
      commandExecution: transition.commandExecution,
      executionActivity: transition.executionActivity,
      workbench: transition.workbench
    })
    if (isFailedProductAppWebActionResult(transition.actionResult)) {
      return {
        ok: false,
        action: request.action.type,
        message: transition.actionResult.error.message,
        snapshot: withProductAppWebActionDiagnostic(
          snapshot,
          transition.actionResult.error.message
        )
      }
    }
    return {
      ok: true,
      action: request.action.type,
      snapshot
    }
  } catch (error) {
    const snapshot = await readSnapshot({
      options: request.options,
      now: request.now,
      eventCursor: request.eventCursor,
      eventLimit: request.eventLimit,
      homeOptions: request.options.homeOptions,
      operationStatus: failedProductAppWebOperationStatus({
        action: request.action.type,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: request.now()
      }),
      commandPreview: request.commandPreview,
      commandExecution: request.commandExecution,
      executionActivity: request.executionActivity,
      workbench: request.workbench
    })
    return {
      ok: false,
      action: request.action.type,
      message: error instanceof Error ? error.message : String(error),
      snapshot: withProductAppWebActionDiagnostic(
        snapshot,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}

function maxSequence(
  fallback: number,
  events: readonly { readonly sequence: number }[]
): number {
  return events.reduce(
    (max, event) => Math.max(max, event.sequence),
    fallback
  )
}
