import type {
  AdmissionReceipt,
  AdmitSessionInputRequest,
  AppendSessionMessageRequest,
  BeginProviderInvocationRequest,
  CreateSessionRequest,
  FinishProviderInvocationReceipt,
  FinishProviderInvocationRequest,
  ListProviderInvocationsRequest,
  ListSessionAttemptsRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  ListSessionTurnsRequest,
  ListSessionsRequest,
  MarkProviderInvocationOutputRequest,
  ProviderInvocationRecord,
  RequestSessionTurnCancelReceipt,
  RequestSessionTurnCancelRequest,
  SessionAttemptRecord,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord,
  SessionTurnRecord,
  SettleSessionTurnReceipt,
  SettleSessionTurnRequest,
  StartSessionTurnAttemptReceipt,
  StartSessionTurnAttemptRequest,
  SubmitSessionTurnReceipt,
  SubmitSessionTurnRequest
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export class SessionCommands {
  constructor(private readonly storage: CoreStore) {}

  async create(request: CreateSessionRequest): Promise<SessionRecord> {
    return await this.storage.createSession({
      ...request,
      kind: request.kind ?? "chat"
    })
  }

  async get(id: string): Promise<SessionRecord | null> {
    return await this.storage.getSession(id)
  }

  async list(request: ListSessionsRequest = {}): Promise<SessionRecord[]> {
    return await this.storage.listSessions(request)
  }

  async admit(request: AdmitSessionInputRequest): Promise<AdmissionReceipt> {
    assertContentNotEmpty(request.content, "session input content must not be empty")
    return await this.storage.admitSessionInput({
      ...request,
      inputType: request.inputType ?? "user"
    })
  }

  async submitTurn(
    request: SubmitSessionTurnRequest
  ): Promise<SubmitSessionTurnReceipt> {
    assertContentNotEmpty(request.content, "session input content must not be empty")
    if (request.maxSteps !== undefined && request.maxSteps <= 0) {
      throw new Error("session turn maxSteps must be positive")
    }
    if (request.executionBinding.digest.length === 0) {
      throw new Error("session turn execution binding digest must not be empty")
    }
    return await this.storage.submitSessionTurn({
      ...request,
      inputType: request.inputType ?? "user"
    })
  }

  async startTurnAttempt(
    request: StartSessionTurnAttemptRequest
  ): Promise<StartSessionTurnAttemptReceipt> {
    return await this.storage.startSessionTurnAttempt(request)
  }

  async settleTurn(
    request: SettleSessionTurnRequest
  ): Promise<SettleSessionTurnReceipt> {
    return await this.storage.settleSessionTurn(request)
  }

  async beginProviderInvocation(
    request: BeginProviderInvocationRequest
  ): Promise<ProviderInvocationRecord> {
    return await this.storage.beginProviderInvocation(request)
  }

  async markProviderInvocationOutput(
    request: MarkProviderInvocationOutputRequest
  ): Promise<ProviderInvocationRecord | null> {
    return await this.storage.markProviderInvocationOutput(request)
  }

  async finishProviderInvocation(
    request: FinishProviderInvocationRequest
  ): Promise<FinishProviderInvocationReceipt | null> {
    return await this.storage.finishProviderInvocation(request)
  }

  async listProviderInvocations(
    request: ListProviderInvocationsRequest
  ): Promise<ProviderInvocationRecord[]> {
    return await this.storage.listProviderInvocations(request)
  }

  async requestTurnCancel(
    request: RequestSessionTurnCancelRequest
  ): Promise<RequestSessionTurnCancelReceipt> {
    if (request.reason.length === 0) {
      throw new Error("cancel reason must not be empty")
    }
    return await this.storage.requestSessionTurnCancel(request)
  }

  async listInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]> {
    return await this.storage.listSessionInputs(request)
  }

  async listMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]> {
    return await this.storage.listSessionMessages(request)
  }

  async listTurns(
    request: ListSessionTurnsRequest
  ): Promise<SessionTurnRecord[]> {
    return await this.storage.listSessionTurns(request)
  }

  async listAttempts(
    request: ListSessionAttemptsRequest
  ): Promise<SessionAttemptRecord[]> {
    return await this.storage.listSessionAttempts(request)
  }

  async appendMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    assertContentNotEmpty(request.content, "session message content must not be empty")
    return await this.storage.appendSessionMessage(request)
  }
}

export function assertPositiveLease(leaseMs: number, message: string): void {
  if (leaseMs <= 0) {
    throw new Error(message)
  }
}

export function assertContentNotEmpty(
  content: readonly unknown[],
  message: string
): void {
  if (content.length === 0) {
    throw new Error(message)
  }
}
