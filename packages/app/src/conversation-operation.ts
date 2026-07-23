import { randomUUID } from "node:crypto"
import type { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  matchesWanexAppConversationJob,
  normalizeWanexAppConversationOperationState,
  projectWanexAppConversationOperation,
  projectWanexAppConversationOperationProgress
} from "./conversation-operation-read-model.js"
import type { AppStore } from "./storage.js"
import type {
  WanexAppCancelConversationOperationReceipt,
  WanexAppCancelConversationOperationRequest,
  WanexAppConversationOperationFoundResult,
  WanexAppConversationOperationReadResult,
  WanexAppConversationOperationReceipt,
  WanexAppConversationOperationReference,
  WanexAppConversationOperationState,
  WanexAppInterruptConversationOperationReceipt,
  WanexAppInterruptConversationOperationRequest,
  WanexAppReadConversationOperationRequest,
  WanexAppSteerConversationOperationReceipt,
  WanexAppSteerConversationOperationRequest,
  WanexAppSubmitConversationOperationRequest
} from "./types-conversation-operation.js"

const DEFAULT_WAIT_POLL_INTERVAL_MS = 50

export interface SubmitWanexAppConversationOperationOptions {
  readonly request: WanexAppSubmitConversationOperationRequest & {
    readonly jobIdempotencyKey?: string
  }
  readonly providerProfileId: string
}

export class WanexAppConversationOperationController {
  readonly #storage: AppStore
  readonly #host: WanexRuntimeHost
  #disposed = false

  constructor(options: {
    readonly storage: AppStore
    readonly host: WanexRuntimeHost
  }) {
    this.#storage = options.storage
    this.#host = options.host
  }

  start(): void {
    this.#assertActive()
    this.#host.start()
  }

  async stop(): Promise<void> {
    if (this.#disposed) {
      return
    }
    await this.#host.stop()
  }

  isStarted(): boolean {
    return this.#host.status().started
  }

  status(): ReturnType<WanexRuntimeHost["status"]> {
    return this.#host.status()
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return
    }
    this.#disposed = true
    await this.#host.dispose()
  }

  async submit(
    options: SubmitWanexAppConversationOperationOptions
  ): Promise<WanexAppConversationOperationReceipt> {
    this.#assertActive()
    validateConversationContent(options.request.content)
    const inputId = options.request.inputId ?? `inp_${randomUUID()}`
    const submitted = await this.#host.submitUserTurn({
      inputId,
      content: options.request.content,
      ...(options.request.sessionId === undefined
        ? {}
        : { sessionId: options.request.sessionId }),
      principalId: options.request.principalId ?? "wanex-app-user",
      idempotencyKey:
        options.request.idempotencyKey ??
        `wanex-app:${options.request.sessionId ?? "new"}:${inputId}`,
      providerProfileId: options.providerProfileId,
      ...(options.request.origin === undefined
        ? {}
        : { origin: options.request.origin }),
      ...(options.request.intent === undefined
        ? {}
        : { intent: options.request.intent }),
      ...(options.request.runControlPolicy === undefined
        ? {}
        : { runControlPolicy: options.request.runControlPolicy }),
      ...(options.request.expectedTurnId === undefined
        ? {}
        : { expectedTurnId: options.request.expectedTurnId }),
      ...(options.request.regeneratesTurnId === undefined
        ? {}
        : { regeneratesTurnId: options.request.regeneratesTurnId }),
      ...(options.request.jobId === undefined
        ? {}
        : { jobId: options.request.jobId }),
      ...(options.request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: options.request.jobIdempotencyKey })
    })
    const receipt = submitted.receipt
    return {
      sessionId: receipt.admission.sessionId,
      inputId: receipt.admission.inputId,
      turnId: receipt.turn.id,
      jobId: receipt.job.id,
      state: normalizeWanexAppConversationOperationState(
        receipt.job.state,
        receipt.turn.state
      ),
      submittedAt: receipt.job.createdAt
    }
  }

  async cancel(
    request: WanexAppCancelConversationOperationRequest
  ): Promise<WanexAppCancelConversationOperationReceipt> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const receipt = await this.#host.requestSessionTurnCancel({
      sessionId: reference.sessionId,
      turnId: reference.turnId,
      inputId: reference.inputId,
      jobId: reference.jobId,
      reason: normalizeRequiredString(
        request.reason,
        "conversation operation cancel reason"
      )
    })
    return { ...reference, status: receipt.status }
  }

  async interrupt(
    request: WanexAppInterruptConversationOperationRequest
  ): Promise<WanexAppInterruptConversationOperationReceipt> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const attemptId = normalizeRequiredString(
      request.attemptId,
      "conversation operation attemptId"
    )
    const receipt = await this.#host.interruptSessionTurn({
      sessionId: reference.sessionId,
      turnId: reference.turnId,
      attemptId,
      reason: normalizeRequiredString(
        request.reason,
        "conversation operation interrupt reason"
      ),
      ...(request.principalId === undefined
        ? {}
        : {
            principalId: normalizeRequiredString(
              request.principalId,
              "conversation operation principalId"
            )
          }),
      ...(request.idempotencyKey === undefined
        ? {}
        : {
            idempotencyKey: normalizeRequiredString(
              request.idempotencyKey,
              "conversation operation idempotencyKey"
            )
          }),
      ...(request.origin === undefined ? {} : { origin: request.origin })
    })
    return {
      ...reference,
      attemptId,
      status: receipt.status,
      ...(receipt.acceptedAt === undefined
        ? {}
        : { acceptedAt: receipt.acceptedAt })
    }
  }

  async steer(
    request: WanexAppSteerConversationOperationRequest
  ): Promise<WanexAppSteerConversationOperationReceipt> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const attemptId = normalizeRequiredString(
      request.attemptId,
      "conversation operation attemptId"
    )
    if (request.content.length === 0) {
      throw new Error("conversation operation steer content must not be empty")
    }
    const receipt = await this.#host.steerSessionTurn({
      sessionId: reference.sessionId,
      expectedTurnId: reference.turnId,
      expectedAttemptId: attemptId,
      principalId: normalizeRequiredString(
        request.principalId,
        "conversation operation principalId"
      ),
      idempotencyKey: normalizeRequiredString(
        request.idempotencyKey,
        "conversation operation idempotencyKey"
      ),
      content: request.content,
      ...(request.origin === undefined ? {} : { origin: request.origin })
    })
    return {
      ...reference,
      attemptId,
      status: receipt.status,
      ...(receipt.acceptedAt === undefined
        ? {}
        : { acceptedAt: receipt.acceptedAt })
    }
  }

  async read(
    request: WanexAppReadConversationOperationRequest
  ): Promise<WanexAppConversationOperationReadResult> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const [job, turns] = await Promise.all([
      this.#storage.getJob({ jobId: reference.jobId }),
      this.#storage.listSessionTurns({ sessionId: reference.sessionId })
    ])
    if (!matchesWanexAppConversationJob(job, reference)) {
      return { kind: "missing", reference }
    }
    const turn = turns.find((candidate) =>
      candidate.id === reference.turnId &&
      candidate.jobId === reference.jobId &&
      candidate.primaryInputId === reference.inputId
    )
    if (turn === undefined) {
      return { kind: "missing", reference }
    }
    const state = normalizeWanexAppConversationOperationState(
      job.state,
      turn.state
    )
    if (!isTerminalOperationState(state)) {
      return projectWanexAppConversationOperationProgress({
        job,
        turn,
        reference
      })
    }
    const [session, inputs, messages] = await Promise.all([
      this.#storage.getSession(reference.sessionId),
      this.#storage.listSessionInputs({ sessionId: reference.sessionId }),
      this.#storage.listSessionMessages({ sessionId: reference.sessionId })
    ])
    const input = inputs.find((candidate) => candidate.id === reference.inputId)
    if (session === null || input === undefined) {
      return { kind: "missing", reference }
    }
    const relatedMessages = messages.filter(
      (message) => message.turnId === reference.turnId
    )
    return projectWanexAppConversationOperation({
      job,
      turn,
      reference,
      input,
      messages: relatedMessages,
      ...(request.transcriptLimit === undefined
        ? {}
        : { transcriptLimit: request.transcriptLimit })
    })
  }

  async waitForTerminal(
    reference: WanexAppConversationOperationReference,
    options: {
      readonly transcriptLimit?: number
      readonly pollIntervalMs?: number
    } = {}
  ): Promise<WanexAppConversationOperationFoundResult> {
    this.#assertActive()
    const pollIntervalMs = normalizePollInterval(options.pollIntervalMs)
    for (;;) {
      const result = await this.read({
        ...reference,
        ...(options.transcriptLimit === undefined
          ? {}
          : { transcriptLimit: options.transcriptLimit })
      })
      if (result.kind === "missing") {
        throw new Error("conversation operation was not found")
      }
      if (isTerminalOperationState(result.operation.state)) {
        return result
      }
      if (!this.#host.status().started) {
        throw new Error("conversation operation processor is stopped")
      }
      await delay(pollIntervalMs)
    }
  }

  async countSessionMessages(sessionId: string): Promise<number> {
    this.#assertActive()
    return (
      await this.#storage.listSessionMessages({
        sessionId: normalizeRequiredString(
          sessionId,
          "conversation operation sessionId"
        )
      })
    ).length
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("conversation operation processor is disposed")
    }
  }
}

function validateConversationContent(
  content: WanexAppSubmitConversationOperationRequest["content"]
): void {
  if (content.length === 0) {
    throw new Error("conversation operation content must not be empty")
  }
  for (const [index, part] of content.entries()) {
    if (part.type === "text" && part.text.trim().length === 0) {
      throw new Error(
        `conversation operation text part ${index} must not be empty`
      )
    }
    if (part.type === "resource" && part.resourceId.trim().length === 0) {
      throw new Error(
        `conversation operation resource part ${index} must have a resourceId`
      )
    }
  }
}

function normalizeReference(
  reference: WanexAppConversationOperationReference
): WanexAppConversationOperationReference {
  return {
    sessionId: normalizeRequiredString(
      reference.sessionId,
      "conversation operation sessionId"
    ),
    inputId: normalizeRequiredString(
      reference.inputId,
      "conversation operation inputId"
    ),
    turnId: normalizeRequiredString(
      reference.turnId,
      "conversation operation turnId"
    ),
    jobId: normalizeRequiredString(
      reference.jobId,
      "conversation operation jobId"
    )
  }
}

function normalizePollInterval(value: number | undefined): number {
  const interval = value ?? DEFAULT_WAIT_POLL_INTERVAL_MS
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error(
      "conversation operation poll interval must be a non-negative finite number"
    )
  }
  return interval
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return normalized
}

function isTerminalOperationState(
  state: WanexAppConversationOperationState
): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "interrupted" ||
    state === "recovery_required"
  )
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
