import { randomUUID } from "node:crypto"
import type { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  matchesWanexAppConversationJob,
  normalizeWanexAppConversationOperationState,
  projectWanexAppConversationOperation,
  projectWanexAppConversationOperationApprovals,
  projectWanexAppConversationOperationProgress,
  projectWanexAppConversationOperationRecovery,
  projectWanexAppConversationOperationSteering
} from "./conversation-operation-read-model.js"
import type { AppStore } from "./storage.js"
import type {
  WanexAppCancelConversationOperationReceipt,
  WanexAppCancelConversationOperationRequest,
  WanexAppConversationOperationFoundResult,
  WanexAppConversationOperationApprovalListResult,
  WanexAppConversationOperationApprovalReadResult,
  WanexAppConversationOperationReadResult,
  WanexAppConversationOperationReceipt,
  WanexAppConversationOperationReference,
  WanexAppConversationOperationState,
  WanexAppInterruptConversationOperationReceipt,
  WanexAppInterruptConversationOperationRequest,
  WanexAppListConversationOperationApprovalsRequest,
  WanexAppReadConversationOperationApprovalRequest,
  WanexAppReadConversationOperationRequest,
  WanexAppResolveConversationOperationRecoveryReceipt,
  WanexAppResolveConversationOperationRecoveryRequest,
  WanexAppResolveConversationOperationApprovalReceipt,
  WanexAppResolveConversationOperationApprovalRequest,
  WanexAppSteerConversationOperationReceipt,
  WanexAppSteerConversationOperationRequest,
  WanexAppSubmitConversationOperationRequest
} from "./types-conversation-operation.js"
import {
  normalizeToolResultContent,
  toolResultContentDigest
} from "@wanex/runtime/tools"

const DEFAULT_WAIT_POLL_INTERVAL_MS = 50
const MAX_RECOVERY_JSON_BYTES = 32_768
const MAX_RECOVERY_REASON_BYTES = 4_096
const MAX_APPROVAL_REASON_BYTES = 1_024

export interface SubmitWanexAppConversationOperationOptions {
  readonly request: WanexAppSubmitConversationOperationRequest & {
    readonly jobIdempotencyKey?: string
  }
  readonly modelEndpointId: string
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
      ...(options.request.turnId === undefined
        ? {}
        : { turnId: options.request.turnId }),
      idempotencyKey:
        options.request.idempotencyKey ??
        `wanex-app:${options.request.sessionId ?? "new"}:${inputId}`,
      modelEndpointId: options.modelEndpointId,
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
      const [approvalExecutions, pendingSteeringControls] = await Promise.all([
        state === "waiting"
          ? this.#storage.listToolExecutions({
              turnId: reference.turnId,
              state: "approval_required",
              limit: 17
            })
          : Promise.resolve([]),
        state === "running" && turn.currentAttemptId !== undefined
          ? this.#storage.listSessionTurnControls({
              sessionId: reference.sessionId,
              turnId: reference.turnId,
              attemptId: turn.currentAttemptId,
              kind: "steer",
              status: "pending",
              limit: 17
            })
          : Promise.resolve([])
      ])
      const approvals = approvalExecutions.length === 0
        ? undefined
        : projectWanexAppConversationOperationApprovals(approvalExecutions)
      const steering = pendingSteeringControls.length === 0
        ? undefined
        : projectWanexAppConversationOperationSteering(pendingSteeringControls)
      return projectWanexAppConversationOperationProgress({
        job,
        turn,
        reference,
        ...(approvals === undefined ? {} : { approvals }),
        ...(steering === undefined ? {} : { steering })
      })
    }
    const [session, inputs, messages, recoveryExecutions] = await Promise.all([
      this.#storage.getSession(reference.sessionId),
      this.#storage.listSessionInputs({ sessionId: reference.sessionId }),
      this.#storage.listSessionMessages({ sessionId: reference.sessionId }),
      state === "recovery_required"
        ? this.#storage.listToolExecutions({
            turnId: reference.turnId,
            state: "recovery_required",
            limit: 65
          })
        : Promise.resolve([])
    ])
    const input = inputs.find((candidate) => candidate.id === reference.inputId)
    if (session === null || input === undefined) {
      return { kind: "missing", reference }
    }
    const relatedMessages = messages.filter(
      (message) => message.turnId === reference.turnId
    )
    const recovery =
      state === "recovery_required"
        ? projectWanexAppConversationOperationRecovery({
            turn,
            executions: await Promise.all(
              recoveryExecutions.map(async (execution) => ({
                execution,
                attempts: await this.#storage.listToolExecutionAttempts({
                  executionId: execution.id
                })
              }))
            )
          })
        : undefined
    return projectWanexAppConversationOperation({
      job,
      turn,
      reference,
      input,
      messages: relatedMessages,
      ...(recovery === undefined ? {} : { recovery }),
      ...(request.transcriptLimit === undefined
        ? {}
        : { transcriptLimit: request.transcriptLimit })
    })
  }

  async resolveRecovery(
    request: WanexAppResolveConversationOperationRecoveryRequest
  ): Promise<WanexAppResolveConversationOperationRecoveryReceipt> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const executionId = normalizeRequiredString(
      request.executionId,
      "conversation recovery executionId"
    )
    const reason = normalizeRequiredString(
      request.reason,
      "conversation recovery reason"
    )
    if (Buffer.byteLength(reason, "utf8") > MAX_RECOVERY_REASON_BYTES) {
      throw new Error("conversation recovery reason exceeds 4096 bytes")
    }
    if (
      !Number.isSafeInteger(request.expectedRecoveryRevision) ||
      request.expectedRecoveryRevision <= 0
    ) {
      throw new Error("conversation recovery revision must be a positive integer")
    }
    const recoveryContent = validateRecoveryPayload(request)
    const current = await this.read(reference)
    if (current.kind === "missing") {
      throw new Error("conversation recovery operation was not found")
    }
    const recovery = current.operation.recovery?.items.find(
      (item) => item.executionId === executionId
    )
    if (recovery === undefined) {
      throw new Error("conversation recovery execution is not current for this operation")
    }
    if (!recovery.availableDecisions.includes(request.decision)) {
      throw new Error("conversation recovery decision is not available")
    }
    const receipt = await this.#storage.resolveToolExecutionRecovery({
      executionId,
      expectedRecoveryRevision: request.expectedRecoveryRevision,
      decision: request.decision,
      principalId: "wanex-app-user",
      reason,
      idempotencyKey:
        request.idempotencyKey ?? `wanex-app:recovery:${randomUUID()}`,
      ...(recoveryContent === undefined
        ? {}
        : {
            content: recoveryContent,
            contentDigest: toolResultContentDigest(recoveryContent)
          }),
      ...(request.error === undefined ? {} : { error: request.error })
    })
    this.#host.wake()
    return {
      ...reference,
      decision: receipt.recoveryDecision.decision,
      action: receipt.recoveryDecision.action,
      recoveryRevision: receipt.recoveryDecision.recoveryRevision,
      createdAt: receipt.recoveryDecision.createdAt
    }
  }

  async listApprovals(
    request: WanexAppListConversationOperationApprovalsRequest
  ): Promise<WanexAppConversationOperationApprovalListResult> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const current = await this.read(reference)
    if (current.kind === "missing") return current
    return {
      kind: "found",
      reference,
      approvals: current.operation.approvals ?? { items: [], truncated: false }
    }
  }

  async readApproval(
    request: WanexAppReadConversationOperationApprovalRequest
  ): Promise<WanexAppConversationOperationApprovalReadResult> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const executionId = normalizeRequiredString(
      request.executionId,
      "conversation approval executionId"
    )
    const listed = await this.listApprovals(reference)
    if (listed.kind === "missing") {
      return { kind: "missing", reference, executionId }
    }
    const approval = listed.approvals.items.find(
      (candidate) => candidate.executionId === executionId
    )
    return approval === undefined
      ? { kind: "missing", reference, executionId }
      : { kind: "found", reference, approval }
  }

  async resolveApproval(
    request: WanexAppResolveConversationOperationApprovalRequest
  ): Promise<WanexAppResolveConversationOperationApprovalReceipt> {
    this.#assertActive()
    const reference = normalizeReference(request)
    const executionId = normalizeRequiredString(
      request.executionId,
      "conversation approval executionId"
    )
    const reason = normalizeRequiredString(
      request.reason,
      "conversation approval reason"
    )
    if (Buffer.byteLength(reason, "utf8") > MAX_APPROVAL_REASON_BYTES) {
      throw new Error("conversation approval reason exceeds 1024 bytes")
    }
    if (
      !Number.isSafeInteger(request.expectedApprovalRevision) ||
      request.expectedApprovalRevision < 0
    ) {
      throw new Error("conversation approval revision must be a non-negative integer")
    }
    if (request.decision !== "approve_once" && request.decision !== "deny") {
      throw new Error("conversation approval decision is invalid")
    }
    const execution = await this.#storage.getToolExecution(executionId)
    if (
      execution === null ||
      execution.sessionId !== reference.sessionId ||
      execution.turnId !== reference.turnId ||
      execution.inputId !== reference.inputId
    ) {
      throw new Error("conversation approval execution was not found")
    }
    const receipt = await this.#storage.resolveToolExecutionApproval({
      executionId,
      expectedApprovalRevision: request.expectedApprovalRevision,
      decision: request.decision,
      principalId: execution.principalId,
      reason,
      idempotencyKey:
        request.idempotencyKey ?? `wanex-app:approval:${randomUUID()}`
    })
    this.#host.wake()
    return {
      ...reference,
      executionId,
      decision: receipt.approvalDecision.decision,
      action: receipt.approvalDecision.action,
      approvalRevision: receipt.approvalDecision.approvalRevision,
      createdAt: receipt.approvalDecision.createdAt
    }
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

function validateRecoveryPayload(
  request: WanexAppResolveConversationOperationRecoveryRequest
): readonly import("@wanex/protocol").ToolResultContentPart[] | undefined {
  const confirms =
    request.decision === "confirm_succeeded" ||
    request.decision === "confirm_failed"
  if (confirms && request.content === undefined) {
    throw new Error("confirmed conversation recovery requires canonical content")
  }
  if (!confirms && (request.content !== undefined || request.error !== undefined)) {
    throw new Error("retry and abandon recovery decisions cannot include content data")
  }
  const content = request.content === undefined
    ? undefined
    : normalizeToolResultContent(request.content)
  for (const [label, value] of [
    ["content", content],
    ["error", request.error]
  ] as const) {
    if (
      value !== undefined &&
      Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_RECOVERY_JSON_BYTES
    ) {
      throw new Error(`conversation recovery ${label} exceeds ${MAX_RECOVERY_JSON_BYTES} bytes`)
    }
  }
  return content
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
