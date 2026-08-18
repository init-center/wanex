import { createHash } from "node:crypto"
import type {
  JsonValue,
  MessagePart,
  SessionInputOrigin,
  SessionTurnExecutionBinding,
  TeamParticipantRecord
} from "@wanex/protocol"
import {
  createToolRuntimeBinding,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInvocation
} from "@wanex/runtime/tools"

export const TEAM_DELEGATE_TOOL_NAME = "team_delegate" as const
export const TEAM_DELEGATE_TOOL_IMPLEMENTATION_ID =
  "wanex.team.tool.delegate" as const
export const TEAM_DELEGATE_TOOL_IMPLEMENTATION_REVISION = "1" as const
export const TEAM_DELEGATE_TASK_CAP = 8
export const TEAM_DELEGATE_PROMPT_MAX_BYTES = 32 * 1024

const TASK_KEY_MAX_LENGTH = 64
const IDENTITY_MAX_LENGTH = 512

export interface PrepareTeamDelegationExecutionBindingRequest {
  readonly participant: TeamParticipantRecord
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly content: readonly MessagePart[]
  readonly origin: SessionInputOrigin
}

export interface CreateTeamDelegateToolOptions {
  readonly conversationId: string
  readonly deliveryId: string
  readonly leadParticipantId: string
  readonly participants: readonly TeamParticipantRecord[]
  readonly maxSteps?: number
  readonly priority?: number
  prepareExecutionBinding(
    request: PrepareTeamDelegationExecutionBindingRequest
  ): Promise<SessionTurnExecutionBinding>
}

interface TeamDelegateTaskInput {
  readonly key: string
  readonly targetParticipantId: string
  readonly prompt: string
  readonly dependsOn: readonly string[]
}

interface TeamDelegateInput {
  readonly tasks: readonly TeamDelegateTaskInput[]
}

interface PlannedTeamDelegateTask extends TeamDelegateTaskInput {
  readonly participant: TeamParticipantRecord
  readonly taskId: string
  readonly graphNodeId: string
  readonly childInputId: string
  readonly childTurnId: string
  readonly childJobId: string
  readonly inputIdempotencyKey: string
  readonly jobIdempotencyKey: string
}

export function createTeamDelegateTool(
  options: CreateTeamDelegateToolOptions
): ToolDefinition {
  const conversationId = requireIdentity(
    options.conversationId,
    "Team delegation conversation id"
  )
  const deliveryId = requireIdentity(
    options.deliveryId,
    "Team delegation delivery id"
  )
  const leadParticipantId = requireIdentity(
    options.leadParticipantId,
    "Team delegation lead participant id"
  )
  const participants = normalizeParticipants(options.participants, leadParticipantId)
  const participantIds = participants.map((participant) => participant.id)
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant] as const)
  )
  const maxSteps = normalizeOptionalPositiveInteger(options.maxSteps, "maxSteps")
  const priority = normalizeOptionalInteger(options.priority, "priority")
  const runtimeBinding = createToolRuntimeBinding({
    implementationId: TEAM_DELEGATE_TOOL_IMPLEMENTATION_ID,
    implementationRevision: TEAM_DELEGATE_TOOL_IMPLEMENTATION_REVISION,
    configuration: {
      conversationId,
      deliveryId,
      leadParticipantId,
      participants: participants.map((participant) => ({
        participantId: participant.id,
        sessionId: participant.agentSessionId!
      })),
      taskCap: TEAM_DELEGATE_TASK_CAP,
      promptMaxBytes: TEAM_DELEGATE_PROMPT_MAX_BYTES,
      ...(maxSteps === undefined ? {} : { maxSteps }),
      ...(priority === undefined ? {} : { priority })
    }
  })
  const inputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        minItems: 1,
        maxItems: TEAM_DELEGATE_TASK_CAP,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "targetParticipantId", "prompt"],
          properties: {
            key: {
              type: "string",
              minLength: 1,
              maxLength: TASK_KEY_MAX_LENGTH
            },
            targetParticipantId: {
              type: "string",
              enum: participantIds
            },
            prompt: {
              type: "string",
              minLength: 1,
              maxLength: TEAM_DELEGATE_PROMPT_MAX_BYTES
            },
            dependsOn: {
              type: "array",
              maxItems: TEAM_DELEGATE_TASK_CAP - 1,
              uniqueItems: true,
              items: {
                type: "string",
                minLength: 1,
                maxLength: TASK_KEY_MAX_LENGTH
              }
            }
          }
        }
      }
    }
  } as const

  return Object.freeze({
    name: TEAM_DELEGATE_TOOL_NAME,
    description:
      "Delegate bounded, non-overlapping work to active agents in this orchestrated Team conversation.",
    inputSchema,
    risk: "external",
    idempotent: true,
    concurrency: "exclusive",
    resultMode: "deferred",
    annotations: {
      title: "Delegate Team work",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    runtimeBinding,
    presentCall() {
      return { summary: "Delegate Team work" }
    },
    async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
      const input = parseTeamDelegateInput(invocation.input, participantById)
      const operationDigest = stableDigest([
        conversationId,
        deliveryId,
        invocation.turnId,
        invocation.toolCallId,
        invocation.idempotencyKey
      ])
      const operationId = `teamop_${operationDigest}`
      const graphId = `dgraph_team_${operationDigest}`
      const planned = input.tasks.map((task) => {
        const participant = participantById.get(task.targetParticipantId)
        if (participant === undefined || participant.agentSessionId === undefined) {
          throw new Error(
            `Team delegation target is no longer available: ${task.targetParticipantId}`
          )
        }
        const taskDigest = stableDigest([operationDigest, task.key])
        return {
          ...task,
          participant,
          taskId: `teamtask_${taskDigest}`,
          graphNodeId: `dnode_team_${taskDigest}`,
          childInputId: `inp_team_delegation_${taskDigest}`,
          childTurnId: `turn_team_delegation_${taskDigest}`,
          childJobId: `job_team_delegation_${taskDigest}`,
          inputIdempotencyKey: `team-delegation:${operationDigest}:${taskDigest}:input`,
          jobIdempotencyKey: `team-delegation:${operationDigest}:${taskDigest}:job`
        } satisfies PlannedTeamDelegateTask
      })
      const taskIdByKey = new Map(
        planned.map((task) => [task.key, task.taskId] as const)
      )
      const tasks = await Promise.all(
        planned.map(async (task) => {
          const content = delegatedContent(task.taskId, task.prompt)
          const origin = delegatedOrigin({
            conversationId,
            deliveryId,
            operationId,
            taskId: task.taskId,
            targetParticipantId: task.targetParticipantId,
            leadParticipantId
          })
          const executionBinding = await options.prepareExecutionBinding({
            participant: task.participant,
            sessionId: task.participant.agentSessionId!,
            inputId: task.childInputId,
            turnId: task.childTurnId,
            content,
            origin
          })
          return {
            id: task.taskId,
            graphNodeId: task.graphNodeId,
            targetParticipantId: task.targetParticipantId,
            targetSessionId: task.participant.agentSessionId!,
            prompt: task.prompt,
            dependsOnTaskIds: task.dependsOn.map((key) => {
              const taskId = taskIdByKey.get(key)
              if (taskId === undefined) {
                throw new Error(`Team delegation dependency is missing: ${key}`)
              }
              return taskId
            }),
            childInputId: task.childInputId,
            childTurnId: task.childTurnId,
            childJobId: task.childJobId,
            inputIdempotencyKey: task.inputIdempotencyKey,
            jobIdempotencyKey: task.jobIdempotencyKey,
            executionBinding,
            ...(maxSteps === undefined ? {} : { maxSteps }),
            ...(priority === undefined ? {} : { priority })
          }
        })
      )
      return {
        outcome: "deferred",
        toolCallId: invocation.toolCallId,
        operation: {
          kind: "team_delegation",
          operationId,
          conversationId,
          sourceDeliveryId: deliveryId,
          leadParticipantId,
          graphId,
          tasks
        }
      }
    }
  })
}

export function delegatedContent(
  taskId: string,
  prompt: string
): readonly MessagePart[] {
  return Object.freeze([
    Object.freeze({
      type: "text" as const,
      id: `part_team_delegation_${taskId}`,
      text: prompt
    })
  ])
}

export function delegatedOrigin(request: {
  readonly conversationId: string
  readonly deliveryId: string
  readonly operationId: string
  readonly taskId: string
  readonly targetParticipantId: string
  readonly leadParticipantId: string
}): SessionInputOrigin {
  return Object.freeze({
    kind: "agent",
    sourceRef: request.deliveryId,
    parentRef: request.operationId,
    metadata: Object.freeze({
      teamConversationId: request.conversationId,
      teamDelegationOperationId: request.operationId,
      teamDelegationTaskId: request.taskId,
      sourceTeamDeliveryId: request.deliveryId,
      targetParticipantId: request.targetParticipantId,
      leadParticipantId: request.leadParticipantId
    })
  })
}

function parseTeamDelegateInput(
  value: JsonValue,
  participants: ReadonlyMap<string, TeamParticipantRecord>
): TeamDelegateInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Team delegation input must be an object")
  }
  const record = value as Readonly<Record<string, JsonValue>>
  if (Object.keys(record).some((key) => key !== "tasks")) {
    throw new Error("Team delegation input contains unsupported fields")
  }
  if (
    !Array.isArray(record.tasks) ||
    record.tasks.length === 0 ||
    record.tasks.length > TEAM_DELEGATE_TASK_CAP
  ) {
    throw new Error(
      `Team delegation requires 1 to ${TEAM_DELEGATE_TASK_CAP} tasks`
    )
  }
  const keys = new Set<string>()
  const targets = new Set<string>()
  const tasks = record.tasks.map((candidate, index) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new Error(`Team delegation task ${index + 1} must be an object`)
    }
    const task = candidate as Readonly<Record<string, JsonValue>>
    if (
      Object.keys(task).some(
        (key) =>
          key !== "key" &&
          key !== "targetParticipantId" &&
          key !== "prompt" &&
          key !== "dependsOn"
      )
    ) {
      throw new Error(`Team delegation task ${index + 1} has unsupported fields`)
    }
    const key = boundedString(task.key, TASK_KEY_MAX_LENGTH, "task key")
    const targetParticipantId = boundedString(
      task.targetParticipantId,
      IDENTITY_MAX_LENGTH,
      "target participant id"
    )
    const prompt = boundedUtf8String(
      task.prompt,
      TEAM_DELEGATE_PROMPT_MAX_BYTES,
      "task prompt"
    )
    if (keys.has(key)) throw new Error(`Duplicate Team delegation task key: ${key}`)
    keys.add(key)
    if (targets.has(targetParticipantId)) {
      throw new Error(
        `Duplicate Team delegation target participant: ${targetParticipantId}`
      )
    }
    targets.add(targetParticipantId)
    if (!participants.has(targetParticipantId)) {
      throw new Error(`Unavailable Team delegation target: ${targetParticipantId}`)
    }
    const dependsOnValue = task.dependsOn ?? []
    if (!Array.isArray(dependsOnValue) || dependsOnValue.length >= TEAM_DELEGATE_TASK_CAP) {
      throw new Error(`Team delegation task ${key} has invalid dependencies`)
    }
    const dependencySet = new Set<string>()
    const dependsOn = dependsOnValue.map((dependency) => {
      const value = boundedString(
        dependency,
        TASK_KEY_MAX_LENGTH,
        "dependency key"
      )
      if (value === key || dependencySet.has(value)) {
        throw new Error(`Team delegation task ${key} has an invalid dependency`)
      }
      dependencySet.add(value)
      return value
    })
    return Object.freeze({ key, targetParticipantId, prompt, dependsOn })
  })
  validateDependencyDag(tasks)
  return Object.freeze({ tasks: Object.freeze(tasks) })
}

function validateDependencyDag(tasks: readonly TeamDelegateTaskInput[]): void {
  const keys = new Set(tasks.map((task) => task.key))
  const indegree = new Map<string, number>(
    tasks.map((task) => [task.key, 0])
  )
  const adjacency = new Map<string, string[]>()
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!keys.has(dependency)) {
        throw new Error(
          `Team delegation task ${task.key} references unknown dependency ${dependency}`
        )
      }
      indegree.set(task.key, (indegree.get(task.key) ?? 0) + 1)
      const dependents = adjacency.get(dependency) ?? []
      dependents.push(task.key)
      adjacency.set(dependency, dependents)
    }
  }
  const queue = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([key]) => key)
  let visited = 0
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index]!
    visited += 1
    for (const dependent of adjacency.get(key) ?? []) {
      const degree = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, degree)
      if (degree === 0) queue.push(dependent)
    }
  }
  if (visited !== tasks.length) {
    throw new Error("Team delegation dependencies must form a DAG")
  }
}

function normalizeParticipants(
  participants: readonly TeamParticipantRecord[],
  leadParticipantId: string
): readonly TeamParticipantRecord[] {
  const ids = new Set<string>()
  const sessions = new Set<string>()
  const normalized = participants.map((participant) => {
    if (
      participant.id === leadParticipantId ||
      participant.kind !== "agent" ||
      participant.state !== "active" ||
      participant.agentSessionId === undefined
    ) {
      throw new Error("Team delegation choices must be active non-lead agents")
    }
    if (ids.has(participant.id) || sessions.has(participant.agentSessionId)) {
      throw new Error("Team delegation choices must have unique participants and sessions")
    }
    ids.add(participant.id)
    sessions.add(participant.agentSessionId)
    return participant
  })
  if (normalized.length === 0) {
    throw new Error("Team delegation requires at least one available target agent")
  }
  return Object.freeze(normalized)
}

function boundedString(value: JsonValue | undefined, maximum: number, label: string): string {
  if (typeof value !== "string") throw new Error(`Team delegation ${label} must be a string`)
  const normalized = value.trim()
  if (normalized.length === 0 || [...normalized].length > maximum) {
    throw new Error(`Team delegation ${label} must contain 1 to ${maximum} characters`)
  }
  return normalized
}

function boundedUtf8String(
  value: JsonValue | undefined,
  maximum: number,
  label: string
): string {
  if (typeof value !== "string") throw new Error(`Team delegation ${label} must be a string`)
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    new TextEncoder().encode(normalized).byteLength > maximum
  ) {
    throw new Error(`Team delegation ${label} must contain 1 to ${maximum} UTF-8 bytes`)
  }
  return normalized
}

function requireIdentity(value: string, label: string): string {
  if (value.trim().length === 0 || value.length > IDENTITY_MAX_LENGTH) {
    throw new Error(`${label} must contain 1 to ${IDENTITY_MAX_LENGTH} characters`)
  }
  return value
}

function normalizeOptionalPositiveInteger(
  value: number | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000) {
    throw new Error(`Team delegation ${label} must be an integer between 1 and 10000`)
  }
  return value
}

function normalizeOptionalInteger(
  value: number | undefined,
  label: string
): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Team delegation ${label} must be a safe integer`)
  }
  return value
}

function stableDigest(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex")
}
