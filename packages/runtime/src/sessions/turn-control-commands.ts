import type {
  ApplySessionTurnControlReceipt,
  ApplySessionTurnControlRequest,
  InterruptSessionTurnReceipt,
  InterruptSessionTurnRequest,
  ListSessionTurnControlsRequest,
  SessionTurnControlRecord,
  SteerSessionTurnReceipt,
  SteerSessionTurnRequest
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { assertContentNotEmpty } from "./session-commands.js"

export class TurnControlCommands {
  constructor(private readonly storage: CoreStore) {}

  async interruptTurn(
    request: InterruptSessionTurnRequest
  ): Promise<InterruptSessionTurnReceipt> {
    if (request.reason.length === 0) {
      throw new Error("interrupt reason must not be empty")
    }
    return await this.storage.interruptSessionTurn(request)
  }

  async steerTurn(
    request: SteerSessionTurnRequest
  ): Promise<SteerSessionTurnReceipt> {
    assertContentNotEmpty(request.content, "steer content must not be empty")
    if (request.expectedTurnId.length === 0 || request.expectedAttemptId.length === 0) {
      throw new Error("steer target must not be empty")
    }
    if (request.idempotencyKey.length === 0) {
      throw new Error("steer idempotencyKey must not be empty")
    }
    return await this.storage.steerSessionTurn(request)
  }

  async listTurnControls(
    request: ListSessionTurnControlsRequest
  ): Promise<SessionTurnControlRecord[]> {
    return await this.storage.listSessionTurnControls(request)
  }

  async applyTurnControl(
    request: ApplySessionTurnControlRequest
  ): Promise<ApplySessionTurnControlReceipt | null> {
    if (
      request.controlId.length === 0 ||
      request.turnId.length === 0 ||
      request.attemptId.length === 0 ||
      request.jobId.length === 0 ||
      request.workerId.length === 0 ||
      request.leaseToken.length === 0
    ) {
      throw new Error("turn-control execution identity must not be empty")
    }
    return await this.storage.applySessionTurnControl(request)
  }
}
