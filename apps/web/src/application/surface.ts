import { idleCommandPreview } from "./commands/preview/projection.js"
import { idleCommandExecution } from "./commands/execution/projection.js"
import {
  idleExecutionActivity,
  refreshExecutionActivity
} from "./execution/projection.js"
import {
  failedOperationStatus,
  idleOperationStatus,
  isFailedActionResult,
  runSurfaceAction,
  withActionDiagnostic
} from "./actions.js"
import {
  buildViewModel,
  projectDiagnostics
} from "./projection.js"
import {
  idleWorkbench,
  normalizeWorkbenchForSelectedSession
} from "./workflows/workbench.js"
import {
  applyConversationEvents,
  applyConversationHistory,
  idleConversation,
  normalizeConversationForSelectedSession,
  projectConversationFromResult
} from "./conversation/projection.js"
import {
  idleSideQuery,
  reconcileSideQuery
} from "./workflows/side-query.js"
import {
  idlePlan,
  reconcilePlan
} from "./workflows/plan.js"
import {
  idleGoal,
  reconcileGoal
} from "./workflows/goal.js"
import {
  mergeEarlierTeamPage,
  projectTeamView,
  reconcileTeamEvents
} from "./team/projection.js"
import type {
  CreateSurfaceOptions,
  Action,
  ActionDispatchOptions,
  ActionResult,
  CommandPreviewViewModel,
  CommandExecutionViewModel,
  ConversationViewModel,
  ExecutionActivityViewModel,
  GoalViewModel,
  OperationStatusViewModel,
  PlanViewModel,
  ReconcileEventsOptions,
  SideQueryViewModel,
  Snapshot,
  Surface,
  WorkbenchViewModel
} from "./model.js"
import type { TeamViewModel } from "./team/model.js"
import type { SurfaceClientEventsResult } from "@wanex/product/surface"
import {
  pluginManagementRejectionMessage,
  projectPluginManagementActionOutput
} from "./plugins/projection.js"

export async function createSurface(
  options: CreateSurfaceOptions
): Promise<Surface> {
  const now = options.now ?? Date.now
  const eventLimit = options.eventLimit ?? 20
  let snapshot = await readSnapshot({
    options,
    now,
    eventStreamId: undefined,
    eventCursor: 0,
    eventLimit,
    homeOptions: options.homeOptions,
    operationStatus: idleOperationStatus(),
    commandPreview: idleCommandPreview(),
    commandExecution: idleCommandExecution(),
    executionActivity: idleExecutionActivity(),
    conversation: undefined,
    sideQuery: idleSideQuery(),
    plan: idlePlan(),
    goal: idleGoal(),
    team: undefined,
    workbench: undefined
  })
  let snapshotMutationTail: Promise<void> = Promise.resolve()

  function mutateSnapshot<T>(operation: () => Promise<T>): Promise<T> {
    const result = snapshotMutationTail.then(operation, operation)
    snapshotMutationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  return {
    snapshot() {
      return snapshot
    },
    refresh(homeOptions) {
      return mutateSnapshot(async () => {
        snapshot = await readSnapshot({
          options,
          now,
          eventStreamId: snapshot.eventStreamId,
          eventCursor: snapshot.eventCursor,
          eventLimit,
          homeOptions: homeOptions ?? options.homeOptions,
          operationStatus: snapshot.operationStatus,
          commandPreview: snapshot.commandPreview,
          commandExecution: snapshot.commandExecution,
          executionActivity: snapshot.executionActivity,
          conversation: snapshot.conversation,
          sideQuery: snapshot.sideQuery,
          plan: snapshot.plan,
          goal: snapshot.goal,
          team: snapshot.team,
          workbench: snapshot.workbench
        })
        return snapshot
      })
    },
    reconcileEvents(reconcileOptions) {
      return mutateSnapshot(async () => {
        snapshot = await readEventSnapshot({
          options,
          now,
          snapshot,
          eventLimit: reconcileOptions?.limit ?? eventLimit
        })
        return snapshot
      })
    },
    dispatchAction(action, actionOptions) {
      return mutateSnapshot(async () => {
        const result = await dispatchAction({
          options,
          action,
          ...(actionOptions === undefined ? {} : { actionOptions }),
          now,
          eventCursor: snapshot.eventCursor,
          eventStreamId: snapshot.eventStreamId,
          eventLimit,
          commandPreview: snapshot.commandPreview,
          commandExecution: snapshot.commandExecution,
          executionActivity: snapshot.executionActivity,
          conversation: snapshot.conversation,
          sideQuery: snapshot.sideQuery,
          plan: snapshot.plan,
          goal: snapshot.goal,
          team: snapshot.team,
          workbench: snapshot.workbench
        })
        snapshot = result.snapshot
        return result
      })
    }
  }
}

async function readEventSnapshot(request: {
  readonly options: CreateSurfaceOptions
  readonly now: () => number
  readonly snapshot: Snapshot
  readonly eventLimit: number
}): Promise<Snapshot> {
  const selectedSessionId = sessionIdFromSelection(
    request.snapshot.view.selection
  )
  const selectedTeamConversationId = teamIdFromSelection(
    request.snapshot.view.selection
  )
  const events = await request.options.client.readSurfaceEvents({
    afterSequence: request.snapshot.eventCursor,
    ...(request.snapshot.eventStreamId === undefined
      ? {}
      : { streamId: request.snapshot.eventStreamId }),
    limit: request.eventLimit
  })
  const [
    executionActivity,
    conversationResult,
    transcriptResult,
    sideQuery,
    plan,
    commandCatalog,
    pluginManagement
  ] = await Promise.all([
    refreshExecutionActivity({
      client: request.options.client,
      previous: request.snapshot.executionActivity,
      now: request.now
    }),
    request.options.client.readTrackedConversationOperation(
      selectedSessionId === undefined
        ? undefined
        : { sessionId: selectedSessionId }
    ),
    request.options.client.readSessionTranscript(
      selectedSessionId === undefined
        ? undefined
        : { sessionId: selectedSessionId }
    ),
    reconcileSideQuery({
      client: request.options.client,
      previous: request.snapshot.sideQuery
    }),
    reconcilePlan({
      client: request.options.client,
      previous: request.snapshot.plan
    }),
    shouldRefreshCommandCatalog(events)
      ? request.options.client.readProductCommands()
      : request.snapshot.commandCatalog,
    shouldRefreshPluginManagement(events)
      ? request.options.client.readPluginManagement()
      : request.snapshot.pluginManagement
  ])
  const eventPosition = nextEventPosition({
    streamId: request.snapshot.eventStreamId,
    cursor: request.snapshot.eventCursor,
    events
  })
  const bufferedConversation =
    events.ok && !events.gap && !events.hasMore
      ? applyConversationEvents(
          request.snapshot.conversation,
          events.events
        )
      : discardTransientAssistantText(request.snapshot.conversation)
  const operationConversation = conversationResult.ok
    ? projectConversationFromResult(
        conversationResult.value,
        bufferedConversation
      )
    : bufferedConversation
  const conversation = transcriptResult.ok
    ? applyConversationHistory(
        operationConversation,
        transcriptResult.value
      )
    : operationConversation
  const shouldRefreshGoal =
    !events.ok ||
    events.gap ||
    events.events.some(
      (event) =>
        event.type === "product.surface.goal.invalidated" &&
        event.goal?.sessionId === selectedSessionId
    )
  const goal = shouldRefreshGoal
    ? await reconcileGoal({
        client: request.options.client,
        previous: request.snapshot.goal,
        ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId })
      })
    : request.snapshot.goal
  const teamState = await reconcileTeamEvents({
    client: request.options.client,
    list: request.snapshot.teamList,
    previous: request.snapshot.team,
    ...(selectedTeamConversationId === undefined
      ? {}
      : { selectedConversationId: selectedTeamConversationId }),
    events
  })
  const base = {
    ...request.snapshot,
    generatedAt: request.now(),
    events,
    ...(eventPosition.streamId === undefined
      ? {}
      : { eventStreamId: eventPosition.streamId }),
    eventCursor: eventPosition.cursor,
    operationStatus: request.snapshot.operationStatus,
    executionActivity,
    conversation,
    sideQuery,
    plan,
    goal,
    commandCatalog,
    pluginManagement,
    teamList: teamState.list,
    team: teamState.team,
    diagnostics: projectDiagnostics({
      descriptor: request.snapshot.descriptor,
      status: request.snapshot.status,
      home: request.snapshot.home,
      settings: request.snapshot.settings,
      modelEndpoints: request.snapshot.modelEndpoints,
      commandCatalog,
      pluginManagement,
      attachments: request.snapshot.attachments,
      teamList: teamState.list,
      events
    })
  }
  return {
    ...base,
    view: buildViewModel(base)
  }
}

function shouldRefreshCommandCatalog(
  events: SurfaceClientEventsResult
): boolean {
  return (
    !events.ok ||
    events.gap ||
    events.events.some(
      (event) =>
        event.type === "product.surface.command-catalog.invalidated"
    )
  )
}

function shouldRefreshPluginManagement(
  events: SurfaceClientEventsResult
): boolean {
  return (
    !events.ok ||
    events.gap ||
    events.events.some(
      (event) =>
        event.type === "product.surface.plugin-management.invalidated"
    )
  )
}

async function readSnapshot(request: {
  readonly options: CreateSurfaceOptions
  readonly now: () => number
  readonly eventStreamId: string | undefined
  readonly eventCursor: number
  readonly eventLimit: number
  readonly homeOptions: CreateSurfaceOptions["homeOptions"]
  readonly operationStatus: OperationStatusViewModel
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly conversation: ConversationViewModel | undefined
  readonly sideQuery: SideQueryViewModel
  readonly plan: PlanViewModel
  readonly goal: GoalViewModel
  readonly team: TeamViewModel | undefined
  readonly workbench: WorkbenchViewModel | undefined
}): Promise<Snapshot> {
  const [
    descriptor,
    status,
    home,
    settings,
    modelEndpoints,
    commandCatalog,
    teamList,
    sideQuery,
    plan,
    pluginManagement
  ] = await Promise.all([
    request.options.client.descriptor(),
    request.options.client.status(),
    request.options.client.readHome(request.homeOptions),
    request.options.client.readSettings(),
    request.options.client.listModelEndpoints(),
    request.options.client.readProductCommands(),
    request.options.client.listTeamConversations({ state: "open", limit: 100 }),
    reconcileSideQuery({
      client: request.options.client,
      previous: request.sideQuery
    }),
    reconcilePlan({
      client: request.options.client,
      previous: request.plan
    }),
    request.options.client.readPluginManagement()
  ])
  const events = await request.options.client.readSurfaceEvents({
    afterSequence: request.eventCursor,
    ...(request.eventStreamId === undefined
      ? {}
      : { streamId: request.eventStreamId }),
    limit: request.eventLimit
  })
  const eventPosition = nextEventPosition({
    streamId: request.eventStreamId,
    cursor: request.eventCursor,
    events
  })
  const selectedSessionId = status.ok
    ? sessionIdFromSelection(status.value.state.selection)
    : undefined
  const selectedTeamConversationId = status.ok
    ? teamIdFromSelection(status.value.state.selection)
    : undefined
  const [conversationResult, transcriptResult, attachments, goal, teamRead] = await Promise.all(
    [
      request.options.client.readTrackedConversationOperation(
        selectedSessionId === undefined
          ? undefined
          : { sessionId: selectedSessionId }
      ),
      request.options.client.readSessionTranscript(
        selectedSessionId === undefined
          ? undefined
          : { sessionId: selectedSessionId }
      ),
      request.options.client.readConversationAttachments(
        selectedSessionId === undefined
          ? undefined
          : { sessionId: selectedSessionId }
      ),
      reconcileGoal({
        client: request.options.client,
        previous: request.goal,
        ...(selectedSessionId === undefined ? {} : { sessionId: selectedSessionId })
      }),
      request.options.client.readTeamConversation(
        selectedTeamConversationId === undefined
          ? undefined
          : { conversationId: selectedTeamConversationId, limit: 50 }
      )
    ]
  )
  const team = projectTeamView({
    list: teamList,
    read: teamRead,
    ...(selectedTeamConversationId === undefined
      ? {}
      : { selectedConversationId: selectedTeamConversationId }),
    ...(request.team === undefined ? {} : { previous: request.team })
  })
  const bufferedConversation =
    events.ok &&
    !events.gap &&
    !events.hasMore &&
    request.conversation !== undefined
      ? applyConversationEvents(
          request.conversation,
          events.events
        )
      : request.conversation === undefined
        ? undefined
        : discardTransientAssistantText(request.conversation)
  const operationConversation =
    normalizeConversationForSelectedSession(
      conversationResult.ok
        ? projectConversationFromResult(
            conversationResult.value,
            bufferedConversation
          )
        : (bufferedConversation ??
            idleConversation(selectedSessionId)),
      selectedSessionId
    )
  const conversation = transcriptResult.ok
    ? applyConversationHistory(
        operationConversation,
        transcriptResult.value
      )
    : operationConversation
  const workbench = normalizeWorkbenchForSelectedSession(
    request.workbench ?? idleWorkbench(selectedSessionId),
    selectedSessionId
  )
  const base = {
    kind: "web.snapshot" as const,
    generatedAt: request.now(),
    descriptor,
    status,
    home,
    settings,
    modelEndpoints,
    commandCatalog,
    pluginManagement,
    teamList,
    events,
    ...(eventPosition.streamId === undefined
      ? {}
      : { eventStreamId: eventPosition.streamId }),
    eventCursor: eventPosition.cursor,
    operationStatus: request.operationStatus,
    commandPreview: request.commandPreview,
    commandExecution: request.commandExecution,
    executionActivity: request.executionActivity,
    conversation,
    sideQuery,
    plan,
    goal,
    team,
    attachments,
    workbench,
    diagnostics: projectDiagnostics({
      descriptor,
      status,
      home,
      settings,
      modelEndpoints,
      commandCatalog,
      pluginManagement,
      attachments,
      teamList,
      events
    })
  }
  return {
    ...base,
    view: buildViewModel(base)
  }
}

function sessionIdFromSelection(
  selection: import("@wanex/product").StateSnapshot["selection"]
): string | undefined {
  return selection?.kind === "session" ? selection.sessionId : undefined
}

function teamIdFromSelection(
  selection: import("@wanex/product").StateSnapshot["selection"]
): string | undefined {
  return selection?.kind === "team" ? selection.conversationId : undefined
}

async function dispatchAction(request: {
  readonly options: CreateSurfaceOptions
  readonly action: Action
  readonly actionOptions?: ActionDispatchOptions
  readonly now: () => number
  readonly eventStreamId: string | undefined
  readonly eventCursor: number
  readonly eventLimit: number
  readonly commandPreview: CommandPreviewViewModel
  readonly commandExecution: CommandExecutionViewModel
  readonly executionActivity: ExecutionActivityViewModel
  readonly conversation: ConversationViewModel
  readonly sideQuery: SideQueryViewModel
  readonly plan: PlanViewModel
  readonly goal: GoalViewModel
  readonly team: TeamViewModel
  readonly workbench: WorkbenchViewModel
}): Promise<ActionResult> {
  try {
    const transition = await runSurfaceAction({
      options: request.options,
      action: request.action,
      ...(request.actionOptions === undefined
        ? {}
        : { actionOptions: request.actionOptions }),
      now: request.now,
      commandPreview: request.commandPreview,
      commandExecution: request.commandExecution,
      executionActivity: request.executionActivity,
      conversation: request.conversation,
      sideQuery: request.sideQuery,
      plan: request.plan,
      workbench: request.workbench
    })
    const output = isPluginManagementAction(request.action)
      ? projectPluginManagementActionOutput(
          request.action.type,
          transition.actionResult
        )
      : undefined
    let snapshot = await readSnapshot({
      options: request.options,
      now: request.now,
      eventStreamId: request.eventStreamId,
      eventCursor: request.eventCursor,
      eventLimit: request.eventLimit,
      homeOptions: request.options.homeOptions,
      operationStatus: transition.operationStatus,
      commandPreview: transition.commandPreview,
      commandExecution: transition.commandExecution,
      executionActivity: transition.executionActivity,
      conversation: transition.conversation,
      sideQuery: transition.sideQuery,
      plan: transition.plan,
      goal: request.goal,
      team: request.team,
      workbench: transition.workbench
    })
    if (
      request.action.type === "load-earlier-team-history" &&
      transition.actionResult.ok
    ) {
      const team = mergeEarlierTeamPage({
        current: snapshot.team,
        previous: request.team,
        result: transition.actionResult.value,
        requestedConversationId: request.action.input.conversationId
      })
      const merged = { ...snapshot, team }
      snapshot = { ...merged, view: buildViewModel(merged) }
    }
    if (isFailedActionResult(transition.actionResult)) {
      return {
        ok: false,
        action: request.action.type,
        message: transition.actionResult.error.message,
        snapshot: withActionDiagnostic(
          snapshot,
          transition.actionResult.error.message
        )
      }
    }
    const pluginRejection = pluginManagementRejectionMessage(output)
    if (pluginRejection !== undefined) {
      return {
        ok: false,
        action: request.action.type,
        message: pluginRejection,
        ...(output === undefined ? {} : { output }),
        snapshot: withActionDiagnostic(snapshot, pluginRejection)
      }
    }
    if (transition.operationStatus.state === "blocked") {
      return {
        ok: false,
        action: request.action.type,
        message: transition.operationStatus.message,
        snapshot
      }
    }
    return {
      ok: true,
      action: request.action.type,
      ...(output === undefined ? {} : { output }),
      snapshot
    }
  } catch (error) {
    const snapshot = await readSnapshot({
      options: request.options,
      now: request.now,
      eventStreamId: request.eventStreamId,
      eventCursor: request.eventCursor,
      eventLimit: request.eventLimit,
      homeOptions: request.options.homeOptions,
      operationStatus: failedOperationStatus({
        action: request.action.type,
        message: error instanceof Error ? error.message : String(error),
        updatedAt: request.now()
      }),
      commandPreview: request.commandPreview,
      commandExecution: request.commandExecution,
      executionActivity: request.executionActivity,
      conversation: request.conversation,
      sideQuery: request.sideQuery,
      plan: request.plan,
      goal: request.goal,
      team: request.team,
      workbench: request.workbench
    })
    return {
      ok: false,
      action: request.action.type,
      message: error instanceof Error ? error.message : String(error),
      snapshot: withActionDiagnostic(
        snapshot,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}

function isPluginManagementAction(
  action: Action
): action is Action & {
  readonly type:
    | "read-plugin-management"
    | "request-local-plugin-review"
    | "approve-local-plugin-review"
    | "cancel-local-plugin-review"
    | "set-plugin-install-state"
    | "retry-plugin-refresh"
} {
  return action.type === "read-plugin-management" ||
    action.type === "request-local-plugin-review" ||
    action.type === "approve-local-plugin-review" ||
    action.type === "cancel-local-plugin-review" ||
    action.type === "set-plugin-install-state" ||
    action.type === "retry-plugin-refresh"
}

function nextEventPosition(request: {
  readonly streamId: string | undefined
  readonly cursor: number
  readonly events: Snapshot["events"]
}): { readonly streamId?: string; readonly cursor: number } {
  if (!request.events.ok) {
    return {
      ...(request.streamId === undefined ? {} : { streamId: request.streamId }),
      cursor: request.cursor
    }
  }
  return {
    streamId: request.events.streamId,
    cursor: request.events.latestSequence
  }
}

function discardTransientAssistantText(
  conversation: Snapshot["conversation"]
): Snapshot["conversation"] {
  const { transientAssistantText: _discarded, ...canonical } = conversation
  return canonical
}
