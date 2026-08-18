import type {
  BackendAppOptions,
  BackendCommandPortJsonResult,
  BackendCommandPortRequest,
  BackendCommandInvocationPreview,
  BackendCommandInvocationRunnablePreview,
  BackendCommandInputValidationDetails,
  BackendExecuteCommandResult,
  BackendExecutionReferenceReadResult,
  BackendReadExecutionReferenceRequest,
  BackendCommandRegistryReadModel,
  BackendIntegrationContract,
  BackendOverviewOptions,
  BackendOverviewReadModel,
  BackendModelEndpointCommands,
  BackendModelEndpointReadModel,
  BackendModelCapabilityCommands,
  BackendRecentSessionRow,
  BackendSessionLifecycleCommands,
  BackendPreviewCommandInvocationRequest,
  BackendSafeError,
  BackendStatus,
  BackendWorkbenchReadModel,
} from "@wanex/product/backend";
import type {
  CancelTrackedConversationOperationRequest,
  CancelTrackedConversationOperationResult,
  ConversationEvents,
  ReadTrackedConversationOperationRequest,
  ReadTrackedConversationOperationResult,
  QueueGuidedFollowUpRequest,
  QueueGuidedFollowUpResult,
  ConversationHistoryReadModel,
  ContinueCapabilityRequestRequest,
  ContinueCapabilityRequestResult,
  RegenerateTrackedConversationOperationRequest,
  RegenerateTrackedConversationOperationResult,
  ResolveTrackedConversationApprovalRequest,
  ResolveTrackedConversationApprovalResult,
  ResolveTrackedConversationRecoveryRequest,
  ResolveTrackedConversationRecoveryResult,
  SubmitConversationOperationRequest,
  SubmitConversationOperationResult,
  SteerTrackedConversationOperationRequest,
  SteerTrackedConversationOperationResult,
  TrustedConversationOperationReference,
} from "./conversation/model.js";
import type {
  ConversationAttachmentsReadModel,
  PrepareConversationAttachmentRequest,
  PrepareConversationAttachmentResult,
  ReadConversationAttachmentsRequest,
  RemoveConversationAttachmentRequest,
  RemoveConversationAttachmentResult,
} from "./attachments/model.js";
import type {
  CancelSideQueryRequest,
  DismissSideQueryRequest,
  DismissSideQueryResult,
  ReadSideQueryRequest,
  ReadSideQueryResult,
  SideQueryReadModel,
  SideQueryEvents,
  StartSideQueryRequest,
} from "./side-query/model.js";
import type {
  DecidePlanProposalRequest,
  DismissPlanGenerationResult,
  ExecutePlanProposalRequest,
  ExecutePlanProposalResult,
  ListPlanProposalsRequest,
  PlanEvents,
  PlanGenerationReadModel,
  PlanGenerationReference,
  PlanProposalListReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalRequest,
  ReadPlanProposalResult,
  RevisePlanProposalRequest,
  SelectPlanProposalRequest,
  StartPlanGenerationRequest,
} from "./plan/model.js";
import type {
  CancelGoalRequest,
  ChangeGoalStateRequest,
  GoalEvents,
  GoalReadModel,
  ReadGoalRequest,
  ReadGoalResult,
  StartGoalRequest,
} from "./goal/model.js";
import type { TeamEvents } from "./team/model.js";
import type {
  TeamConversationCommands,
  TeamConversationPort,
} from "./team/port.js";
import type {
  PluginManagementPort,
  ProductPluginManagementCommands,
  ProductPluginManagementEvents,
} from "./plugin-management/model.js";

export type * from "./conversation/model.js";
export type * from "./attachments/model.js";
export type * from "./side-query/model.js";
export type * from "./plan/model.js";
export type * from "./goal/model.js";
export type * from "./team/model.js";
export type * from "./team/port.js";
export type * from "./plugin-management/model.js";

export interface SafeError extends Omit<
  BackendSafeError,
  "code"
> {
  readonly code: SafeErrorCode;
}

export type SafeErrorCode =
  | BackendSafeError["code"]
  | "provider_not_ready";

export type CommandPortEnvelope<T = unknown> =
  | CommandPortSuccessEnvelope<T>
  | CommandPortErrorEnvelope;

export interface CommandPortSuccessEnvelope<T> {
  readonly ok: true;
  readonly command: string;
  readonly value: T;
}

export interface CommandPortErrorEnvelope {
  readonly ok: false;
  readonly command: string;
  readonly error: SafeError;
}

export type CommandPortJsonStatus =
  BackendCommandPortJsonResult["status"];

export interface CommandPortJsonResult {
  readonly status: CommandPortJsonStatus;
  readonly body: string;
  readonly envelope: CommandPortEnvelope;
}

export interface ShellOptions extends BackendAppOptions {
  readonly state?: InitialState;
  readonly stateStore?: StateStore;
  readonly teamConversations?: TeamConversationPort;
  readonly pluginManagement?: PluginManagementPort;
  readonly productCommands?: NonNullable<BackendAppOptions["productCommands"]> & {
    readonly executionInvalidations?: import("./commands/model.js").CommandExecutionInvalidationSource;
  };
}

export interface InitialState {
  readonly selection?: ConversationSelection;
  readonly selectedPlanProposalId?: string;
  readonly layout?: Layout;
  readonly mode?: Mode;
  readonly preferences?: Partial<RendererPreferences>;
}

export type ConversationSelection =
  | SessionConversationSelection
  | TeamConversationSelection;

export interface SessionConversationSelection {
  readonly kind: "session";
  readonly sessionId: string;
}

export interface TeamConversationSelection {
  readonly kind: "team";
  readonly conversationId: string;
}

export type Layout = "single" | "split" | "diagnostics";
export type Mode = "chat" | "workbench" | "diagnostics";
export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";

export interface RendererPreferences {
  readonly theme: ThemePreference;
  readonly density: DensityPreference;
}

export interface StateSnapshot {
  readonly selection?: ConversationSelection;
  readonly selectedPlanProposalId?: string;
  readonly layout: Layout;
  readonly mode: Mode;
  readonly preferences: RendererPreferences;
}

export interface StateStore {
  load(): Promise<StateStoreLoadResult>;
  save(state: TrustedStateSnapshot): Promise<void>;
}

export type StateStoreLoadResult =
  | {
      readonly found: true;
      readonly state: TrustedStateSnapshot;
    }
  | {
      readonly found: false;
    };

export interface TrustedStateSnapshot {
  readonly ui: StateSnapshot;
  readonly trackedConversationOperations: Readonly<
    Record<string, TrustedConversationOperationReference>
  >;
  readonly pendingGuidedFollowUps: Readonly<
    Record<string, TrustedConversationOperationReference>
  >;
  readonly conversationAttachmentDrafts: Readonly<
    Record<
      string,
      readonly import("./attachments/model.js").AttachmentDraft[]
    >
  >;
}

export interface ShellStatus {
  readonly kind: "product.status";
  readonly disposed: boolean;
  readonly state: StateSnapshot;
  readonly product: BackendStatus;
  readonly integrationContractKind: BackendIntegrationContract["kind"];
}

export interface HomeOptions {
  readonly overview?: BackendOverviewOptions;
}

export interface HomeReadModel {
  readonly kind: "product.home";
  readonly state: StateSnapshot;
  readonly product: BackendOverviewReadModel;
  readonly providerReadiness: ProviderReadinessReadModel;
  readonly integration: BackendIntegrationContract;
  readonly rendererBoundary: BackendIntegrationContract["rendererBoundary"];
  readonly commandPort: CommandPortSummary;
}

export type ProviderReadinessStatus =
  | "ready"
  | "missing_active_endpoint"
  | "missing_required_credential";

export type ProviderReadinessReason =
  | "active_endpoint_ready"
  | "active_endpoint_missing"
  | "active_endpoint_missing_credential";

export interface ProviderReadinessReadModel {
  readonly status: ProviderReadinessStatus;
  readonly reason: ProviderReadinessReason;
  readonly activeEndpointId?: string;
  readonly endpointCount: number;
  readonly canRun: boolean;
  readonly attentionRequired: boolean;
  readonly requiresCredential: boolean;
  readonly credentialConfigured: boolean;
  readonly activeEndpoint?: ModelEndpointReadModel;
}

export interface SettingsReadModel {
  readonly kind: "product.settings";
  readonly state: StateSnapshot;
  readonly profile: ProfileSummary;
  readonly renderer: RendererSettings;
  readonly privacy: SettingsPrivacy;
  readonly integration: SettingsIntegrationSummary;
}

export interface ProfileSummary {
  readonly activeModelEndpointId?: string;
  readonly agentContextConfigured: boolean;
  readonly agentContextRevision: number;
}

export interface RendererSettings {
  readonly layout: Layout;
  readonly mode: Mode;
  readonly preferences: RendererPreferences;
  readonly availableLayouts: readonly Layout[];
  readonly availableModes: readonly Mode[];
  readonly availableThemes: readonly ThemePreference[];
  readonly availableDensities: readonly DensityPreference[];
}

export interface SettingsPrivacy {
  readonly exposesStorePath: false;
  readonly exposesServiceBinaryPath: false;
  readonly exposesSecrets: false;
}

export interface SettingsIntegrationSummary {
  readonly rendererCalls: BackendIntegrationContract["rendererBoundary"]["rendererCalls"];
  readonly rendererMayOpenStorage: false;
  readonly rendererMayReceiveStorePath: false;
  readonly rendererMayReceiveServiceBinaryPath: false;
}

export interface CommandPortSummary {
  readonly adapter: "app-owned-command-port";
  readonly commandCount: number;
}

export interface Shell {
  readonly commandCatalogEvents: import("./commands/model.js").CommandCatalogEvents;
  readonly commandExecutionEvents: import("./commands/model.js").CommandExecutionEvents;
  readonly events: ConversationEvents;
  readonly sideQueryEvents: SideQueryEvents;
  readonly planEvents: PlanEvents;
  readonly goalEvents: GoalEvents;
  readonly teamEvents: TeamEvents;
  readonly teamConversations: TeamConversationCommands;
  readonly pluginManagementEvents: ProductPluginManagementEvents;
  readonly pluginManagement: ProductPluginManagementCommands;
  readonly trustedResources: import("@wanex/product/backend").BackendResourceCommands;
  readonly trustedExecution: import("@wanex/app").WanexAppTrustedExecutionHost;
  status(): ShellStatus;
  readHome(options?: HomeOptions): Promise<HomeReadModel>;
  readSettings(): SettingsReadModel;
  selectSession(
    request: SelectSessionRequest,
  ): Promise<StateSnapshot>;
  renameSession(
    request: RenameSessionRequest,
  ): Promise<SessionRow>;
  archiveSession(
    request: ArchiveSessionRequest,
  ): Promise<SessionRow>;
  restoreSession(
    request: RestoreSessionRequest,
  ): Promise<SessionRow>;
  /**
   * Return the Product to an unselected chat composer. Session creation stays
   * owned by first-message admission rather than this UI-state transition.
   */
  startNewConversation(): Promise<StateSnapshot>;
  setLayout(
    request: SetLayoutRequest,
  ): Promise<StateSnapshot>;
  setMode(request: SetModeRequest): Promise<StateSnapshot>;
  updatePreferences(
    request: UpdatePreferencesRequest,
  ): Promise<StateSnapshot>;
  readonly modelEndpoints: ModelEndpointCommands;
  readonly modelCapabilities: ModelCapabilityCommands;
  readProductCommands(): CommandCatalogReadModel;
  dispatchProductCommand(
    request: BackendCommandPortRequest,
  ): Promise<CommandPortEnvelope>;
  dispatchProductCommandJson(
    body: unknown,
  ): Promise<CommandPortJsonResult>;
  previewProductCommandInvocation(
    request: PreviewCommandInvocationRequest,
  ): Promise<CommandInvocationPreview>;
  executeProductCommand(
    request: ExecuteCommandRequest,
  ): Promise<ExecuteCommandResult>;
  readExecutionReference(
    request: ReadExecutionReferenceRequest,
  ): Promise<ExecutionReferenceReadResult>;
  openWorkbench(
    request?: OpenWorkbenchRequest,
  ): Promise<OpenWorkbenchResult>;
  readSessionTranscript(
    request?: ReadSessionTranscriptRequest,
  ): Promise<SessionTranscriptReadResult>;
  prepareConversationAttachment(
    request: PrepareConversationAttachmentRequest,
  ): Promise<PrepareConversationAttachmentResult>;
  readConversationAttachments(
    request?: ReadConversationAttachmentsRequest,
  ): ConversationAttachmentsReadModel;
  removeConversationAttachment(
    request: RemoveConversationAttachmentRequest,
  ): Promise<RemoveConversationAttachmentResult>;
  submitConversationOperation(
    request: SubmitConversationOperationRequest,
  ): Promise<SubmitConversationOperationResult>;
  queueGuidedFollowUp(
    request: QueueGuidedFollowUpRequest,
  ): Promise<QueueGuidedFollowUpResult>;
  steerTrackedConversationOperation(
    request: SteerTrackedConversationOperationRequest,
  ): Promise<SteerTrackedConversationOperationResult>;
  startSideQuery(
    request: StartSideQueryRequest,
  ): Promise<SideQueryReadModel>;
  readSideQuery(
    request: ReadSideQueryRequest,
  ): ReadSideQueryResult;
  cancelSideQuery(
    request: CancelSideQueryRequest,
  ): Promise<SideQueryReadModel>;
  dismissSideQuery(
    request: DismissSideQueryRequest,
  ): Promise<DismissSideQueryResult>;
  startPlanGeneration(
    request: StartPlanGenerationRequest,
  ): Promise<PlanGenerationReadModel>;
  readPlanGeneration(
    request: PlanGenerationReference,
  ): ReadPlanGenerationResult;
  cancelPlanGeneration(
    request: PlanGenerationReference,
  ): Promise<PlanGenerationReadModel>;
  dismissPlanGeneration(
    request: PlanGenerationReference,
  ): Promise<DismissPlanGenerationResult>;
  selectPlanProposal(
    request: SelectPlanProposalRequest,
  ): Promise<StateSnapshot>;
  clearPlanProposalSelection(): Promise<StateSnapshot>;
  readPlanProposal(
    request?: ReadPlanProposalRequest,
  ): Promise<ReadPlanProposalResult>;
  listPlanProposals(
    request?: ListPlanProposalsRequest,
  ): Promise<PlanProposalListReadModel>;
  revisePlanProposal(
    request: RevisePlanProposalRequest,
  ): Promise<ReadPlanProposalResult>;
  decidePlanProposal(
    request: DecidePlanProposalRequest,
  ): Promise<ReadPlanProposalResult>;
  executePlanProposal(
    request: ExecutePlanProposalRequest,
  ): Promise<ExecutePlanProposalResult>;
  readGoal(
    request?: ReadGoalRequest,
  ): Promise<ReadGoalResult>;
  startGoal(
    request: StartGoalRequest,
  ): Promise<GoalReadModel>;
  pauseGoal(
    request: ChangeGoalStateRequest,
  ): Promise<GoalReadModel>;
  resumeGoal(
    request: ChangeGoalStateRequest,
  ): Promise<GoalReadModel>;
  cancelGoal(
    request: CancelGoalRequest,
  ): Promise<GoalReadModel>;
  readTrackedConversationOperation(
    request?: ReadTrackedConversationOperationRequest,
  ): Promise<ReadTrackedConversationOperationResult>;
  cancelTrackedConversationOperation(
    request: CancelTrackedConversationOperationRequest,
  ): Promise<CancelTrackedConversationOperationResult>;
  regenerateTrackedConversationOperation(
    request?: RegenerateTrackedConversationOperationRequest,
  ): Promise<RegenerateTrackedConversationOperationResult>;
  continueCapabilityRequest(
    request: ContinueCapabilityRequestRequest,
  ): Promise<ContinueCapabilityRequestResult>;
  resolveTrackedConversationRecovery(
    request: ResolveTrackedConversationRecoveryRequest,
  ): Promise<ResolveTrackedConversationRecoveryResult>;
  resolveTrackedConversationApproval(
    request: ResolveTrackedConversationApprovalRequest,
  ): Promise<ResolveTrackedConversationApprovalResult>;
  dispose(): Promise<void>;
}

export type ModelEndpointCommands =
  BackendModelEndpointCommands;
export type ModelCapabilityCommands =
  BackendModelCapabilityCommands;
export interface ModelEndpointReadModel {
  readonly id: string;
  readonly connection: BackendModelEndpointReadModel["connection"];
  readonly protocol: BackendModelEndpointReadModel["protocol"];
  readonly model: BackendModelEndpointReadModel["model"];
  readonly credentialConfigured: boolean;
  readonly active: boolean;
}
export interface ModelEndpointListReadModel {
  readonly activeEndpointId?: string;
  readonly endpoints: readonly ModelEndpointReadModel[];
}
export type CommandCatalogReadModel =
  BackendCommandRegistryReadModel;

export interface SelectSessionRequest {
  readonly sessionId: string;
}

export type SessionRow = BackendRecentSessionRow;
export type RenameSessionRequest = Parameters<
  BackendSessionLifecycleCommands["renameSession"]
>[0];
export type ArchiveSessionRequest = Parameters<
  BackendSessionLifecycleCommands["archiveSession"]
>[0];
export type RestoreSessionRequest = Parameters<
  BackendSessionLifecycleCommands["restoreSession"]
>[0];

export interface SetLayoutRequest {
  readonly layout: Layout;
}

export interface SetModeRequest {
  readonly mode: Mode;
}

export interface UpdatePreferencesRequest {
  readonly preferences: Partial<RendererPreferences>;
}

export type PreviewCommandInvocationRequest =
  BackendPreviewCommandInvocationRequest;

export type ExecuteCommandRequest =
  BackendPreviewCommandInvocationRequest;

export type ReadExecutionReferenceRequest =
  BackendReadExecutionReferenceRequest;
export type ExecutionReferenceReadResult =
  BackendExecutionReferenceReadResult;

export type ExecuteCommandResult =
  | ExecuteCommandCompletedResult
  | ExecuteCommandSubmittedResult
  | ExecuteCommandRejectedResult;

export interface ExecuteCommandCompletedResult {
  readonly kind: "completed";
  readonly commandId: string;
  readonly handlerRef: string;
  readonly summary: CommandExecutionSummary & {
    readonly message: "Command completed";
  };
}

export interface ExecuteCommandSubmittedResult {
  readonly kind: "submitted";
  readonly commandId: string;
  readonly handlerRef: string;
  readonly summary: CommandExecutionSummary & {
    readonly message: "Command submitted";
  };
}

export interface CommandExecutionSummary {
  readonly valueKind: string;
  readonly message: "Command completed" | "Command submitted";
  readonly references: readonly CommandExecutionReference[];
}

export interface CommandExecutionReference {
  readonly kind:
    | "session"
    | "job"
    | "turn"
    | "attempt"
    | "resource"
    | "proposal"
    | "task"
    | "input"
    | "message";
  readonly id: string;
}

export interface ExecuteCommandRejectedResult {
  readonly kind: "rejected";
  readonly commandId: string;
  readonly reason:
    | Extract<
        BackendExecuteCommandResult,
        { readonly kind: "rejected" }
      >["reason"]
    | "provider_not_ready";
  readonly message: string;
  readonly handlerRef?: string;
  readonly providerReadiness?: ProviderReadinessReadModel;
  readonly inputValidation?: BackendCommandInputValidationDetails;
}

export type CommandInvocationPreview =
  | BackendCommandInvocationPreview
  | ProviderBlockedCommandInvocationPreview;

export interface ProviderBlockedCommandInvocationPreview {
  readonly kind: "rejected";
  readonly commandId: string;
  readonly reason: "provider_not_ready";
  readonly message: string;
  readonly handlerRef: string;
  readonly command: BackendCommandInvocationRunnablePreview["command"];
  readonly providerReadiness: ProviderReadinessReadModel;
}

export interface OpenWorkbenchRequest {
  readonly sessionId?: string;
}

export interface ReadSessionTranscriptRequest {
  readonly sessionId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export type SessionTranscriptReadResult =
  | SessionTranscriptFoundResult
  | SessionTranscriptNoSessionResult;

export interface SessionTranscriptFoundResult {
  readonly kind: "product.session-transcript.found";
  readonly sessionId: string;
  readonly transcript: ConversationHistoryReadModel;
}

export interface SessionTranscriptNoSessionResult {
  readonly kind: "product.session-transcript.no-session";
  readonly message: string;
}

export type OpenWorkbenchResult =
  | WorkbenchOpenedResult
  | WorkbenchNoSessionResult
  | WorkbenchFailedResult;

export interface WorkbenchOpenedResult {
  readonly kind: "product.workbench.opened";
  readonly sessionId: string;
  readonly workbench: BackendWorkbenchReadModel;
}

export interface WorkbenchNoSessionResult {
  readonly kind: "product.workbench.no-session";
  readonly message: string;
}

export interface WorkbenchFailedResult {
  readonly kind: "product.workbench.failed";
  readonly sessionId?: string;
  readonly error: SafeError;
}
