import { describe, expect, it } from "vitest"
import type {
  MediaGenerationModelEndpoint,
  ModelEndpoint
} from "@wanex/protocol"
import {
  MediaGenerationAdapterRegistry,
  prepareMediaGenerationOperationBinding,
  type MediaGenerationAdapter
} from "../src/media-generation/index.js"
import { modelEndpointExecutionBinding } from "../src/provider/index.js"

describe("MediaGenerationAdapterRegistry", () => {
  it("uses one protocol implementation for multiple frozen endpoints", () => {
    const adapter = protocolAdapter("shared-image-protocol")
    const registry = new MediaGenerationAdapterRegistry([adapter])
    const first = endpoint("image-a", "shared-image-protocol")
    const second = endpoint("image-b", "shared-image-protocol")

    expect(registry.supports(first)).toBe(true)
    expect(registry.supports(second)).toBe(true)
    expect(registry.requireModelEndpoint(first)).toBe(adapter)
    expect(registry.requireOperationBinding(binding(first))).toBe(adapter)
    expect(registry.requireOperationBinding(binding(second))).toBe(adapter)
  })

  it("rejects duplicate protocol implementations", () => {
    expect(
      () =>
        new MediaGenerationAdapterRegistry([
          protocolAdapter("duplicate-protocol"),
          protocolAdapter("duplicate-protocol")
        ])
    ).toThrow("duplicate media generation protocol adapter")
  })

  it("rejects unsupported endpoints and altered frozen bindings", () => {
    const adapter = protocolAdapter(
      "bounded-protocol",
      (candidate) => candidate.id === "supported"
    )
    const registry = new MediaGenerationAdapterRegistry([adapter])
    const unsupported = endpoint("unsupported", "bounded-protocol")

    expect(registry.supports(unsupported)).toBe(false)
    expect(() => registry.requireModelEndpoint(unsupported)).toThrow(
      "cannot execute endpoint"
    )

    const frozen = binding(endpoint("supported", "bounded-protocol"))
    expect(() =>
      registry.requireOperationBinding({
        ...frozen,
        model: { ...frozen.model, id: "altered-model" }
      })
    ).toThrow("execution binding digest is invalid")
  })
})

function protocolAdapter(
  protocolId: string,
  predicate: (endpoint: ModelEndpoint) => boolean = () => true
): MediaGenerationAdapter {
  return {
    protocolId,
    canExecute(endpoint) {
      return endpoint.protocol.id === protocolId && predicate(endpoint)
    },
    async submit() {
      return { status: "rejected", error: { type: "unused" } }
    },
    async poll() {
      return { status: "failed", error: { type: "unused" } }
    }
  }
}

function endpoint(
  endpointId: string,
  protocolId: string
): MediaGenerationModelEndpoint {
  return {
    id: endpointId,
    connection: {
      id: `connection-${endpointId}`,
      providerId: "image-provider"
    },
    protocol: { id: protocolId },
    model: {
      id: `model-${endpointId}`,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: `test.${endpointId}`,
        revision: "1"
      }
    }
  }
}

function binding(modelEndpoint: MediaGenerationModelEndpoint) {
  return prepareMediaGenerationOperationBinding({
    operation: "image.generate",
    modelEndpoint: modelEndpointExecutionBinding(modelEndpoint),
    prompt: "registry test",
    outputModality: "image"
  })
}
