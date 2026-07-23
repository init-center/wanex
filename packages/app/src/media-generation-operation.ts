import type { WanexRuntimeHost } from "@wanex/runtime/host"
import type {
  WanexAppCancelMediaGenerationRequest,
  WanexAppCancelMediaGenerationReceipt,
  WanexAppMediaGenerationReadResult,
  WanexAppMediaGenerationReceipt,
  WanexAppReadMediaGenerationOperationRequest,
  WanexAppSubmitMediaGenerationRequest
} from "./types-media-generation.js"

export class WanexAppMediaGenerationOperationController {
  readonly #host: WanexRuntimeHost
  #disposed = false

  constructor(options: { readonly host: WanexRuntimeHost }) {
    this.#host = options.host
  }

  async submit(
    request: WanexAppSubmitMediaGenerationRequest
  ): Promise<WanexAppMediaGenerationReceipt> {
    this.#assertActive()
    const submitted = await this.#host.submitMediaGeneration(request)
    return {
      operationId: submitted.operation.id,
      jobId: submitted.operation.jobId,
      state: submitted.operation.state,
      submittedAt: submitted.operation.createdAt
    }
  }

  async read(
    request: WanexAppReadMediaGenerationOperationRequest
  ): Promise<WanexAppMediaGenerationReadResult> {
    this.#assertActive()
    const operationId = normalizeRequiredString(
      request.operationId,
      "media generation operationId"
    )
    const operation = await this.#host.getMediaGenerationOperation(operationId)
    return operation === null
      ? { kind: "missing", operationId }
      : { kind: "found", operation }
  }

  async cancel(
    request: WanexAppCancelMediaGenerationRequest
  ): Promise<WanexAppCancelMediaGenerationReceipt> {
    this.#assertActive()
    const operationId = normalizeRequiredString(
      request.operationId,
      "media generation operationId"
    )
    const reason = normalizeRequiredString(
      request.reason,
      "media generation cancel reason"
    )
    const before = await this.#host.getMediaGenerationOperation(operationId)
    if (before === null) {
      return { operationId, status: "missing" }
    }
    if (isTerminal(before.state)) {
      return {
        operationId,
        status: "already_terminal",
        state: before.state
      }
    }
    const operation = await this.#host.requestMediaGenerationCancel({
      operationId,
      reason
    })
    if (operation === null) {
      return { operationId, status: "missing" }
    }
    if (operation.state === "cancelled") {
      return { operationId, status: "cancelled", state: operation.state }
    }
    if (operation.state === "cancel_requested") {
      return {
        operationId,
        status: "cancel_requested",
        state: operation.state
      }
    }
    return {
      operationId,
      status: "already_terminal",
      state: operation.state
    }
  }

  dispose(): void {
    this.#disposed = true
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("media generation operation controller is disposed")
    }
  }
}

function isTerminal(state: string): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "recovery_required"
  )
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}
