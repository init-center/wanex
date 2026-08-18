import type { JsonValue } from "@wanex/protocol"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInvocation
} from "@wanex/runtime/tools"

export const TEAM_PASS_TOOL_NAME = "team_pass" as const
export const TEAM_PASS_TOOL_IMPLEMENTATION_ID = "wanex.team.tool.pass" as const
export const TEAM_PASS_TOOL_IMPLEMENTATION_REVISION = "1" as const
export const TEAM_PASS_REASON_MAX_LENGTH = 1_024

export interface CreateTeamPassToolOptions {
  readonly deliveryId: string
}

export interface TeamPassToolInput {
  readonly deliveryId: string
  readonly reason?: string
}

export function createTeamPassTool(
  options: CreateTeamPassToolOptions
): ToolDefinition {
  const deliveryId = requireIdentity(options.deliveryId, "Team pass delivery id")
  const runtimeBinding = createToolRuntimeBinding({
    implementationId: TEAM_PASS_TOOL_IMPLEMENTATION_ID,
    implementationRevision: TEAM_PASS_TOOL_IMPLEMENTATION_REVISION,
    configuration: { deliveryId }
  })
  const inputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["deliveryId"],
    properties: {
      deliveryId: { type: "string", const: deliveryId },
      reason: {
        type: "string",
        minLength: 1,
        maxLength: TEAM_PASS_REASON_MAX_LENGTH
      }
    }
  } as const
  return Object.freeze({
    name: TEAM_PASS_TOOL_NAME,
    description: "Decline this Team delivery when no useful reply should be added.",
    inputSchema,
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    runtimeBinding,
    async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
      const input = parseTeamPassInput(invocation.input, deliveryId)
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          kind: "team.pass",
          deliveryId,
          ...(input.reason === undefined ? {} : { reason: input.reason })
        })
      }
    }
  })
}

function parseTeamPassInput(
  value: JsonValue,
  expectedDeliveryId: string
): TeamPassToolInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Team pass input must be an object")
  }
  const input = value as Readonly<Record<string, JsonValue>>
  const keys = Object.keys(input)
  if (keys.some((key) => key !== "deliveryId" && key !== "reason")) {
    throw new Error("Team pass input contains unsupported fields")
  }
  if (input.deliveryId !== expectedDeliveryId) {
    throw new Error("Team pass delivery id does not match its exact binding")
  }
  const reason = input.reason
  if (
    reason !== undefined &&
    (typeof reason !== "string" ||
      reason.length === 0 ||
      [...reason].length > TEAM_PASS_REASON_MAX_LENGTH)
  ) {
    throw new Error("Team pass reason must be a bounded non-empty string")
  }
  return {
    deliveryId: expectedDeliveryId,
    ...(reason === undefined ? {} : { reason })
  }
}

function requireIdentity(value: string, label: string): string {
  if (value.length === 0 || value.length > 512) {
    throw new Error(`${label} must contain 1 to 512 characters`)
  }
  return value
}
