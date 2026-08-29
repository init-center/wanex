import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { JsonValue, ModelEndpoint } from "@wanex/protocol"
import { fromRpcMediaGenerationOperation } from "../src/codec-media-generation.js"
import { fromRpcSessionTurnRecord } from "../src/codec-session-turn-records.js"

describe("storage execution evidence codecs", () => {
  it("decodes complete capability routes and rejects altered route evidence", () => {
    const valid = turnRecord()
    const decoded = fromRpcSessionTurnRecord(valid as unknown as JsonValue)
    expect(
      decoded.executionBinding.capabilityRoutes[0]?.modelEndpoint.endpointId
    ).toBe("image-endpoint")
    expect(decoded.executionBinding.modelEndpoint.model.limits).toEqual({
      contextWindowTokens: 400_000,
      maxInputTokens: 272_000,
      maxOutputTokens: 128_000,
      maxInputResources: 16
    })

    const duplicate = structuredClone(valid)
    duplicate.execution_binding.capabilityRoutes.push(
      structuredClone(duplicate.execution_binding.capabilityRoutes[0]!)
    )
    duplicate.execution_binding.digest = digestJson(
      unsignedBinding(duplicate.execution_binding)
    )
    duplicate.execution_binding_digest = duplicate.execution_binding.digest
    expect(() =>
      fromRpcSessionTurnRecord(duplicate as unknown as JsonValue)
    ).toThrow("duplicate execution binding capability route")

    const alteredEndpoint = structuredClone(valid)
    alteredEndpoint.execution_binding.capabilityRoutes[0]!.modelEndpoint.endpointDigest =
      "0".repeat(64)
    alteredEndpoint.execution_binding.digest = digestJson(
      unsignedBinding(alteredEndpoint.execution_binding)
    )
    alteredEndpoint.execution_binding_digest = alteredEndpoint.execution_binding.digest
    expect(() =>
      fromRpcSessionTurnRecord(alteredEndpoint as unknown as JsonValue)
    ).toThrow("endpointDigest does not match its content")
  })

  it("decodes private-free context evidence and rejects snapshot or shape drift", () => {
    const valid = turnRecord()
    const evidence = {
      revision: 1,
      instructions: {
        state: "available",
        sourceCount: 2,
        digest: "1".repeat(64)
      },
      skills: {
        state: "available",
        sourceCount: 1,
        digest: "2".repeat(64)
      }
    }
    const binding = valid.execution_binding as Record<string, any>
    binding.contextEvidence = evidence
    binding.digest = digestJson(
      unsignedBinding(binding as { readonly digest: string })
    )
    valid.execution_binding_digest = binding.digest
    expect(
      fromRpcSessionTurnRecord(valid as unknown as JsonValue)
        .executionBinding.contextEvidence
    ).toEqual(evidence)

    const old = structuredClone(valid)
    const oldBinding = old.execution_binding as Record<string, any>
    oldBinding.contextSnapshot = evidence
    delete oldBinding.contextEvidence
    oldBinding.digest = digestJson(
      unsignedBinding(oldBinding as { readonly digest: string })
    )
    old.execution_binding_digest = oldBinding.digest
    expect(() => fromRpcSessionTurnRecord(old as unknown as JsonValue)).toThrow(
      "unknown field"
    )

    const nested = structuredClone(valid)
    const nestedBinding = nested.execution_binding as Record<string, any>
    const nestedEvidence = nestedBinding.contextEvidence as Record<string, any>
    const nestedInstructions = nestedEvidence.instructions as Record<string, any>
    nestedInstructions.extra = true
    nestedBinding.digest = digestJson(
      unsignedBinding(nestedBinding as { readonly digest: string })
    )
    nested.execution_binding_digest = nestedBinding.digest
    expect(() => fromRpcSessionTurnRecord(nested as unknown as JsonValue)).toThrow(
      "execution_binding.contextEvidence.instructions contains missing or unknown fields"
    )
  })

  it("decodes complete media bindings and rejects altered request evidence", () => {
    const valid = mediaRecord()
    expect(
      fromRpcMediaGenerationOperation(valid as unknown as JsonValue).binding.request
    ).toMatchObject({
      operation: "image.generate",
      outputModality: "image"
    })

    const altered = structuredClone(valid)
    altered.binding.request.prompt = "altered after admission"
    expect(() =>
      fromRpcMediaGenerationOperation(altered as unknown as JsonValue)
    ).toThrow("requestDigest does not match its content")

    const wrongOperation = structuredClone(valid)
    const wrongRequest = wrongOperation.binding.request as { operation: string }
    wrongRequest.operation = "video.generate"
    wrongOperation.binding.requestDigest = digestJson(wrongOperation.binding.request)
    expect(() =>
      fromRpcMediaGenerationOperation(wrongOperation as unknown as JsonValue)
    ).toThrow("video.generate requires video output")
  })
})

function turnRecord() {
  const conversation = endpointBinding(conversationEndpoint())
  const image = endpointBinding(imageEndpoint())
  const requirement = {
    operation: "image.generate" as const,
    inputModalities: ["text" as const],
    outputModalities: ["image" as const],
    features: []
  }
  const unsigned = {
    createdAt: 1,
    modelEndpoint: conversation,
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [
      {
        requirement,
        source: "configured" as const,
        modelEndpoint: image
      }
    ],
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  const executionBinding = { digest: digestJson(unsigned), ...unsigned }
  return {
    id: "turn-codec",
    session_id: "session-codec",
    primary_input_id: "input-codec",
    job_id: "job-codec",
    state: "queued",
    execution_binding: executionBinding,
    execution_binding_digest: executionBinding.digest,
    max_steps: 1,
    current_attempt_id: null,
    regenerates_turn_id: null,
    cancel_requested_at: null,
    cancel_reason: null,
    result: null,
    error: null,
    created_at: 1,
    updated_at: 1,
    finished_at: null
  }
}

function mediaRecord() {
  const endpoint = endpointBinding(imageEndpoint())
  const request = {
    operation: "image.generate" as const,
    prompt: "codec image",
    outputModality: "image" as const,
    inputResources: [],
    options: null
  }
  return {
    id: "media-codec",
    job_id: "job-media-codec",
    principal_id: "principal-codec",
    idempotency_key: "media-codec-key",
    state: "queued",
    binding: {
      ...endpoint,
      request,
      requestDigest: digestJson(request)
    },
    dispatch_attempt: 0,
    external_operation_id: null,
    provider_checkpoint: null,
    poll_count: 0,
    consecutive_poll_failures: 0,
    next_poll_at: null,
    last_poll_error: null,
    output_references: [],
    output_resource_ids: [],
    progress: null,
    error: null,
    cancel_requested_at: null,
    cancel_reason: null,
    created_at: 1,
    updated_at: 1,
    finished_at: null
  }
}

function endpointBinding(endpoint: ModelEndpoint) {
  return {
    endpointId: endpoint.id,
    endpointDigest: digestJson(endpoint),
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model
  }
}

function conversationEndpoint(): ModelEndpoint {
  return {
    id: "conversation-endpoint",
    connection: { id: "conversation-connection", providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: "conversation-model",
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      limits: {
        contextWindowTokens: 400_000,
        maxInputTokens: 272_000,
        maxOutputTokens: 128_000,
        maxInputResources: 16
      },
      catalog: {
        source: "custom",
        catalogId: "test.conversation-model",
        revision: "1"
      }
    }
  }
}

function imageEndpoint(): ModelEndpoint {
  return {
    id: "image-endpoint",
    connection: { id: "image-connection", providerId: "image-provider" },
    protocol: { id: "image-protocol" },
    model: {
      id: "image-model",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: "test.image-model",
        revision: "1"
      }
    }
  }
}

function unsignedBinding<T extends { readonly digest: string }>(binding: T) {
  const { digest: _digest, ...unsigned } = binding
  return unsigned
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`
}
