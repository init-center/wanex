import type {
  JsonValue,
  ModelCapabilityRequirement,
  ModelOperation
} from "@wanex/protocol"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  type ToolDefinition
} from "@wanex/runtime/tools"
import { modelCapabilityRequirementKey } from "@wanex/runtime/provider"
import type { WanexAppModelCapabilityReadinessReadModel } from "./types-model-capability.js"

const MAX_CAPABILITY_REQUEST_REQUIREMENTS = 64
const MAX_CAPABILITY_REASON_LENGTH = 512
const MAX_CAPABILITY_ENDPOINT_ID_LENGTH = 128

export const WANEX_APP_CAPABILITY_REQUEST_TOOL_NAME =
  "capability_request"

export function createWanexAppCapabilityRequestTool(options: {
  readonly requirements: readonly ModelCapabilityRequirement[]
  resolve(
    requirement: ModelCapabilityRequirement
  ): Promise<WanexAppModelCapabilityReadinessReadModel>
}): ToolDefinition {
  const requirements = [...options.requirements].sort((left, right) =>
    modelCapabilityRequirementKey(left).localeCompare(
      modelCapabilityRequirementKey(right)
    )
  )
  if (requirements.length > MAX_CAPABILITY_REQUEST_REQUIREMENTS) {
    throw new Error("capability request exceeds 64 requirements")
  }
  const operations = [...new Set(requirements.map((item) => item.operation))]
    .sort()
  return {
    name: WANEX_APP_CAPABILITY_REQUEST_TOOL_NAME,
    description:
      "Request trusted setup for a model capability that is not available in this turn.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: operations }
      },
      required: ["operation"],
      additionalProperties: false
    },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    annotations: {
      title: "Request model capability setup",
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    },
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.app.tool.capability-request",
      implementationRevision: "1",
      configuration: { requirements } as unknown as JsonValue
    }),
    presentCall(input) {
      return {
        summary: "Check model capability",
        details: [{ label: "Capability", value: readOperation(input) }]
      }
    },
    presentResult({ input, result }) {
      return {
        summary: result.outcome === "succeeded"
          ? "Capability checked"
          : "Capability setup required",
        details: [{ label: "Capability", value: readOperation(input) }]
      }
    },
    async invoke(invocation) {
      const operation = readOperation(invocation.input)
      const matching = requirements.filter(
        (requirement) => requirement.operation === operation
      )
      if (matching.length === 0) {
        return {
          outcome: "failed",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent({
            kind: "capability.request",
            error: "capability_not_declared",
            operation
          } as JsonValue)
        }
      }
      const readiness = await Promise.all(
        matching.map((requirement) => options.resolve(requirement))
      )
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          kind: "capability.request",
          operation,
          requirements: readiness.map((item) => ({
            requirement: item.requirement,
            status: item.status,
            reason: boundedText(item.reason, MAX_CAPABILITY_REASON_LENGTH),
            candidateModelEndpointIds: item.candidates.map(
              (candidate) =>
                boundedText(candidate.id, MAX_CAPABILITY_ENDPOINT_ID_LENGTH)
            ),
            candidateModelEndpointIdsTruncated: item.candidatesTruncated,
            ...(item.recommendedModelEndpointId === undefined
              ? {}
              : {
                  recommendedModelEndpointId:
                    boundedText(
                      item.recommendedModelEndpointId,
                      MAX_CAPABILITY_ENDPOINT_ID_LENGTH
                    )
                })
          }))
        } as unknown as JsonValue)
      }
    }
  }
}

function readOperation(value: unknown): ModelOperation {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).operation !== "string"
  ) {
    throw new Error("capability request operation must be a string")
  }
  return (value as { readonly operation: ModelOperation }).operation
}

function boundedText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength)
}
