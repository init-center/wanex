import type {
  AdmissionReceipt,
  AdmitSessionInputRequest,
  AppendSessionMessageRequest,
  ApplySessionRunControlReceipt,
  ApplySessionRunControlRequest,
  CreateSessionRequest,
  InterruptSessionRunReceipt,
  InterruptSessionRunRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  ListSessionRunControlsRequest,
  ListSessionsRequest,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord,
  SessionRunControlRecord,
  SteerSessionRunReceipt,
  SteerSessionRunRequest,
  SubmitSessionRunReceipt,
  SubmitSessionRunRequest
} from "@wanex/protocol"

export interface SessionStore {
  createSession(request: CreateSessionRequest): Promise<SessionRecord>
  getSession(id: string): Promise<SessionRecord | null>
  listSessions(request: ListSessionsRequest): Promise<SessionRecord[]>
  admitSessionInput(request: AdmitSessionInputRequest): Promise<AdmissionReceipt>
  submitSessionRun(
    request: SubmitSessionRunRequest
  ): Promise<SubmitSessionRunReceipt>
  interruptSessionRun(
    request: InterruptSessionRunRequest
  ): Promise<InterruptSessionRunReceipt>
  steerSessionRun(
    request: SteerSessionRunRequest
  ): Promise<SteerSessionRunReceipt>
  listSessionRunControls(
    request: ListSessionRunControlsRequest
  ): Promise<SessionRunControlRecord[]>
  applySessionRunControl(
    request: ApplySessionRunControlRequest
  ): Promise<ApplySessionRunControlReceipt | null>
  listSessionInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]>
  listSessionMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]>
  appendSessionMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null>
}
