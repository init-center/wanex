import type {
  AdmissionReceipt,
  AdmitSessionInputRequest,
  AppendSessionMessageRequest,
  CancelRunRequest,
  CompleteRunRequest,
  CreateSessionRequest,
  FailRunRequest,
  ListSessionsRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  RunnerClaim,
  RunnerClaimRequest,
  RunnerHeartbeatRequest,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord,
  SubmitSessionRunReceipt,
  SubmitSessionRunRequest
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
    assertContentNotEmpty(
      request.content,
      "session input content must not be empty"
    )
    return await this.storage.admitSessionInput({
      ...request,
      inputType: request.inputType ?? "user"
    })
  }

  async submitRun(
    request: SubmitSessionRunRequest
  ): Promise<SubmitSessionRunReceipt> {
    assertContentNotEmpty(
      request.content,
      "session input content must not be empty"
    )
    if (request.maxSteps !== undefined && request.maxSteps <= 0) {
      throw new Error("session run maxSteps must be positive")
    }
    if (
      request.providerProfileId !== undefined &&
      request.providerProfileId.length === 0
    ) {
      throw new Error("session run providerProfileId must not be empty")
    }
    return await this.storage.submitSessionRun({
      ...request,
      inputType: request.inputType ?? "user",
      mode: request.mode ?? "once"
    })
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

  async appendMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    assertContentNotEmpty(
      request.content,
      "session message content must not be empty"
    )
    return await this.storage.appendSessionMessage(request)
  }

  async claimRunner(request: RunnerClaimRequest): Promise<RunnerClaim | null> {
    assertPositiveLease(request.leaseMs, "runner leaseMs must be positive")
    return await this.storage.claimRunner(request)
  }

  async heartbeatRunner(
    request: RunnerHeartbeatRequest
  ): Promise<RunnerClaim | null> {
    assertPositiveLease(request.leaseMs, "runner leaseMs must be positive")
    return await this.storage.heartbeatRunner(request)
  }

  async completeRun(request: CompleteRunRequest): Promise<boolean> {
    return await this.storage.completeRun(request)
  }

  async failRun(request: FailRunRequest): Promise<boolean> {
    return await this.storage.failRun(request)
  }

  async cancelRun(request: CancelRunRequest): Promise<boolean> {
    if (request.reason.length === 0) {
      throw new Error("cancel reason must not be empty")
    }
    return await this.storage.cancelRun(request)
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
