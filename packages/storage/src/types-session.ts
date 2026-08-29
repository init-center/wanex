import type {
  AdmissionReceipt,
  AdmitSessionInputRequest,
  ArchiveSessionRequest,
  AppendSessionMessageRequest,
  ApplySessionTurnControlReceipt,
  ApplySessionTurnControlRequest,
  BeginProviderInvocationRequest,
  CreateSessionRequest,
  InterruptSessionTurnReceipt,
  InterruptSessionTurnRequest,
  FinishProviderInvocationReceipt,
  FinishProviderInvocationRequest,
  ListSessionAttemptsRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  ListSessionTurnControlsRequest,
  ListSessionTurnsRequest,
  ListSessionsRequest,
  ListProviderInvocationsRequest,
  MarkProviderInvocationOutputRequest,
  ProviderInvocationRecord,
  RequestSessionTurnCancelReceipt,
  RequestSessionTurnCancelRequest,
  RenameSessionRequest,
  RestoreSessionRequest,
  SessionAttemptRecord,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord,
  SessionTurnControlRecord,
  SessionTurnRecord,
  SettleSessionTurnReceipt,
  SettleSessionTurnRequest,
  StartSessionTurnAttemptReceipt,
  StartSessionTurnAttemptRequest,
  SteerSessionTurnReceipt,
  SteerSessionTurnRequest,
  SubmitSessionTurnReceipt,
  SubmitSessionTurnRequest
} from "@wanex/protocol"

export interface SessionStore {
  createSession(request: CreateSessionRequest): Promise<SessionRecord>
  getSession(id: string): Promise<SessionRecord | null>
  listSessions(request: ListSessionsRequest): Promise<SessionRecord[]>
  renameSession(request: RenameSessionRequest): Promise<SessionRecord>
  archiveSession(request: ArchiveSessionRequest): Promise<SessionRecord>
  restoreSession(request: RestoreSessionRequest): Promise<SessionRecord>
  admitSessionInput(request: AdmitSessionInputRequest): Promise<AdmissionReceipt>
  submitSessionTurn(
    request: SubmitSessionTurnRequest
  ): Promise<SubmitSessionTurnReceipt>
  startSessionTurnAttempt(
    request: StartSessionTurnAttemptRequest
  ): Promise<StartSessionTurnAttemptReceipt>
  settleSessionTurn(
    request: SettleSessionTurnRequest
  ): Promise<SettleSessionTurnReceipt>
  requestSessionTurnCancel(
    request: RequestSessionTurnCancelRequest
  ): Promise<RequestSessionTurnCancelReceipt>
  interruptSessionTurn(
    request: InterruptSessionTurnRequest
  ): Promise<InterruptSessionTurnReceipt>
  steerSessionTurn(
    request: SteerSessionTurnRequest
  ): Promise<SteerSessionTurnReceipt>
  listSessionTurnControls(
    request: ListSessionTurnControlsRequest
  ): Promise<SessionTurnControlRecord[]>
  applySessionTurnControl(
    request: ApplySessionTurnControlRequest
  ): Promise<ApplySessionTurnControlReceipt | null>
  listSessionInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]>
  listSessionMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]>
  listSessionTurns(
    request: ListSessionTurnsRequest
  ): Promise<SessionTurnRecord[]>
  getSessionTurn(turnId: string): Promise<SessionTurnRecord | null>
  listSessionAttempts(
    request: ListSessionAttemptsRequest
  ): Promise<SessionAttemptRecord[]>
  appendSessionMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null>
  beginProviderInvocation(
    request: BeginProviderInvocationRequest
  ): Promise<ProviderInvocationRecord>
  markProviderInvocationOutput(
    request: MarkProviderInvocationOutputRequest
  ): Promise<ProviderInvocationRecord | null>
  finishProviderInvocation(
    request: FinishProviderInvocationRequest
  ): Promise<FinishProviderInvocationReceipt | null>
  listProviderInvocations(
    request: ListProviderInvocationsRequest
  ): Promise<ProviderInvocationRecord[]>
}
