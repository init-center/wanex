import type { Shell } from "../model.js"
import {
  knownSurfaceCommands,
  surfaceCommandMutatesState,
  surfaceDescriptor
} from "./descriptor.js"
import { createSurfaceEventRecorder } from "./event-log.js"
import {
  normalizeSurfaceError,
  optionalRequestId,
  parseSurfaceRequest
} from "./input.js"
import { runSurfaceCommand } from "./dispatch.js"
import {
  SURFACE_COMMANDS,
  type SurfaceAdapter,
  type SurfaceCommand,
  type SurfaceEnvelope,
  type SurfaceError,
  type SurfaceEvent
} from "./model.js"

export interface SurfaceAdapterOptions {
  readonly now?: () => number
  readonly eventBufferCapacity?: number
  readonly streamId?: string
}

export { surfaceDescriptor } from "./descriptor.js"

export function createSurfaceAdapter(
  app: Shell,
  options: SurfaceAdapterOptions = {}
): SurfaceAdapter {
  const events = createSurfaceEventRecorder({
    now: options.now ?? Date.now,
    ...(options.eventBufferCapacity === undefined
      ? {}
      : { capacity: options.eventBufferCapacity }),
    ...(options.streamId === undefined ? {} : { streamId: options.streamId })
  })
  const unsubscribeCommandCatalog =
    app.commandCatalogEvents.subscribeCommandCatalogEvents((commandCatalog) => {
      events.record({
        type: "product.surface.command-catalog.invalidated",
        command: SURFACE_COMMANDS.readProductCommands,
        commandCatalog
      })
    })
  const unsubscribeCommandExecution =
    app.commandExecutionEvents.subscribeCommandExecutionEvents(
      (commandExecution) => {
        events.record({
          type: "product.surface.command-execution.invalidated",
          command: SURFACE_COMMANDS.readExecutionReference,
          commandExecution
        })
      }
    )
  const unsubscribe = app.events.subscribeConversationEvents((conversation) => {
    events.record({
      type:
        conversation.kind === "product.conversation.assistant-text-delta"
          ? "product.surface.conversation.assistant-text-delta"
          : "product.surface.conversation.operation-invalidated",
      command: SURFACE_COMMANDS.readTrackedConversationOperation,
      conversation
    })
  })
  const unsubscribeSideQueries = app.sideQueryEvents.subscribeSideQueryEvents(
    (sideQuery) => {
      events.record({
        type: "product.surface.side-query.invalidated",
        command: SURFACE_COMMANDS.readSideQuery,
        sideQuery
      })
    }
  )
  const unsubscribePlans = app.planEvents.subscribePlanEvents((plan) => {
    events.record({
      type: "product.surface.plan.invalidated",
      command: SURFACE_COMMANDS.readPlanProposal,
      plan
    })
  })
  const unsubscribeGoals = app.goalEvents.subscribeGoalEvents((goal) => {
    events.record({
      type: "product.surface.goal.invalidated",
      command: SURFACE_COMMANDS.readGoal,
      goal
    })
  })
  const unsubscribeTeams = app.teamEvents.subscribeTeamEvents((team) => {
    events.record({
      type: "product.surface.team.invalidated",
      command: SURFACE_COMMANDS.readTeamConversation,
      team
    })
  })
  const unsubscribePluginManagement =
    app.pluginManagementEvents.subscribePluginManagementEvents(
      (pluginManagement) => {
        events.record({
          type: "product.surface.plugin-management.invalidated",
          command: SURFACE_COMMANDS.readPluginManagement,
          pluginManagement
        })
      }
    )
  const unsubscribeSchedules = app.scheduleEvents.subscribeScheduleEvents(
    (schedule) => {
      events.record({
        type: "product.surface.schedule.invalidated",
        command: SURFACE_COMMANDS.listSchedules,
        schedule
      })
    }
  )
  let disposed = false

  return {
    descriptor() {
      return surfaceDescriptor()
    },
    async dispatchSurfaceCommand(input) {
      return await dispatchSurfaceCommand(app, events, input)
    },
    readSurfaceEvents(request) {
      return events.read(request)
    },
    subscribeSurfaceEvents(listener) {
      return events.subscribe(listener)
    },
    async dispose() {
      if (disposed) {
        return
      }
      disposed = true
      unsubscribeCommandCatalog()
      unsubscribeCommandExecution()
      unsubscribe()
      unsubscribeSideQueries()
      unsubscribePlans()
      unsubscribeGoals()
      unsubscribeTeams()
      unsubscribePluginManagement()
      unsubscribeSchedules()
      events.dispose()
    }
  }
}

async function dispatchSurfaceCommand(
  app: Shell,
  events: ReturnType<typeof createSurfaceEventRecorder>,
  input: unknown
): Promise<SurfaceEnvelope> {
  const parsed = parseSurfaceRequest(input)
  if (!parsed.ok) {
    return rejectedEnvelope({
      events,
      command: "unknown",
      error: parsed.error
    })
  }

  const request = parsed.request
  if (!knownSurfaceCommands.has(request.command)) {
    return rejectedEnvelope({
      events,
      command: request.command,
      ...optionalRequestId(request.requestId),
      error: {
        code: "unknown_command",
        category: "validation",
        message: `unknown surface command: ${request.command}`
      }
    })
  }

  try {
    const value = await runSurfaceCommand(app, request)
    const state = surfaceCommandMutatesState(
      request.command as SurfaceCommand
    )
      ? app.status().state
      : undefined
    const event = events.record({
      type: "product.surface.command_completed",
      command: request.command,
      ...optionalRequestId(request.requestId),
      ...(state === undefined ? {} : { state })
    })
    if (state !== undefined) {
      events.record({
        type: "product.surface.state_changed",
        command: request.command,
        ...optionalRequestId(request.requestId),
        state
      })
    }
    return {
      ok: true,
      command: request.command,
      value,
      event
    }
  } catch (error) {
    return rejectedEnvelope({
      events,
      command: request.command,
      ...optionalRequestId(request.requestId),
      error: normalizeSurfaceError(error)
    })
  }
}

function rejectedEnvelope(request: {
  readonly events: ReturnType<typeof createSurfaceEventRecorder>
  readonly command: string
  readonly requestId?: string
  readonly error: SurfaceError
}): Extract<SurfaceEnvelope, { readonly ok: false }> {
  const event = recordRejectedEvent(request)
  return {
    ok: false,
    command: request.command,
    error: request.error,
    event
  }
}

function recordRejectedEvent(request: {
  readonly events: ReturnType<typeof createSurfaceEventRecorder>
  readonly command: string
  readonly requestId?: string
  readonly error: SurfaceError
}): SurfaceEvent {
  return request.events.record({
    type: "product.surface.command_rejected",
    command: request.command,
    ...optionalRequestId(request.requestId),
    error: request.error
  })
}
