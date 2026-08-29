import type {
  BeginToolExecutionReceipt,
  JsonValue,
  ToolCallMessagePart,
  ToolExecutionRecord
} from "@wanex/protocol"
import {
  modelCapabilityRequirementKey,
  normalizeModelCapabilityRequirement
} from "../provider/model-descriptor.js"
import {
  assertToolRuntimeBinding,
  canonicalizeToolEvidence,
  compareCanonicalStrings
} from "./evidence.js"
import { jsonToolResultContent, toolResultPart } from "./parts.js"
import {
  presentToolCall,
  presentToolFailure,
  presentToolResult
} from "./presentation.js"
import { createToolResourceOutputPort } from "./resources.js"
import type {
  ToolBindingEvidence,
  ToolDefinition,
  ToolDescriptor,
  ToolExecutionOutcome,
  ToolExecutionRequest,
  ToolInputSchema,
  ToolPermissionDecision,
  ToolRegistrySnapshot
} from "./types.js"

type InputValidator = ((value: unknown) => boolean) & {
  readonly errors?: unknown
}

/** @internal */
export interface PreparedToolExecution {
  readonly tool: ToolDefinition | undefined
  readonly descriptor: ToolDescriptor
  readonly permission: ToolPermissionDecision
}

/** @internal */
export interface BegunToolExecution {
  readonly receipt: BeginToolExecutionReceipt
  readonly reused?: ToolExecutionOutcome
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()
  private readonly validators = new Map<string, Promise<InputValidator>>()

  register(tool: ToolDefinition): void {
    validateDescriptor(tool)
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`)
    }
    const registered = normalizeToolDefinition(tool)
    this.tools.set(registered.name, registered)
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()]
      .map(projectDescriptor)
      .sort((left, right) => compareCanonicalStrings(left.name, right.name))
  }

  snapshot(): ToolRegistrySnapshot {
    return {
      tools: [...this.tools.values()]
        .map(projectBindingEvidence)
        .sort((left, right) =>
          compareCanonicalStrings(left.descriptor.name, right.descriptor.name)
        )
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionOutcome> {
    const existing = await request.storage.getToolExecutionByCall({
      turnId: request.turnId,
      sourceMessageId: request.sourceMessageId,
      toolCallId: request.call.toolCallId
    })
    const prepared = await this.prepareExecution(request, existing)
    return await this.executePrepared(request, prepared)
  }

  /** @internal */
  async prepareExecution(
    request: ToolExecutionRequest,
    existing: ToolExecutionRecord | null
  ): Promise<PreparedToolExecution> {
    throwIfToolInvocationAborted(request.signal)
    const tool = this.tools.get(request.call.toolName)
    const descriptor = tool === undefined
      ? unknownToolDescriptor(request.call.toolName)
      : projectDescriptor(tool)
    const permission = existing === null
      ? await preflight(this, tool, descriptor, request)
      : await persistedPreflight(this, tool, descriptor, request, existing)
    if (
      permission.status === "approval_required" &&
      descriptor.concurrency !== "exclusive"
    ) {
      throw new Error("approval-required Tool must be exclusive")
    }
    return { tool, descriptor, permission }
  }

  /** @internal */
  async beginPreparedExecution(
    request: ToolExecutionRequest,
    prepared: PreparedToolExecution
  ): Promise<BegunToolExecution> {
    const { tool, descriptor, permission } = prepared
    const callPresentation =
      tool === undefined || permission.status === "deny"
        ? undefined
        : presentToolCall(tool, request.call.input)
    const receipt = await request.storage.beginToolExecution({
      sessionId: request.sessionId,
      turnId: request.turnId,
      attemptId: request.attemptId,
      inputId: request.inputId,
      sourceMessageId: request.sourceMessageId,
      jobId: request.jobId,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      principalId: request.principalId,
      toolCallId: request.call.toolCallId,
      toolName: request.call.toolName,
      input: request.call.input,
      descriptor: jsonClone(
        tool === undefined
          ? descriptor
          : executionDescriptor(descriptor, tool.runtimeBinding)
      ),
      permission: jsonClone(permission),
      ...(callPresentation === undefined
        ? {}
        : { activity: { call: callPresentation } }),
      state:
        permission.status === "allow" && tool !== undefined
          ? "running"
          : permission.status === "approval_required"
            ? "approval_required"
            : "denied",
      idempotencyKey: request.idempotencyKey
    })
    if (!receipt.created) {
      const reused = recoverOrReuse(request, descriptor, permission, receipt)
      if (reused !== undefined) return { receipt, reused }
    }
    return { receipt }
  }

  /** @internal */
  async cancelPreparedExecution(
    request: ToolExecutionRequest,
    prepared: PreparedToolExecution,
    begun: BegunToolExecution
  ): Promise<ToolExecutionOutcome> {
    if (begun.reused !== undefined) return begun.reused
    const { descriptor, permission } = prepared
    const execution = begun.receipt.execution
    const invocationAttempt = begun.receipt.invocationAttempt
    if (execution.state !== "running" || invocationAttempt === undefined) {
      return await this.executePrepared(request, prepared, begun)
    }
    const result = toolResultPart(
      request.call.toolCallId,
      jsonToolResultContent({
        error: "tool_cancelled",
        message: "tool invocation cancelled before start"
      }),
      true
    )
    if (await request.storage.finishToolExecution({
      sessionId: request.sessionId,
      turnId: request.turnId,
      sessionAttemptId: request.attemptId,
      inputId: request.inputId,
      jobId: request.jobId,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      executionId: execution.id,
      invocationAttemptId: invocationAttempt.id,
      state: "cancelled",
      content: result.content,
      contentDigest: result.contentDigest,
      isError: true,
      error: { reason: "aborted", message: "tool invocation cancelled before start" }
    }) === null) {
      throw new Error("tool execution lost its lease while recording cancellation")
    }
    return {
      state: "completed",
      descriptor,
      permission,
      result,
      invoked: false
    }
  }

  /** @internal */
  async executePrepared(
    request: ToolExecutionRequest,
    prepared: PreparedToolExecution,
    begun?: BegunToolExecution
  ): Promise<ToolExecutionOutcome> {
    throwIfToolInvocationAborted(request.signal)
    const { tool, descriptor, permission } = prepared
    const started = begun ?? await this.beginPreparedExecution(request, prepared)
    if (started.reused !== undefined) return started.reused
    const receipt = started.receipt
    const callPresentation =
      tool === undefined || permission.status === "deny"
        ? undefined
        : presentToolCall(tool, request.call.input)
    if (permission.status === "approval_required") {
      if (receipt.approvalSuspension !== undefined) {
        return {
          state: "approval_required",
          descriptor,
          permission,
          receipt: receipt.approvalSuspension,
          invoked: false
        }
      }
      if (
        receipt.execution.state !== "running" ||
        receipt.invocationAttempt === undefined
      ) {
        throw new Error(
          "approval-required Tool has neither durable suspension nor approved invocation"
        )
      }
    } else if (permission.status !== "allow" || tool === undefined) {
      return rejectedOutcomeFromExecution(request.call, receipt.execution, descriptor)
    }
    if (tool === undefined) {
      throw new Error("authorized tool definition is missing")
    }
    const executionId = receipt.execution.id
    const invocationAttemptId = receipt.invocationAttempt?.id
    if (invocationAttemptId === undefined) {
      throw new Error("running tool execution is missing its physical attempt")
    }
    let invocationStarted = false
    try {
      if (request.budget !== undefined) {
        await request.budget.storage.recordBudgetUsage({
          grantId: request.budget.grantId,
          usage: { toolCalls: 1 },
          source: "tool",
          sourceId: executionId,
          idempotencyKey: `tool:${request.sourceMessageId}:${request.call.toolCallId}`
        })
      }
      invocationStarted = true
      const invocation = await invokeWithControl(tool, request, executionId)
      const result = invocation.result
      if (result.toolCallId !== request.call.toolCallId) {
        throw new Error(
          `tool returned mismatched toolCallId: ${result.toolCallId}`
        )
      }
      if (result.outcome === "deferred") {
        if (descriptor.resultMode !== "deferred") {
          throw new Error(
            `immediate tool returned a deferred result: ${descriptor.name}`
          )
        }
        const deferred = await request.storage.deferToolExecution({
          sessionId: request.sessionId,
          turnId: request.turnId,
          sessionAttemptId: request.attemptId,
          inputId: request.inputId,
          sourceMessageId: request.sourceMessageId,
          sessionJobId: request.jobId,
          workerId: request.workerId,
          leaseToken: request.leaseToken,
          toolExecutionId: executionId,
          toolInvocationAttemptId: invocationAttemptId,
          toolCallId: request.call.toolCallId,
          operation: result.operation
        })
        return {
          state: "suspended",
          descriptor,
          permission,
          receipt: deferred,
          invoked: true
        }
      }
      if (descriptor.resultMode !== "immediate") {
        throw new Error(
          `deferred tool returned an immediate result: ${descriptor.name}`
        )
      }
      if (result.outcome === "ambiguous") {
        const recovery = await request.storage.requireToolExecutionRecovery({
          sessionId: request.sessionId,
          turnId: request.turnId,
          sessionAttemptId: request.attemptId,
          inputId: request.inputId,
          jobId: request.jobId,
          workerId: request.workerId,
          leaseToken: request.leaseToken,
          executionId,
          invocationAttemptId,
          evidence: {
            type: "ambiguous_tool_outcome",
            message: result.message,
            ...(result.reconciliationRef === undefined
              ? {}
              : { reconciliationRef: result.reconciliationRef }),
            ...(result.metadata === undefined ? {} : { metadata: result.metadata })
          }
        })
        if (recovery === null) {
          throw new ToolExecutionLeaseLostError()
        }
        return {
          state: "recovery_required",
          descriptor,
          permission,
          recovery,
          invoked: true
        }
      }
      const outcome = {
        state: "completed" as const,
        descriptor,
        permission,
        result: toolResultPart(
          result.toolCallId,
          result.content,
          result.outcome === "failed"
        ),
        invoked: true
      }
      if (invocation.controlObserved && result.outcome === "failed") {
        const reason = request.signal?.aborted === true ? "aborted" : "timed_out"
        await finishToolExecution(request, {
          ...finishIdentity(request, executionId, invocationAttemptId),
          state: "cancelled",
          error: { reason, message: "tool invocation ended during cancellation" }
        })
        return outcome
      }
      const resultPresentation =
        callPresentation === undefined
          ? undefined
          : presentToolResult(tool, request.call.input, result)
      await finishToolExecution(request, {
        ...finishIdentity(request, executionId, invocationAttemptId),
        state: result.outcome === "failed" ? "failed" : "succeeded",
        content: outcome.result.content,
        contentDigest: outcome.result.contentDigest,
        isError: result.outcome === "failed",
        ...(resultPresentation === undefined ? {} : { resultPresentation })
      })
      return outcome
    } catch (error) {
      if (error instanceof ToolExecutionLeaseLostError) throw error
      if (request.signal?.aborted === true || isControlError(error)) {
        const reason = request.signal?.aborted === true ? "aborted" : "timed_out"
        const failurePresentation =
          callPresentation === undefined || !invocationStarted
            ? undefined
            : presentToolFailure(
                tool,
                request.call.input,
                error,
                reason === "aborted" ? "cancelled" : "timed_out"
              )
        await finishToolExecution(request, {
          ...finishIdentity(request, executionId, invocationAttemptId),
          state: "cancelled",
          error: { reason, message: errorMessage(error) },
          ...(failurePresentation === undefined
            ? {}
            : { resultPresentation: failurePresentation })
        })
        const errorKind =
          request.signal?.aborted === true ? "tool_cancelled" : "tool_timeout"
        return {
          state: "completed",
          descriptor,
          permission,
          result: toolResultPart(
            request.call.toolCallId,
            jsonToolResultContent({ error: errorKind, message: errorMessage(error) }),
            true
          ),
          invoked: true
        }
      }
      const result = toolResultPart(
        request.call.toolCallId,
        jsonToolResultContent({
          error: "tool_exception",
          message: errorMessage(error)
        }),
        true
      )
      const failurePresentation =
        callPresentation === undefined || !invocationStarted
          ? undefined
          : presentToolFailure(
              tool,
              request.call.input,
              error,
              "exception"
            )
      await finishToolExecution(request, {
        ...finishIdentity(request, executionId, invocationAttemptId),
        state: "failed",
        content: result.content,
        contentDigest: result.contentDigest,
        isError: true,
        error: { error: "tool_exception", message: errorMessage(error) },
        ...(failurePresentation === undefined
          ? {}
          : { resultPresentation: failurePresentation })
      })
      return {
        state: "completed",
        descriptor,
        permission,
        result,
        invoked: invocationStarted
      }
    }
  }

  private validator(name: string, schema: ToolInputSchema): Promise<InputValidator> {
    let validator = this.validators.get(name)
    if (validator === undefined) {
      validator = compileInputValidator(schema)
      this.validators.set(name, validator)
    }
    return validator
  }
}

class ToolExecutionLeaseLostError extends Error {
  constructor() {
    super("tool execution lost its active physical attempt lease")
    this.name = "ToolExecutionLeaseLostError"
  }
}

async function finishToolExecution(
  request: ToolExecutionRequest,
  finish: import("@wanex/protocol").FinishToolExecutionRequest
): Promise<void> {
  if (await request.storage.finishToolExecution(finish) === null) {
    throw new ToolExecutionLeaseLostError()
  }
}

async function preflight(
  registry: ToolRegistry,
  tool: ToolDefinition | undefined,
  descriptor: ToolDescriptor,
  request: ToolExecutionRequest
): Promise<ToolPermissionDecision> {
  if (tool === undefined) return { status: "deny", reason: "tool_not_found" }
  const validator = await registry["validator"](tool.name, tool.inputSchema)
  if (!validator(request.call.input)) {
    return { status: "deny", reason: "invalid_tool_input" }
  }
  if (request.permissionPolicy === undefined) {
    return { status: "deny", reason: "permission_policy_missing" }
  }
  try {
    return validatePermissionDecision(await request.permissionPolicy.authorize({
      principalId: request.principalId,
      sessionId: request.sessionId,
      inputId: request.inputId,
      turnId: request.turnId,
      attemptId: request.attemptId,
      call: request.call,
      descriptor
    }))
  } catch (error) {
    return {
      status: "deny",
      reason: `permission_policy_error:${error instanceof Error ? error.message : String(error)}`
    }
  }
}

async function persistedPreflight(
  registry: ToolRegistry,
  tool: ToolDefinition | undefined,
  descriptor: ToolDescriptor,
  request: ToolExecutionRequest,
  existing: ToolExecutionRecord
): Promise<ToolPermissionDecision> {
  if (
    existing.turnId !== request.turnId ||
    existing.sourceMessageId !== request.sourceMessageId ||
    existing.toolCallId !== request.call.toolCallId ||
    existing.toolName !== request.call.toolName ||
    existing.principalId !== request.principalId
  ) {
    throw new Error("persisted tool execution does not match the exact call identity")
  }
  if (tool === undefined) {
    throw new Error(`persisted tool is no longer registered: ${request.call.toolName}`)
  }
  const validator = await registry["validator"](tool.name, tool.inputSchema)
  if (!validator(request.call.input)) {
    throw new Error(`persisted tool input no longer matches its schema: ${tool.name}`)
  }
  return permissionDecisionFromJson(existing.permission)
}

function permissionDecisionFromJson(value: JsonValue): ToolPermissionDecision {
  if (!isJsonRecord(value) || typeof value.reason !== "string") {
    throw new Error("persisted tool permission is invalid")
  }
  const authorizationRef = typeof value.authorizationRef === "string"
    ? value.authorizationRef
    : undefined
  if (value.status === "allow" || value.status === "deny") {
    return validatePermissionDecision({
      status: value.status,
      reason: value.reason,
      ...(authorizationRef === undefined ? {} : { authorizationRef })
    })
  }
  if (value.status !== "approval_required" || !isJsonRecord(value.presentation)) {
    throw new Error("persisted tool permission status is invalid")
  }
  const summary = value.presentation.summary
  const detailsValue = value.presentation.details
  if (typeof summary !== "string") {
    throw new Error("persisted tool approval presentation is invalid")
  }
  const details = detailsValue === undefined
    ? undefined
    : Array.isArray(detailsValue)
      ? detailsValue.map((detail) => {
          if (
            !isJsonRecord(detail) ||
            typeof detail.label !== "string" ||
            typeof detail.value !== "string"
          ) {
            throw new Error("persisted tool approval detail is invalid")
          }
          return { label: detail.label, value: detail.value }
        })
      : (() => { throw new Error("persisted tool approval details are invalid") })()
  return validatePermissionDecision({
    status: "approval_required",
    reason: value.reason,
    presentation: {
      summary,
      ...(details === undefined ? {} : { details })
    },
    ...(authorizationRef === undefined ? {} : { authorizationRef })
  })
}

function validatePermissionDecision(
  decision: ToolPermissionDecision
): ToolPermissionDecision {
  if (utf8Length(decision.reason) < 1 || utf8Length(decision.reason) > 1_024) {
    throw new Error("tool permission reason must contain 1 to 1024 UTF-8 bytes")
  }
  if (decision.status !== "approval_required") return decision
  const { summary, details = [] } = decision.presentation
  if (utf8Length(summary) < 1 || utf8Length(summary) > 512) {
    throw new Error("tool approval summary must contain 1 to 512 UTF-8 bytes")
  }
  if (details.length > 16) {
    throw new Error("tool approval details exceed 16 rows")
  }
  for (const detail of details) {
    if (
      utf8Length(detail.label) < 1 || utf8Length(detail.label) > 128 ||
      utf8Length(detail.value) < 1 || utf8Length(detail.value) > 1_024
    ) {
      throw new Error("tool approval detail is invalid or exceeds its bound")
    }
  }
  return decision
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8")
}

function isJsonRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function recoverOrReuse(
  request: ToolExecutionRequest,
  descriptor: ToolDescriptor,
  permission: ToolPermissionDecision,
  receipt: import("@wanex/protocol").BeginToolExecutionReceipt
): ToolExecutionOutcome | undefined {
  const execution = receipt.execution
  if (execution.state === "running") {
    if (
      receipt.invocationAttempt?.sessionAttemptId === request.attemptId &&
      receipt.invocationAttempt.workerId === request.workerId &&
      execution.currentInvocationAttemptId === receipt.invocationAttempt.id
    ) {
      return undefined
    }
    throw new Error(
      "tool execution has no classifier-authorized physical attempt for this turn owner"
    )
  }
  if (execution.state === "succeeded" || execution.state === "failed") {
    if (execution.content === undefined || execution.contentDigest === undefined) {
      throw new Error(`settled tool execution has no canonical content: ${execution.id}`)
    }
    const result = toolResultPart(
      execution.toolCallId,
      execution.content,
      execution.isError ?? execution.state === "failed"
    )
    if (result.contentDigest !== execution.contentDigest) {
      throw new Error(`settled tool execution content digest changed: ${execution.id}`)
    }
    return {
      state: "completed",
      descriptor,
      permission,
      result,
      invoked: false
    }
  }
  if (execution.state === "denied") {
    return rejectedOutcomeFromExecution(request.call, execution, descriptor)
  }
  if (execution.state === "recovery_required") {
    throw new Error(`tool execution requires reconciliation: ${execution.id}`)
  }
  if (execution.state === "approval_required") {
    throw new Error(
      `approval-required tool execution resumed without a durable decision: ${execution.id}`
    )
  }
  throw new Error(
    `tool execution is not reusable from state ${execution.state}: ${execution.id}`
  )
}

function rejectedOutcomeFromExecution(
  call: ToolCallMessagePart,
  execution: import("@wanex/protocol").ToolExecutionRecord,
  descriptor?: ToolDescriptor
): ToolExecutionOutcome {
  if (
    execution.state !== "denied" ||
    execution.content === undefined ||
    execution.contentDigest === undefined
  ) {
    throw new Error(
      `denied tool execution has no canonical content: ${execution.id}`
    )
  }
  const result = toolResultPart(
    call.toolCallId,
    execution.content,
    true
  )
  if (result.contentDigest !== execution.contentDigest) {
    throw new Error(
      `denied tool execution content digest changed: ${execution.id}`
    )
  }
  const persistedPermission = permissionDecisionFromJson(execution.permission)
  return {
    state: "completed",
    ...(descriptor === undefined ? {} : { descriptor }),
    permission: persistedPermission.status === "approval_required"
      ? {
          status: "deny",
          reason: "approval_denied",
          ...(persistedPermission.authorizationRef === undefined
            ? {}
            : { authorizationRef: persistedPermission.authorizationRef })
        }
      : persistedPermission,
    result,
    invoked: false
  }
}

function finishIdentity(
  request: ToolExecutionRequest,
  executionId: string,
  invocationAttemptId: string
) {
  return {
    sessionId: request.sessionId,
    turnId: request.turnId,
    sessionAttemptId: request.attemptId,
    inputId: request.inputId,
    jobId: request.jobId,
    workerId: request.workerId,
    leaseToken: request.leaseToken,
    executionId,
    invocationAttemptId
  }
}

async function invokeWithControl(
  tool: ToolDefinition,
  request: ToolExecutionRequest,
  executionId: string
): Promise<{
  readonly result: import("./types.js").ToolExecutionResult
  readonly controlObserved: boolean
}> {
  if (request.timeoutMs !== undefined && request.timeoutMs <= 0) {
    throw new Error("tool timeoutMs must be positive")
  }
  const controller = request.timeoutMs === undefined
    ? undefined
    : new AbortController()
  const signal = controller?.signal ?? request.signal
  let timeout: NodeJS.Timeout | undefined
  let removeParentAbort: (() => void) | undefined
  let removeInvocationAbort: (() => void) | undefined

  if (controller !== undefined && request.signal !== undefined) {
    const abortFromParent = (): void => controller.abort()
    request.signal.addEventListener("abort", abortFromParent, { once: true })
    removeParentAbort = () => request.signal?.removeEventListener("abort", abortFromParent)
  }

  const invocation = tool.invoke({
    principalId: request.principalId,
    sessionId: request.sessionId,
    inputId: request.inputId,
    turnId: request.turnId,
    attemptId: request.attemptId,
    toolCallId: request.call.toolCallId,
    toolName: request.call.toolName,
    input: request.call.input,
    idempotencyKey: request.idempotencyKey,
    capabilityRoutes: [],
    resources: createToolResourceOutputPort(request.storage, {
      executionId,
      principalId: request.principalId,
      sessionId: request.sessionId,
      inputId: request.inputId,
      turnId: request.turnId,
      attemptId: request.attemptId,
      sourceMessageId: request.sourceMessageId,
      toolCallId: request.call.toolCallId
    }),
    ...(signal === undefined ? {} : { signal })
  })
  const completed = invocation.then((result) => ({
    result,
    controlObserved: false
  }))
  const candidates: Array<Promise<{
    readonly result: import("./types.js").ToolExecutionResult
    readonly controlObserved: boolean
  }>> = [completed]

  if (signal !== undefined) {
    candidates.push(new Promise((_, reject) => {
      const onAbort = (): void => reject(toolInvocationControlError())
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener("abort", onAbort, { once: true })
        removeInvocationAbort = () => signal.removeEventListener("abort", onAbort)
      }
    }))
  }
  if (request.timeoutMs !== undefined) {
    timeout = setTimeout(() => controller?.abort(), request.timeoutMs)
  }

  try {
    return await Promise.race(candidates)
  } catch (error) {
    if (isControlError(error)) {
      try {
        return {
          result: await invocation,
          controlObserved: true
        }
      } catch {
        throw error
      }
    }
    throw error
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
    removeParentAbort?.()
    removeInvocationAbort?.()
  }
}

function toolInvocationControlError(): Error {
  const error = new Error("tool invocation cancelled or timed out")
  error.name = "WanexToolInvocationControlError"
  return error
}

function isControlError(error: unknown): boolean {
  return error instanceof Error && error.name === "WanexToolInvocationControlError"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unknownToolDescriptor(name: string): ToolDescriptor {
  return {
    name,
    description: "Unregistered tool selected by provider.",
    inputSchema: { type: "object" },
    risk: "external",
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate"
  }
}

function jsonClone(value: unknown): import("@wanex/protocol").JsonValue {
  return JSON.parse(JSON.stringify(value)) as import("@wanex/protocol").JsonValue
}

function validateDescriptor(tool: ToolDefinition): void {
  assertToolRuntimeBinding(tool.runtimeBinding)
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tool.name)) {
    throw new Error(`invalid tool name: ${tool.name}`)
  }
  if (tool.description.trim().length === 0) {
    throw new Error(`tool description must not be empty: ${tool.name}`)
  }
  if (tool.inputSchema.type !== "object") {
    throw new Error(`tool input schema must have an object root: ${tool.name}`)
  }
  if (
    tool.risk !== "read_only" &&
    tool.risk !== "mutating" &&
    tool.risk !== "external"
  ) {
    throw new Error(`invalid tool risk: ${tool.name}`)
  }
  if (tool.concurrency !== "parallel_safe" && tool.concurrency !== "exclusive") {
    throw new Error(`invalid tool concurrency: ${tool.name}`)
  }
  if (tool.resultMode !== "immediate" && tool.resultMode !== "deferred") {
    throw new Error(`invalid tool result mode: ${tool.name}`)
  }
  if (tool.resultMode === "deferred" && tool.concurrency !== "exclusive") {
    throw new Error(`deferred tool must be exclusive: ${tool.name}`)
  }
  if (tool.resultMode === "deferred" && !tool.idempotent) {
    throw new Error(`deferred tool must be idempotent: ${tool.name}`)
  }
  if (tool.risk === "mutating" && tool.concurrency === "parallel_safe") {
    throw new Error(`mutating tool cannot be parallel_safe: ${tool.name}`)
  }
  if (tool.presentResult !== undefined && tool.presentCall === undefined) {
    throw new Error(`tool result presentation requires presentCall: ${tool.name}`)
  }
  if (tool.presentFailure !== undefined && tool.presentCall === undefined) {
    throw new Error(`tool failure presentation requires presentCall: ${tool.name}`)
  }
  const capabilityKeys = new Set<string>()
  if ((tool.requiredCapabilities?.length ?? 0) > 16) {
    throw new Error(`tool capability requirements exceed 16: ${tool.name}`)
  }
  for (const requirement of tool.requiredCapabilities ?? []) {
    const normalized = normalizeModelCapabilityRequirement(requirement)
    if (normalized.operation === "conversation") {
      throw new Error(
        `tool capability requirement cannot select conversation: ${tool.name}`
      )
    }
    const key = modelCapabilityRequirementKey(normalized)
    if (capabilityKeys.has(key)) {
      throw new Error(`duplicate tool capability requirement: ${tool.name}`)
    }
    capabilityKeys.add(key)
  }
  canonicalizeToolEvidence(projectDescriptor(tool), `tool descriptor ${tool.name}`)
}

function projectBindingEvidence(tool: ToolDefinition): ToolBindingEvidence {
  return canonicalizeToolEvidence({
    descriptor: projectDescriptor(tool),
    runtimeBinding: tool.runtimeBinding
  }, `tool binding ${tool.name}`) as unknown as ToolBindingEvidence
}

function normalizeToolDefinition(tool: ToolDefinition): ToolDefinition {
  const evidence = projectBindingEvidence(tool)
  const descriptor = deepFreeze(evidence.descriptor)
  const runtimeBinding = deepFreeze(evidence.runtimeBinding)
  return Object.freeze({
    ...descriptor,
    runtimeBinding,
    ...(tool.presentCall === undefined
      ? {}
      : { presentCall: tool.presentCall.bind(tool) }),
    ...(tool.presentResult === undefined
      ? {}
      : { presentResult: tool.presentResult.bind(tool) }),
    ...(tool.presentFailure === undefined
      ? {}
      : { presentFailure: tool.presentFailure.bind(tool) }),
    invoke: tool.invoke.bind(tool)
  })
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}

function executionDescriptor(
  descriptor: ToolDescriptor,
  runtimeBinding: ToolDefinition["runtimeBinding"]
): ToolDescriptor & { readonly runtimeBinding: ToolDefinition["runtimeBinding"] } {
  return { ...descriptor, runtimeBinding }
}

function projectDescriptor(tool: ToolDefinition): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    risk: tool.risk,
    idempotent: tool.idempotent,
    concurrency: tool.concurrency,
    resultMode: tool.resultMode,
    ...(tool.requiredCapabilities === undefined
      ? {}
      : {
          requiredCapabilities: tool.requiredCapabilities
            .map(normalizeModelCapabilityRequirement)
            .sort((left, right) =>
              modelCapabilityRequirementKey(left).localeCompare(
                modelCapabilityRequirementKey(right)
              )
            )
        }),
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations })
  }
}

function rejectedOutcome(
  call: ToolCallMessagePart,
  permission: ToolPermissionDecision,
  descriptor?: ToolDescriptor,
  detail: Record<string, unknown> = {}
): ToolExecutionOutcome {
  return {
    state: "completed",
    ...(descriptor === undefined ? {} : { descriptor }),
    permission,
    result: toolResultPart(
      call.toolCallId,
      jsonToolResultContent({
        error: permission.reason,
        toolName: call.toolName,
        ...detail
      } as import("@wanex/protocol").JsonValue),
      true
    ),
    invoked: false
  }
}

async function compileInputValidator(
  schema: ToolInputSchema
): Promise<InputValidator> {
  const imported = await import("ajv")
  const candidate = imported.default as unknown
  const Ajv = (
    typeof candidate === "object" &&
    candidate !== null &&
    "default" in candidate
      ? candidate.default
      : candidate
  ) as new (options: {
    readonly allErrors: boolean
    readonly strict: boolean
  }) => { compile(schema: ToolInputSchema): InputValidator }
  const ajv = new Ajv({ allErrors: true, strict: true })
  return ajv.compile(schema) as InputValidator
}

function throwIfToolInvocationAborted(signal: ToolExecutionRequest["signal"]): void {
  if (signal?.aborted !== true) {
    return
  }
  const error = new Error("tool invocation aborted")
  error.name = "WanexToolAbortError"
  throw error
}
