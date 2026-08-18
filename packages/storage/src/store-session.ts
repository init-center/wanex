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
  ListProviderInvocationsRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  ListSessionTurnControlsRequest,
  ListSessionTurnsRequest,
  ListSessionsRequest,
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

import {
  assertArray,
  fromRpcAdmissionReceipt,
  fromRpcApplySessionTurnControlReceipt,
  fromRpcFinishProviderInvocationReceipt,
  fromRpcInterruptSessionTurnReceipt,
  fromRpcProviderInvocationRecord,
  fromRpcRequestSessionTurnCancelReceipt,
  fromRpcSessionAttemptRecord,
  fromRpcSessionInputRecord,
  fromRpcSessionMessageRecord,
  fromRpcSessionRecord,
  fromRpcSessionTurnControlRecord,
  fromRpcSessionTurnRecord,
  fromRpcSettleSessionTurnReceipt,
  fromRpcStartSessionTurnAttemptReceipt,
  fromRpcSteerSessionTurnReceipt,
  fromRpcSubmitSessionTurnReceipt,
  messagePartsToJson,
  sessionInputOriginToJson,
  toRpcApplySessionTurnControlRequest,
  toRpcArchiveSessionRequest,
  toRpcBeginProviderInvocationRequest,
  toRpcFinishProviderInvocationRequest,
  toRpcInterruptSessionTurnRequest,
  toRpcListProviderInvocationsRequest,
  toRpcListSessionsRequest,
  toRpcListSessionTurnControlsRequest,
  toRpcRequestSessionTurnCancelRequest,
  toRpcRenameSessionRequest,
  toRpcRestoreSessionRequest,
  toRpcMarkProviderInvocationOutputRequest,
  toRpcSettleSessionTurnRequest,
  toRpcStartSessionTurnAttemptRequest,
  toRpcSteerSessionTurnRequest,
  toRpcSubmitSessionTurnRequest
} from "./codec.js"
import { toRpcJsonValueFromUnknown } from "./codec-common.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { SessionsStorageRpcCommand } from "./generated/storage-rpc.js"

export class SessionStoreMethods extends RpcStoreFacetBase {
  async createSession(request: CreateSessionRequest): Promise<SessionRecord> {
    const value = await this.callSession({
      command: "create-session",
      id: request.id ?? null,
      title: request.title ?? null,
      kind: request.kind ?? null
    })
    return fromRpcSessionRecord(value)
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const value = await this.callSession({ command: "get-session", id })
    return value === null ? null : fromRpcSessionRecord(value)
  }

  async listSessions(request: ListSessionsRequest): Promise<SessionRecord[]> {
    const value = await this.callSession({
      command: "list-sessions",
      request: toRpcListSessionsRequest(request)
    })
    assertArray(value, "sessions")
    return value.map(fromRpcSessionRecord)
  }

  async renameSession(request: RenameSessionRequest): Promise<SessionRecord> {
    const value = await this.callSession({
      command: "rename-session",
      request: toRpcRenameSessionRequest(request)
    })
    return fromRpcSessionRecord(value)
  }

  async archiveSession(request: ArchiveSessionRequest): Promise<SessionRecord> {
    const value = await this.callSession({
      command: "archive-session",
      request: toRpcArchiveSessionRequest(request)
    })
    return fromRpcSessionRecord(value)
  }

  async restoreSession(request: RestoreSessionRequest): Promise<SessionRecord> {
    const value = await this.callSession({
      command: "restore-session",
      request: toRpcRestoreSessionRequest(request)
    })
    return fromRpcSessionRecord(value)
  }

  async admitSessionInput(
    request: AdmitSessionInputRequest
  ): Promise<AdmissionReceipt> {
    const value = await this.callSession({
      command: "admit-session-input",
      id: request.id ?? null,
      session_id: request.sessionId,
      principal_id: request.principalId,
      idempotency_key: request.idempotencyKey,
      input_type: request.inputType ?? "user",
      content: messagePartsToJson(request.content),
      origin: sessionInputOriginToJson(request.origin),
      intent: request.intent ?? null
    })
    return fromRpcAdmissionReceipt(value)
  }

  async submitSessionTurn(
    request: SubmitSessionTurnRequest
  ): Promise<SubmitSessionTurnReceipt> {
    const value = await this.callSession({
      command: "submit-session-turn",
      request: toRpcSubmitSessionTurnRequest(request)
    })
    return fromRpcSubmitSessionTurnReceipt(value)
  }

  async startSessionTurnAttempt(
    request: StartSessionTurnAttemptRequest
  ): Promise<StartSessionTurnAttemptReceipt> {
    const value = await this.callSession({
      command: "start-session-turn-attempt",
      request: toRpcStartSessionTurnAttemptRequest(request)
    })
    return fromRpcStartSessionTurnAttemptReceipt(value)
  }

  async settleSessionTurn(
    request: SettleSessionTurnRequest
  ): Promise<SettleSessionTurnReceipt> {
    const value = await this.callSession({
      command: "settle-session-turn",
      request: toRpcSettleSessionTurnRequest(request)
    })
    return fromRpcSettleSessionTurnReceipt(value)
  }

  async beginProviderInvocation(
    request: BeginProviderInvocationRequest
  ): Promise<ProviderInvocationRecord> {
    const value = await this.callSession({
      command: "begin-provider-invocation",
      request: toRpcBeginProviderInvocationRequest(request)
    })
    return fromRpcProviderInvocationRecord(value)
  }

  async markProviderInvocationOutput(
    request: MarkProviderInvocationOutputRequest
  ): Promise<ProviderInvocationRecord | null> {
    const value = await this.callSession({
      command: "mark-provider-invocation-output",
      request: toRpcMarkProviderInvocationOutputRequest(request)
    })
    return value === null ? null : fromRpcProviderInvocationRecord(value)
  }

  async finishProviderInvocation(
    request: FinishProviderInvocationRequest
  ): Promise<FinishProviderInvocationReceipt | null> {
    const value = await this.callSession({
      command: "finish-provider-invocation",
      request: toRpcFinishProviderInvocationRequest(request)
    })
    return value === null ? null : fromRpcFinishProviderInvocationReceipt(value)
  }

  async listProviderInvocations(
    request: ListProviderInvocationsRequest
  ): Promise<ProviderInvocationRecord[]> {
    const value = await this.callSession({
      command: "list-provider-invocations",
      request: toRpcListProviderInvocationsRequest(request)
    })
    assertArray(value, "provider invocations")
    return value.map(fromRpcProviderInvocationRecord)
  }

  async requestSessionTurnCancel(
    request: RequestSessionTurnCancelRequest
  ): Promise<RequestSessionTurnCancelReceipt> {
    const value = await this.callSession({
      command: "request-session-turn-cancel",
      request: toRpcRequestSessionTurnCancelRequest(request)
    })
    return fromRpcRequestSessionTurnCancelReceipt(value)
  }

  async interruptSessionTurn(
    request: InterruptSessionTurnRequest
  ): Promise<InterruptSessionTurnReceipt> {
    const value = await this.callSession({
      command: "interrupt-session-turn",
      request: toRpcInterruptSessionTurnRequest(request)
    })
    return fromRpcInterruptSessionTurnReceipt(value)
  }

  async steerSessionTurn(
    request: SteerSessionTurnRequest
  ): Promise<SteerSessionTurnReceipt> {
    const value = await this.callSession({
      command: "steer-session-turn",
      request: toRpcSteerSessionTurnRequest(request)
    })
    return fromRpcSteerSessionTurnReceipt(value)
  }

  async listSessionTurnControls(
    request: ListSessionTurnControlsRequest
  ): Promise<SessionTurnControlRecord[]> {
    const value = await this.callSession({
      command: "list-session-turn-controls",
      request: toRpcListSessionTurnControlsRequest(request)
    })
    assertArray(value, "session turn controls")
    return value.map(fromRpcSessionTurnControlRecord)
  }

  async applySessionTurnControl(
    request: ApplySessionTurnControlRequest
  ): Promise<ApplySessionTurnControlReceipt | null> {
    const value = await this.callSession({
      command: "apply-session-turn-control",
      request: toRpcApplySessionTurnControlRequest(request)
    })
    return value === null ? null : fromRpcApplySessionTurnControlReceipt(value)
  }

  async listSessionInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]> {
    const value = await this.callSession({
      command: "list-session-inputs",
      session_id: request.sessionId,
      status: request.status ?? null,
      limit: request.limit ?? null
    })
    assertArray(value, "session inputs")
    return value.map(fromRpcSessionInputRecord)
  }

  async listSessionMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]> {
    const value = await this.callSession({
      command: "list-session-messages",
      session_id: request.sessionId,
      before_sequence: request.beforeSequence ?? null,
      limit: request.limit ?? null,
      turn_ids: request.turnIds === undefined ? null : [...request.turnIds]
    })
    assertArray(value, "session messages")
    return value.map(fromRpcSessionMessageRecord)
  }

  async listSessionTurns(
    request: ListSessionTurnsRequest
  ): Promise<SessionTurnRecord[]> {
    const value = await this.callSession({
      command: "list-session-turns",
      session_id: request.sessionId,
      state: request.state ?? null,
      turn_ids: request.turnIds === undefined ? null : [...request.turnIds]
    })
    assertArray(value, "session turns")
    return value.map(fromRpcSessionTurnRecord)
  }

  async listSessionAttempts(
    request: ListSessionAttemptsRequest
  ): Promise<SessionAttemptRecord[]> {
    const value = await this.callSession({
      command: "list-session-attempts",
      turn_id: request.turnId
    })
    assertArray(value, "session attempts")
    return value.map(fromRpcSessionAttemptRecord)
  }

  async appendSessionMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    const value = await this.callSession({
      command: "append-session-message",
      session_id: request.sessionId,
      turn_id: request.turnId,
      attempt_id: request.attemptId,
      input_id: request.inputId,
      job_id: request.jobId,
      worker_id: request.workerId,
      lease_token: request.leaseToken,
      idempotency_key: request.idempotencyKey,
      role: request.role,
      content: messagePartsToJson(request.content),
      provider_state:
        request.providerState === undefined
          ? null
          : toRpcJsonValueFromUnknown([...request.providerState])
    })
    return value === null ? null : fromRpcSessionMessageRecord(value)
  }

  private callSession(request: SessionsStorageRpcCommand) {
    return this.call(request)
  }
}
