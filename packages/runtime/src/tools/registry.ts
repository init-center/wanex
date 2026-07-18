import type { ToolCallMessagePart } from "@wanex/protocol"
import { toolResultPart } from "./parts.js"
import type {
  ToolDefinition,
  ToolDescriptor,
  ToolExecutionOutcome,
  ToolExecutionRequest,
  ToolInputSchema,
  ToolPermissionDecision
} from "./types.js"

type InputValidator = ((value: unknown) => boolean) & {
  readonly errors?: unknown
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()
  private readonly validators = new Map<string, Promise<InputValidator>>()

  register(tool: ToolDefinition): void {
    validateDescriptor(tool)
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()]
      .map(projectDescriptor)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionOutcome> {
    throwIfToolInvocationAborted(request.signal)
    const tool = this.tools.get(request.call.toolName)
    const descriptor = tool === undefined
      ? unknownToolDescriptor(request.call.toolName)
      : projectDescriptor(tool)
    const permission = await preflight(this, tool, descriptor, request)
    const receipt = await request.storage.beginToolExecution({
      sessionId: request.sessionId,
      runId: request.runId,
      inputId: request.inputId,
      principalId: request.principalId,
      toolCallId: request.call.toolCallId,
      toolName: request.call.toolName,
      input: request.call.input,
      descriptor: jsonClone(descriptor),
      permission: jsonClone(permission),
      idempotencyKey: request.idempotencyKey
    })
    if (!receipt.created) {
      const reused = await recoverOrReuse(request, descriptor, permission, receipt.execution)
      if (reused !== undefined) return reused
    }
    if (permission.status !== "allow" || tool === undefined) {
      return rejectedOutcome(request.call, permission, descriptor)
    }
    const executionId = receipt.execution.id
    let invocationStarted = false
    try {
      if (request.budget !== undefined) {
        await request.budget.storage.recordBudgetUsage({
          grantId: request.budget.grantId,
          usage: { toolCalls: 1 },
          source: "tool",
          sourceId: executionId,
          idempotencyKey: `tool:${request.runId}:${request.call.toolCallId}`
        })
      }
      invocationStarted = true
      const result = await invokeWithControl(tool, request)
      throwIfToolInvocationAborted(request.signal)
      if (result.toolCallId !== request.call.toolCallId) {
        throw new Error(
          `tool returned mismatched toolCallId: ${result.toolCallId}`
        )
      }
      const outcome = {
        descriptor,
        permission,
        result: toolResultPart(result.toolCallId, result.result, result.isError),
        invoked: true
      }
      await request.storage.finishToolExecution({
        executionId,
        state: result.isError ? "failed" : "succeeded",
        result: result.result,
        isError: result.isError
      })
      return outcome
    } catch (error) {
    if (request.signal?.aborted === true || isControlError(error)) {
        const reason = request.signal?.aborted === true ? "aborted" : "timed_out"
        await request.storage.finishToolExecution({
          executionId,
          state: "cancelled",
          error: { reason, message: errorMessage(error) }
        })
        if (request.signal?.aborted === true) {
          throwIfToolInvocationAborted(request.signal)
        }
        return {
          descriptor,
          permission,
          result: toolResultPart(
            request.call.toolCallId,
            { error: "tool_timeout", message: errorMessage(error) },
            true
          ),
          invoked: true
        }
      }
      const result = toolResultPart(
        request.call.toolCallId,
        {
          error: "tool_exception",
          message: errorMessage(error)
        },
        true
      )
      await request.storage.finishToolExecution({
        executionId,
        state: "failed",
        result: result.result,
        isError: true,
        error: result.result
      })
      return {
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
    return await request.permissionPolicy.authorize({
      principalId: request.principalId,
      sessionId: request.sessionId,
      inputId: request.inputId,
      runId: request.runId,
      call: request.call,
      descriptor
    })
  } catch (error) {
    return {
      status: "deny",
      reason: `permission_policy_error:${error instanceof Error ? error.message : String(error)}`
    }
  }
}

async function recoverOrReuse(
  request: ToolExecutionRequest,
  descriptor: ToolDescriptor,
  permission: ToolPermissionDecision,
  execution: import("@wanex/protocol").ToolExecutionRecord
): Promise<ToolExecutionOutcome | undefined> {
  if (execution.state === "running") {
    if (
      descriptor.idempotent &&
      request.recoveryPolicy !== undefined &&
      await request.recoveryPolicy.retryIdempotent({ execution, descriptor })
    ) {
      await request.storage.recoverToolExecution({
        executionId: execution.id,
        action: "retry"
      })
      return undefined
    }
    await request.storage.recoverToolExecution({
      executionId: execution.id,
      action: "require_recovery"
    })
    return rejectedOutcome(
      request.call,
      { status: "deny", reason: "recovery_required" },
      descriptor
    )
  }
  if (execution.state === "succeeded" || execution.state === "failed") {
    return {
      descriptor,
      permission,
      result: toolResultPart(
        execution.toolCallId,
        execution.result ?? execution.error ?? null,
        execution.isError ?? execution.state === "failed"
      ),
      invoked: false
    }
  }
  return rejectedOutcome(
    request.call,
    {
      status: execution.state === "approval_required" ? "approval_required" : "deny",
      reason: execution.state
    },
    descriptor
  )
}

async function invokeWithControl(
  tool: ToolDefinition,
  request: ToolExecutionRequest
): Promise<import("./types.js").ToolExecutionResult> {
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
    runId: request.runId,
    toolCallId: request.call.toolCallId,
    toolName: request.call.toolName,
    input: request.call.input,
    idempotencyKey: request.idempotencyKey,
    ...(signal === undefined ? {} : { signal })
  })
  const candidates: Array<Promise<import("./types.js").ToolExecutionResult>> = [invocation]

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
    if (
      isControlError(error) &&
      tool.drainsCancellation
    ) {
      await invocation.catch(() => {})
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
    idempotent: false
  }
}

function jsonClone(value: unknown): import("@wanex/protocol").JsonValue {
  return JSON.parse(JSON.stringify(value)) as import("@wanex/protocol").JsonValue
}

function validateDescriptor(tool: ToolDefinition): void {
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
}

function projectDescriptor(tool: ToolDefinition): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    risk: tool.risk,
    idempotent: tool.idempotent,
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
    ...(descriptor === undefined ? {} : { descriptor }),
    permission,
    result: toolResultPart(
      call.toolCallId,
      {
        error: permission.reason,
        toolName: call.toolName,
        ...detail
      },
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
