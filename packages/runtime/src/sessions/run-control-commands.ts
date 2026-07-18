import type {
  ApplySessionRunControlReceipt,
  ApplySessionRunControlRequest,
  InterruptSessionRunReceipt,
  InterruptSessionRunRequest,
  ListSessionRunControlsRequest,
  SessionRunControlRecord,
  SteerSessionRunReceipt,
  SteerSessionRunRequest
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { assertContentNotEmpty } from "./session-commands.js"

export class RunControlCommands {
  constructor(private readonly storage: CoreStore) {}

  async interruptRun(
    request: InterruptSessionRunRequest
  ): Promise<InterruptSessionRunReceipt> {
    if (request.reason.length === 0) {
      throw new Error("interrupt reason must not be empty")
    }
    return await this.storage.interruptSessionRun(request)
  }

  async steerRun(
    request: SteerSessionRunRequest
  ): Promise<SteerSessionRunReceipt> {
    assertContentNotEmpty(request.content, "steer content must not be empty")
    if (request.expectedRunId.length === 0) {
      throw new Error("steer expectedRunId must not be empty")
    }
    if (request.idempotencyKey.length === 0) {
      throw new Error("steer idempotencyKey must not be empty")
    }
    return await this.storage.steerSessionRun(request)
  }

  async listRunControls(
    request: ListSessionRunControlsRequest
  ): Promise<SessionRunControlRecord[]> {
    return await this.storage.listSessionRunControls(request)
  }

  async applyRunControl(
    request: ApplySessionRunControlRequest
  ): Promise<ApplySessionRunControlReceipt | null> {
    if (request.controlId.length === 0) {
      throw new Error("run-control controlId must not be empty")
    }
    if (request.runId.length === 0) {
      throw new Error("run-control runId must not be empty")
    }
    if (request.runnerId.length === 0) {
      throw new Error("run-control runnerId must not be empty")
    }
    if (request.leaseToken.length === 0) {
      throw new Error("run-control leaseToken must not be empty")
    }
    return await this.storage.applySessionRunControl(request)
  }
}
