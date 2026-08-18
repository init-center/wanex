import { describe, expect, it } from "vitest"
import {
  ProviderPresetInputError,
  resolveCredentialEndpoints as resolveProviderEndpoints
} from "@wanex/product"
import { LocalModelCatalogResolver } from "../src/provider/catalog/index.js"

const modelResolver = new LocalModelCatalogResolver()
const resolveCredentialEndpoints = (
  request: Parameters<typeof resolveProviderEndpoints>[0]
) => resolveProviderEndpoints(request, modelResolver)

describe("local host provider presets", () => {
  it("resolves standard conversation providers from host-owned metadata", () => {
    expect(resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-5.2",
      credential: "unused"
    })).toMatchObject({
      connectionId: "openai",
      conversationEndpoint: {
        id: "openai",
        connection: {
          id: "openai",
          providerId: "openai",
          baseUrl: "https://api.openai.com/v1"
        },
        protocol: { id: "openai-chat-completions" },
        model: {
          id: "gpt-5.2",
          limits: {
            contextWindowTokens: 400_000,
            maxInputTokens: 272_000,
            maxOutputTokens: 128_000
          }
        }
      }
    })
    expect(resolveCredentialEndpoints({
      presetId: "anthropic",
      conversationModelId: "claude-sonnet-4-5",
      credential: "unused"
    })).toMatchObject({
      connectionId: "anthropic",
      conversationEndpoint: {
        id: "anthropic",
        protocol: { id: "anthropic-messages", version: "2023-06-01" },
        model: { id: "claude-sonnet-4-5" }
      }
    })
    expect(resolveCredentialEndpoints({
      presetId: "deepseek",
      conversationModelId: "deepseek-reasoner",
      credential: "unused",
      makeConversationActive: false
    })).toMatchObject({
      connectionId: "deepseek",
      conversationEndpoint: {
        id: "deepseek",
        protocol: { id: "openai-chat-completions" },
        model: {
          id: "deepseek-reasoner",
          behavior: { reasoningReplay: "required" }
        }
      }
    })
  })

  it("resolves one OpenAI connection with distinct conversation and image endpoints", () => {
    expect(resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-conversation-test",
      imageGenerationModelId: "gpt-image-test",
      credential: "unused",
      makeConversationActive: true
    })).toEqual({
      connectionId: "openai",
      conversationEndpoint: expect.objectContaining({
        id: "openai",
        connection: expect.objectContaining({ id: "openai" }),
        protocol: { id: "openai-chat-completions" },
        model: expect.objectContaining({
          id: "gpt-conversation-test",
          operations: ["conversation"]
        })
      }),
      imageGenerationEndpoint: expect.objectContaining({
        id: "openai.image-generate",
        connection: expect.objectContaining({ id: "openai" }),
        protocol: { id: "openai-images" },
        model: expect.objectContaining({
          id: "gpt-image-test",
          operations: ["image.generate"],
          inputModalities: ["text"],
          outputModalities: ["image"]
        })
      })
    })
    const resolved = resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-conversation-test",
      makeConversationActive: true
    })
    expect(resolved.conversationEndpoint).not.toHaveProperty("makeActive")
    expect(resolved.imageGenerationEndpoint).toBeUndefined()
  })

  it("derives one opaque custom connection id for both endpoint roles", () => {
    const first = resolveCredentialEndpoints({
      presetId: "openai-compatible",
      conversationModelId: "custom-model",
      imageGenerationModelId: "custom-image-model",
      baseUrl: "https://models.example.test/v1/",
      credential: "unused"
    })
    const second = resolveCredentialEndpoints({
      presetId: "openai-compatible",
      conversationModelId: "replacement-model",
      baseUrl: "https://models.example.test/v1",
      credential: "unused"
    })

    expect(first).toMatchObject({
      connectionId: expect.stringMatching(/^openai-compatible-[a-f0-9]{16}$/),
      conversationEndpoint: {
        connection: {
          providerId: "openai-compatible",
          baseUrl: "https://models.example.test/v1"
        },
        protocol: { id: "openai-chat-completions" },
        model: {
          id: "custom-model",
          inputModalities: ["text"],
          catalog: { revision: "unresolved" }
        }
      },
      imageGenerationEndpoint: {
        connection: {
          providerId: "openai-compatible",
          baseUrl: "https://models.example.test/v1"
        },
        protocol: { id: "openai-images" },
        model: { id: "custom-image-model" }
      }
    })
    expect(second.connectionId).toBe(first.connectionId)
    expect(first.conversationEndpoint.id).toBe(first.connectionId)
    expect(first.imageGenerationEndpoint?.id).toBe(
      `${first.connectionId}.image-generate`
    )
    expect(first.connectionId).not.toContain("models.example.test")

    expect(resolveCredentialEndpoints({
      presetId: "openai-compatible",
      conversationModelId: "custom-vision-model",
      conversationInputModalities: ["image", "text"],
      conversationFeatures: ["tool_calling"],
      baseUrl: "https://vision.example.test/v1"
    }).conversationEndpoint.model).toMatchObject({
      id: "custom-vision-model",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: { source: "custom", revision: "explicit" }
    })
  })

  it("rejects unsupported image setup, endpoint overrides, and unsafe URLs", () => {
    for (const presetId of ["anthropic", "deepseek"] as const) {
      expect(() => resolveCredentialEndpoints({
        presetId,
        conversationModelId: "conversation-model",
        imageGenerationModelId: "unsupported-image-model",
        credential: "unused"
      })).toThrow(`${presetId} preset does not support imageGenerationModelId`)
    }

    expect(() => resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-test",
      baseUrl: "https://attacker.example.test/v1",
      credential: "unused"
    })).toThrow(ProviderPresetInputError)

    expect(() => resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-test",
      conversationInputModalities: ["text", "image"]
    })).toThrow("standard provider preset does not accept conversationInputModalities")

    expect(() => resolveCredentialEndpoints({
      presetId: "openai",
      conversationModelId: "gpt-test",
      conversationFeatures: ["tool_calling"]
    })).toThrow("standard provider preset does not accept conversationFeatures")

    for (const conversationInputModalities of [
      [],
      ["image"],
      ["text", "text"],
      ["text", "audio"]
    ] as const) {
      expect(() => resolveCredentialEndpoints({
        presetId: "openai-compatible",
        conversationModelId: "custom-model",
        conversationInputModalities,
        baseUrl: "https://models.example.test/v1"
      })).toThrow(ProviderPresetInputError)
    }

    for (const conversationFeatures of [
      ["tool_calling", "tool_calling"],
      ["parallel_tool_calls"],
      ["reasoning"]
    ] as const) {
      expect(() => resolveCredentialEndpoints({
        presetId: "openai-compatible",
        conversationModelId: "custom-model",
        conversationFeatures,
        baseUrl: "https://models.example.test/v1"
      })).toThrow(ProviderPresetInputError)
    }

    expect(resolveCredentialEndpoints({
      presetId: "openai-compatible",
      conversationModelId: "custom-model",
      conversationInputModalities: ["text"],
      conversationFeatures: [],
      baseUrl: "https://models.example.test/v1"
    }).conversationEndpoint.model.features).toEqual([])

    for (const baseUrl of [
      undefined,
      "file:///tmp/provider",
      "http://provider.example.test/v1",
      "https://user:secret@example.test/v1",
      "https://example.test/v1?token=value",
      "https://example.test/v1#fragment"
    ]) {
      expect(() => resolveCredentialEndpoints({
        presetId: "openai-compatible",
        conversationModelId: "custom-model",
        ...(baseUrl === undefined ? {} : { baseUrl }),
        credential: "unused"
      })).toThrow(ProviderPresetInputError)
    }

    expect(resolveCredentialEndpoints({
      presetId: "openai-compatible",
      conversationModelId: "local-model",
      baseUrl: "http://127.0.0.1:11434/v1"
    }).conversationEndpoint.connection.baseUrl).toBe(
      "http://127.0.0.1:11434/v1"
    )
  })
})
