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

import {
  assertArray,
  fromRpcAdmissionReceipt,
  fromRpcApplySessionRunControlReceipt,
  fromRpcInterruptSessionRunReceipt,
  fromRpcSessionInputRecord,
  fromRpcSessionMessageRecord,
  fromRpcSessionRecord,
  fromRpcSessionRunControlRecord,
  fromRpcSteerSessionRunReceipt,
  fromRpcSubmitSessionRunReceipt,
  messagePartsToJson,
  sessionInputOriginToJson,
  toRpcApplySessionRunControlRequest,
  toRpcInterruptSessionRunRequest,
  toRpcListSessionsRequest,
  toRpcListSessionRunControlsRequest,
  toRpcSteerSessionRunRequest,
  toRpcSubmitSessionRunRequest
} from "./codec.js"
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
    const value = await this.callSession({
      command: "get-session",
      id
    })
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

  async submitSessionRun(
    request: SubmitSessionRunRequest
  ): Promise<SubmitSessionRunReceipt> {
    const value = await this.callSession({
      command: "submit-session-run",
      request: toRpcSubmitSessionRunRequest(request)
    })
    return fromRpcSubmitSessionRunReceipt(value)
  }

  async interruptSessionRun(
    request: InterruptSessionRunRequest
  ): Promise<InterruptSessionRunReceipt> {
    const value = await this.callSession({
      command: "interrupt-session-run",
      request: toRpcInterruptSessionRunRequest(request)
    })
    return fromRpcInterruptSessionRunReceipt(value)
  }

  async steerSessionRun(
    request: SteerSessionRunRequest
  ): Promise<SteerSessionRunReceipt> {
    const value = await this.callSession({
      command: "steer-session-run",
      request: toRpcSteerSessionRunRequest(request)
    })
    return fromRpcSteerSessionRunReceipt(value)
  }

  async listSessionRunControls(
    request: ListSessionRunControlsRequest
  ): Promise<SessionRunControlRecord[]> {
    const value = await this.callSession({
      command: "list-session-run-controls",
      request: toRpcListSessionRunControlsRequest(request)
    })
    assertArray(value, "session run controls")
    return value.map(fromRpcSessionRunControlRecord)
  }

  async applySessionRunControl(
    request: ApplySessionRunControlRequest
  ): Promise<ApplySessionRunControlReceipt | null> {
    const value = await this.callSession({
      command: "apply-session-run-control",
      request: toRpcApplySessionRunControlRequest(request)
    })
    return value === null ? null : fromRpcApplySessionRunControlReceipt(value)
  }

  async listSessionInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]> {
    const value = await this.callSession({
      command: "list-session-inputs",
      session_id: request.sessionId
    })
    assertArray(value, "session inputs")
    return value.map(fromRpcSessionInputRecord)
  }

  async listSessionMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]> {
    const value = await this.callSession({
      command: "list-session-messages",
      session_id: request.sessionId
    })
    assertArray(value, "session messages")
    return value.map(fromRpcSessionMessageRecord)
  }

  async appendSessionMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    const value = await this.callSession({
      command: "append-session-message",
      session_id: request.sessionId,
      run_id: request.runId,
      input_id: request.inputId,
      runner_id: request.runnerId,
      lease_token: request.leaseToken,
      idempotency_key: request.idempotencyKey,
      role: request.role,
      content: messagePartsToJson(request.content)
    })
    return value === null ? null : fromRpcSessionMessageRecord(value)
  }

  private callSession(request: SessionsStorageRpcCommand) {
    return this.call(request)
  }
}
