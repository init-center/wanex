import {
  BACKEND_COMMAND_PORT_COMMANDS,
  BACKEND_INTEGRATION_CONTRACT,
  createBackendShell,
} from "@wanex/product/backend";
import type {
  BackendShell,
  BackendCommandPortEnvelope,
  BackendSessionTranscriptReadModel,
} from "@wanex/product/backend";
import type {
  CancelTrackedConversationOperationRequest,
  ConversationHistoryReadModel,
  ContinueCapabilityRequestRequest,
  ArchiveSessionRequest,
  HomeOptions,
  HomeReadModel,
  OpenWorkbenchRequest,
  OpenWorkbenchResult,
  QueueGuidedFollowUpRequest,
  SteerTrackedConversationOperationRequest,
  StartSideQueryRequest,
  ReadSessionTranscriptRequest,
  SessionTranscriptReadResult,
  ReadTrackedConversationOperationRequest,
  RenameSessionRequest,
  RegenerateTrackedConversationOperationRequest,
  ResolveTrackedConversationRecoveryRequest,
  RestoreSessionRequest,
  SelectSessionRequest,
  SetLayoutRequest,
  SetModeRequest,
  SettingsReadModel,
  Shell,
  ShellOptions,
  ShellStatus,
  StateSnapshot,
  SubmitConversationOperationRequest,
  UpdatePreferencesRequest,
  WorkbenchFailedResult,
} from "./model.js";
import { createNoopStateStore } from "./state/store.js";
import { createConversationEventHub } from "./conversation/events.js";
import {
  createCommandCatalogEventHub,
  createCommandExecutionEventHub,
} from "./commands/events.js";
import {
  cancelTrackedConversationOperation,
  continueCapabilityRequest,
  queueGuidedFollowUp,
  readTrackedConversationOperation,
  projectCapabilityRequests,
  regenerateTrackedConversationOperation,
  submitConversationOperation,
} from "./conversation/operation.js";
import { steerTrackedConversationOperation } from "./conversation/steering.js";
import { resolveTrackedConversationRecovery } from "./conversation/recovery.js";
import { resolveTrackedConversationApproval } from "./conversation/approval.js";
import {
  copyState,
  createState,
  createStateCoordinator,
  stateSnapshot,
  resolveSessionId,
  selectedSessionId,
  type MutableState,
  type StateCoordinator,
} from "./state/product.js";
import {
  dispatchCommandJsonWithPolicy,
  dispatchCommandWithPolicy,
  executeCommandWithPolicy,
  previewCommandInvocationWithPolicy,
} from "./backend/port/policy.js";
import { projectProviderReadiness } from "./provider/readiness.js";
import {
  prepareConversationAttachment,
  readConversationAttachments,
  removeConversationAttachment,
} from "./attachments/service.js";
import { createSideQueryCoordinator } from "./side-query/service.js";
import { createPlanShell } from "./plan/shell.js";
import { createGoalShell } from "./goal/service.js";
import { createTeamConversationService } from "./team/service.js";
import { createProductPluginManagementService } from "./plugin-management/service.js";
import type { TeamConversationCommands } from "./team/port.js";
import { reconcileConversationSelection } from "./state/reconciliation.js";
import {
  conversationHistoryCursor,
  conversationHistoryRowId,
  parseConversationHistoryCursor,
} from "./conversation/history-row.js";
import { projectConversationTimelineParts } from "./conversation/timeline.js";

const availableLayouts = ["single", "split", "diagnostics"] as const;
const availableModes = ["chat", "workbench", "diagnostics"] as const;
const availableThemes = ["system", "light", "dark"] as const;
const availableDensities = ["comfortable", "compact"] as const;

export async function createShell(
  options: ShellOptions,
): Promise<Shell> {
  const stateStore = options.stateStore ?? createNoopStateStore();
  const loadedState = await stateStore.load();
  const backend = await createBackendShell(options);
  const state = createState(
    loadedState.found ? loadedState.state : undefined,
    options.state,
  );
  const stateCoordinator = createStateCoordinator({
    store: stateStore,
    state,
  });
  const conversationEvents = createConversationEventHub({
    backend,
    state,
  });
  const commandCatalogEvents = createCommandCatalogEventHub({
    ...(options.extensions?.source === undefined
      ? {}
      : { source: options.extensions.source }),
  });
  const commandExecutionEvents = createCommandExecutionEventHub({
    ...(options.productCommands?.executionInvalidations === undefined
      ? {}
      : { source: options.productCommands.executionInvalidations }),
  });
  const sideQueries = createSideQueryCoordinator({
    backend,
    state,
  });
  const plans = createPlanShell({
    backend,
    state: stateCoordinator,
  });
  const goals = createGoalShell({ backend, state });
  const teams = createTeamConversationService({
    state: stateCoordinator,
    ...(options.teamConversations === undefined
      ? {}
      : { port: options.teamConversations }),
  });
  const pluginManagement = createProductPluginManagementService({
    ...(options.pluginManagement === undefined
      ? {}
      : { port: options.pluginManagement }),
  });

  return {
    commandCatalogEvents,
    commandExecutionEvents,
    events: conversationEvents,
    sideQueryEvents: sideQueries.events,
    planEvents: plans.events,
    goalEvents: goals.events,
    teamEvents: teams.events,
    teamConversations: teams.commands,
    pluginManagementEvents: pluginManagement.events,
    pluginManagement: pluginManagement.commands,
    trustedResources: {
      ingestResource: backend.commands.ingestResource,
      readResource: backend.commands.readResource,
      readResourceContent: backend.commands.readResourceContent,
    },
    trustedExecution: backend.trustedExecution,
    status() {
      return {
        kind: "product.status",
        disposed: backend.status().disposed,
        state: stateSnapshot(state),
        product: backend.status(),
        integrationContractKind: BACKEND_INTEGRATION_CONTRACT.kind,
      };
    },
    async readHome(options) {
      return await readHome(
        backend,
        stateCoordinator,
        teams.commands,
        options,
      );
    },
    readSettings() {
      return readSettings(backend, state);
    },
    async selectSession(request) {
      const sessionId = normalizeRequiredString(request.sessionId, "sessionId");
      const session = await backend.commands.readSession({ sessionId });
      if (session.kind === "wanex-app.session.missing") {
        throw new Error(`session does not exist: ${sessionId}`);
      }
      if (session.session.status !== "active") {
        throw new Error(`session is archived: ${sessionId}`);
      }
      return await stateCoordinator.mutate(async (current) => {
        const next = copyState(current);
        next.selection = { kind: "session", sessionId };
        delete next.selectedPlanProposalId;
        return {
          value: stateSnapshot(next),
          next,
        };
      });
    },
    async renameSession(request: RenameSessionRequest) {
      return await backend.commands.renameSession(request);
    },
    async archiveSession(request: ArchiveSessionRequest) {
      const session = await backend.commands.archiveSession(request);
      if (selectedSessionId(stateCoordinator.state) === request.sessionId) {
        await stateCoordinator.mutate(async (current) => {
          const next = copyState(current);
          delete next.selection;
          delete next.selectedPlanProposalId;
          next.mode = "chat";
          return { value: undefined, next };
        });
      }
      return session;
    },
    async restoreSession(request: RestoreSessionRequest) {
      return await backend.commands.restoreSession(request);
    },
    async startNewConversation() {
      return await stateCoordinator.mutate(async (current) => {
        const next = copyState(current);
        delete next.selection;
        delete next.selectedPlanProposalId;
        next.mode = "chat";
        return {
          value: stateSnapshot(next),
          next,
        };
      });
    },
    async setLayout(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = {
          ...copyState(current),
          layout: request.layout,
        };
        return { value: stateSnapshot(next), next };
      });
    },
    async setMode(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = { ...copyState(current), mode: request.mode };
        return { value: stateSnapshot(next), next };
      });
    },
    async updatePreferences(request) {
      return await stateCoordinator.mutate(async (current) => {
        const next = {
          ...copyState(current),
          preferences: {
            ...current.preferences,
            ...request.preferences,
          },
        };
        return { value: stateSnapshot(next), next };
      });
    },
    modelEndpoints: {
      readActiveModelEndpoint: backend.commands.readActiveModelEndpoint,
      setActiveModelEndpoint: backend.commands.setActiveModelEndpoint,
      upsertModelEndpoint: backend.commands.upsertModelEndpoint,
      replaceConnectedModelEndpoints:
        backend.commands.replaceConnectedModelEndpoints,
      removeModelEndpointConnection:
        backend.commands.removeModelEndpointConnection,
      upsertSiblingModelEndpoint: backend.commands.upsertSiblingModelEndpoint,
      readModelEndpoint: backend.commands.readModelEndpoint,
      listModelEndpoints: backend.commands.listModelEndpoints,
    },
    modelCapabilities: {
      listModelCapabilityRoutes: backend.commands.listModelCapabilityRoutes,
      setModelCapabilityRoute: backend.commands.setModelCapabilityRoute,
      clearModelCapabilityRoute: backend.commands.clearModelCapabilityRoute,
      readModelCapabilityReadiness:
        backend.commands.readModelCapabilityReadiness,
    },
    readProductCommands() {
      return backend.commands.readProductCommands();
    },
    async dispatchProductCommand(request) {
      return await dispatchCommandWithPolicy({
        backend,
        command: request,
      });
    },
    async dispatchProductCommandJson(body) {
      return await dispatchCommandJsonWithPolicy({
        backend,
        body,
      });
    },
    async previewProductCommandInvocation(request) {
      return await previewCommandInvocationWithPolicy({
        backend,
        request,
      });
    },
    async executeProductCommand(request) {
      return await executeCommandWithPolicy({
        backend,
        command: request,
      });
    },
    async readExecutionReference(request) {
      return await backend.commands.readExecutionReference(request);
    },
    async openWorkbench(request) {
      return await openWorkbench(backend, stateCoordinator, request);
    },
    async readSessionTranscript(request) {
      return await readSessionTranscript(backend, state, request);
    },
    async prepareConversationAttachment(request) {
      return await prepareConversationAttachment({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    readConversationAttachments(request = {}) {
      return readConversationAttachments({
        state,
        input: request,
      });
    },
    async removeConversationAttachment(request) {
      return await removeConversationAttachment({
        state: stateCoordinator,
        input: request,
      });
    },
    async submitConversationOperation(request) {
      return await submitConversationOperation({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async queueGuidedFollowUp(request: QueueGuidedFollowUpRequest) {
      return await queueGuidedFollowUp({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async steerTrackedConversationOperation(
      request: SteerTrackedConversationOperationRequest,
    ) {
      return await steerTrackedConversationOperation({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async startSideQuery(request: StartSideQueryRequest) {
      return await sideQueries.start(request);
    },
    readSideQuery(request) {
      return sideQueries.read(request);
    },
    async cancelSideQuery(request) {
      return await sideQueries.cancel(request);
    },
    async dismissSideQuery(request) {
      return await sideQueries.dismiss(request);
    },
    ...plans.commands,
    async readGoal(request) {
      return await goals.read(request);
    },
    async startGoal(request) {
      return await goals.start(request);
    },
    async pauseGoal(request) {
      return await goals.pause(request);
    },
    async resumeGoal(request) {
      return await goals.resume(request);
    },
    async cancelGoal(request) {
      return await goals.cancel(request);
    },
    async readTrackedConversationOperation(request = {}) {
      return await readTrackedConversationOperation({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async cancelTrackedConversationOperation(request) {
      return await cancelTrackedConversationOperation({
        backend,
        state,
        input: request,
      });
    },
    async regenerateTrackedConversationOperation(request = {}) {
      return await regenerateTrackedConversationOperation({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async continueCapabilityRequest(
      request: ContinueCapabilityRequestRequest,
    ) {
      return await continueCapabilityRequest({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async resolveTrackedConversationRecovery(
      request: ResolveTrackedConversationRecoveryRequest,
    ) {
      return await resolveTrackedConversationRecovery({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async resolveTrackedConversationApproval(request) {
      return await resolveTrackedConversationApproval({
        backend,
        state: stateCoordinator,
        input: request,
      });
    },
    async dispose() {
      commandCatalogEvents.dispose();
      commandExecutionEvents.dispose();
      await conversationEvents.dispose();
      await sideQueries.dispose();
      await plans.dispose();
      await goals.dispose();
      teams.dispose();
      pluginManagement.dispose();
      await backend.dispose();
    },
  };
}

async function readHome(
  backend: BackendShell,
  state: StateCoordinator,
  teams: TeamConversationCommands,
  options?: HomeOptions,
): Promise<HomeReadModel> {
  await reconcileConversationSelection({ backend, state, teams });
  const [product, modelEndpoints] = await Promise.all([
    backend.commands.readProductOverview(options?.overview),
    backend.commands.listModelEndpoints(),
  ]);
  return {
    kind: "product.home",
    state: stateSnapshot(state.state),
    product,
    providerReadiness: projectProviderReadiness(modelEndpoints),
    integration: BACKEND_INTEGRATION_CONTRACT,
    rendererBoundary: BACKEND_INTEGRATION_CONTRACT.rendererBoundary,
    commandPort: {
      adapter: "app-owned-command-port",
      commandCount: Object.keys(BACKEND_COMMAND_PORT_COMMANDS)
        .length,
    },
  };
}

function readSettings(
  backend: BackendShell,
  state: MutableState,
): SettingsReadModel {
  const product = backend.status();
  const rendererBoundary =
    BACKEND_INTEGRATION_CONTRACT.rendererBoundary;
  return {
    kind: "product.settings",
    state: stateSnapshot(state),
    profile: {
      ...(product.activeModelEndpointId === undefined
        ? {}
        : { activeModelEndpointId: product.activeModelEndpointId }),
      agentContextConfigured: product.agentContext.configured,
      agentContextRevision: product.agentContext.revision,
    },
    renderer: {
      layout: state.layout,
      mode: state.mode,
      preferences: { ...state.preferences },
      availableLayouts,
      availableModes,
      availableThemes,
      availableDensities,
    },
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
    },
    integration: {
      rendererCalls: rendererBoundary.rendererCalls,
      rendererMayOpenStorage: false,
      rendererMayReceiveStorePath: false,
      rendererMayReceiveServiceBinaryPath: false,
    },
  };
}

async function openWorkbench(
  backend: BackendShell,
  state: StateCoordinator,
  request?: OpenWorkbenchRequest,
): Promise<OpenWorkbenchResult> {
  const sessionId = resolveSessionId(state.state, request?.sessionId);
  if (sessionId === undefined) {
    return noSession();
  }
  await state.mutate(async (current) => {
    const next = copyState(current);
    next.selection = { kind: "session", sessionId };
    return { value: undefined, next };
  });
  const envelope = await backend.dispatch({
    command: BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
    input: { sessionId },
  });
  if (!envelope.ok) {
    return failedWorkbench(sessionId, envelope);
  }
  return {
    kind: "product.workbench.opened",
    sessionId,
    workbench: envelope.value as OpenWorkbenchResult extends {
      readonly workbench: infer T;
    }
      ? T
      : never,
  };
}

async function readSessionTranscript(
  backend: BackendShell,
  state: MutableState,
  request?: ReadSessionTranscriptRequest,
): Promise<SessionTranscriptReadResult> {
  const sessionId = resolveSessionId(state, request?.sessionId);
  if (sessionId === undefined) {
    return {
      kind: "product.session-transcript.no-session",
      message: "select a session before reading its transcript",
    };
  }
  return {
    kind: "product.session-transcript.found",
    sessionId,
    transcript: projectConversationHistory(
      await backend.commands.readSessionTranscript({
        sessionId,
        ...(request?.cursor === undefined
          ? {}
          : {
              beforeSequence: parseConversationHistoryCursor(
                sessionId,
                request.cursor,
              ),
            }),
        ...(request?.limit === undefined ? {} : { limit: request.limit }),
      }),
    ),
  };
}

function projectConversationHistory(
  transcript: BackendSessionTranscriptReadModel,
): ConversationHistoryReadModel {
  const rows = transcript.rows.filter(
    (row) => !(row.role === "user" && row.regeneratesTurnId !== undefined),
  );
  const timelineParts = projectConversationTimelineParts(
    transcript.sessionId,
    rows,
  );
  const projectedRows = rows.flatMap((row, rowIndex) => {
    const parts = timelineParts[rowIndex] ?? [];
    const capabilityRequests = projectCapabilityRequests(row.parts);
    if (parts.length === 0 && capabilityRequests.length === 0) return [];
    return [{
      id: conversationHistoryRowId(transcript.sessionId, row.id),
      kind: row.kind,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      parts,
      capabilityRequests,
    }];
  });
  return {
    sessionId: transcript.sessionId,
    page: {
      limit: transcript.page.limit,
      hasMore: transcript.page.hasMore,
      ...(transcript.page.nextBeforeSequence === undefined
        ? {}
        : {
            nextCursor: conversationHistoryCursor(
              transcript.sessionId,
              transcript.page.nextBeforeSequence,
            ),
          }),
      liveRowsTruncated: transcript.page.liveInputsTruncated,
    },
    rows: projectedRows,
  };
}

function failedWorkbench(
  sessionId: string,
  envelope: BackendCommandPortEnvelope,
): WorkbenchFailedResult {
  if (envelope.ok) {
    throw new Error("expected failed workbench envelope");
  }
  return {
    kind: "product.workbench.failed",
    sessionId,
    error: envelope.error,
  };
}

function noSession(): OpenWorkbenchResult {
  return {
    kind: "product.workbench.no-session",
    message: "select a session before opening the workbench",
  };
}

function normalizeRequiredString(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  return value;
}
