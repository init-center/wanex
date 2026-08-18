import { describe, expect, it } from "vitest"
import type {
  MediaGenerationModelEndpoint,
  MediaGenerationProviderOutputReference
} from "@wanex/protocol"
import {
  prepareMediaGenerationOperationBinding,
  type MediaGenerationAdapterRequest
} from "../src/media-generation/index.js"
import {
  OpenAIImagesAdapter,
  type OpenAIImagesFetch
} from "../src/media-generation/openai-images.js"
import { modelEndpointExecutionBinding } from "../src/provider/index.js"
import {
  InMemoryResolvedSecret,
  type ResolvedSecret,
  type SecretResolverPort
} from "../src/secrets/index.js"

describe("OpenAIImagesAdapter", () => {
  it("submits the exact frozen endpoint request and disposes its credential", async () => {
    const resolver = new TrackingSecretResolver("openai-test-key")
    const requests: Array<{ readonly input: string; readonly init?: RequestInit }> = []
    const generated = Buffer.from("generated-png")
    const adapter = new OpenAIImagesAdapter({
      secretResolver: resolver,
      async fetch(input, init) {
        requests.push({ input, ...(init === undefined ? {} : { init }) })
        return jsonResponse({
          created: 123,
          usage: { total_tokens: 20 },
          data: [{
            b64_json: generated.toString("base64"),
            revised_prompt: "a precise red triangle"
          }]
        })
      }
    })
    const controller = new AbortController()
    const request = adapterRequest({
      options: {
        quality: "high",
        size: "1024x1024",
        output_format: "webp"
      },
      signal: controller.signal
    })

    await expect(adapter.submit(request)).resolves.toEqual({
      status: "completed",
      outputs: [{
        kindOfOutput: "base64",
        data: generated.toString("base64"),
        kind: "image",
        mediaType: "image/webp",
        metadata: {
          providerId: "openai-compatible",
          modelId: "gpt-image-test",
          created: 123,
          revisedPrompt: "a precise red triangle",
          usage: { total_tokens: 20 }
        }
      }]
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.input).toBe(
      "https://api.openai.test/v1/images/generations"
    )
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer openai-test-key",
        "content-type": "application/json"
      },
      signal: controller.signal,
      redirect: "error"
    })
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      model: "gpt-image-test",
      prompt: "a precise red triangle",
      quality: "high",
      size: "1024x1024",
      output_format: "webp"
    })
    expect(resolver.contexts).toEqual([{
      modelEndpointId: "openai-image",
      signal: controller.signal
    }])
    expect(resolver.secrets[0]?.disposed).toBe(true)
  })

  it("rejects invalid requests before resolving credentials or dispatching", async () => {
    const resolver = new TrackingSecretResolver("unused")
    let fetchCount = 0
    const adapter = new OpenAIImagesAdapter({
      secretResolver: resolver,
      async fetch() {
        fetchCount += 1
        return jsonResponse({ data: [] })
      }
    })

    await expect(adapter.submit(adapterRequest({
      options: { model: "attempted-override" }
    }))).resolves.toMatchObject({
      status: "rejected",
      error: { type: "invalid_request", message: expect.stringContaining("reserved") }
    })
    await expect(adapter.submit(adapterRequest({
      endpoint: imageEndpoint({ protocolId: "other-images" })
    }))).resolves.toMatchObject({
      status: "rejected",
      error: { type: "invalid_request" }
    })
    expect(resolver.contexts).toEqual([])
    expect(fetchCount).toBe(0)
  })

  it("returns definite rejection for HTTP and malformed successful responses", async () => {
    const cases: readonly {
      readonly name: string
      readonly response: () => Response
      readonly type: string
    }[] = [
      {
        name: "HTTP rejection",
        response: () => new Response('{"error":"denied"}', {
          status: 400,
          statusText: "Bad Request"
        }),
        type: "provider_rejection"
      },
      {
        name: "malformed JSON",
        response: () => new Response("not-json", { status: 200 }),
        type: "invalid_provider_response"
      },
      {
        name: "empty output",
        response: () => jsonResponse({ data: [] }),
        type: "invalid_provider_response"
      },
      {
        name: "bad base64",
        response: () => jsonResponse({ data: [{ b64_json: "not base64" }] }),
        type: "invalid_provider_response"
      },
      {
        name: "unsafe URL",
        response: () => jsonResponse({
          data: [{ url: "http://127.0.0.1/private.png" }]
        }),
        type: "invalid_provider_response"
      }
    ]
    for (const scenario of cases) {
      const resolver = new TrackingSecretResolver("test-key")
      const adapter = new OpenAIImagesAdapter({
        secretResolver: resolver,
        fetch: async () => scenario.response()
      })
      const result = await adapter.submit(adapterRequest())
      expect(result, scenario.name).toMatchObject({
        status: "rejected",
        error: { type: scenario.type }
      })
      expect(resolver.secrets[0]?.disposed, scenario.name).toBe(true)
    }
  })

  it("bounds provider response bytes before parsing", async () => {
    const resolver = new TrackingSecretResolver("test-key")
    const adapter = new OpenAIImagesAdapter({
      secretResolver: resolver,
      maxResponseBytes: 16,
      fetch: async () => new Response("x".repeat(17))
    })

    await expect(adapter.submit(adapterRequest())).resolves.toMatchObject({
      status: "rejected",
      error: {
        type: "invalid_provider_response",
        message: expect.stringContaining("exceeds 16 bytes")
      }
    })
    expect(resolver.secrets[0]?.disposed).toBe(true)
  })

  it("keeps transport failure ambiguous and still disposes the credential", async () => {
    const resolver = new TrackingSecretResolver("test-key")
    const adapter = new OpenAIImagesAdapter({
      secretResolver: resolver,
      async fetch() {
        throw new Error("socket closed after dispatch")
      }
    })

    await expect(adapter.submit(adapterRequest())).rejects.toThrow(
      "socket closed after dispatch"
    )
    expect(resolver.secrets[0]?.disposed).toBe(true)
  })

  it("returns credential resolution failures without dispatch", async () => {
    let fetchCount = 0
    const adapter = new OpenAIImagesAdapter({
      secretResolver: {
        async resolve() {
          throw new Error("keychain unavailable")
        }
      },
      async fetch() {
        fetchCount += 1
        return jsonResponse({ data: [] })
      }
    })

    await expect(adapter.submit(adapterRequest())).resolves.toEqual({
      status: "rejected",
      error: {
        type: "credential_unavailable",
        message: "keychain unavailable"
      }
    })
    expect(fetchCount).toBe(0)
  })

  it("classifies credential reveal failure before dispatch and disposes it", async () => {
    let disposed = false
    let fetchCount = 0
    const adapter = new OpenAIImagesAdapter({
      secretResolver: {
        async resolve() {
          return {
            ref: "static://broken",
            provider: "test",
            get disposed() {
              return disposed
            },
            reveal() {
              throw new Error("credential cannot be revealed")
            },
            dispose() {
              disposed = true
            },
            toJSON(): never {
              throw new Error("secret cannot be serialized")
            }
          }
        }
      },
      async fetch() {
        fetchCount += 1
        return jsonResponse({ data: [] })
      }
    })

    await expect(adapter.submit(adapterRequest())).resolves.toEqual({
      status: "rejected",
      error: {
        type: "credential_unavailable",
        message: "credential cannot be revealed"
      }
    })
    expect(fetchCount).toBe(0)
    expect(disposed).toBe(true)
  })

  it("materializes only bounded HTTPS image output without redirects", async () => {
    const requested: Array<{ readonly input: string; readonly init?: RequestInit }> = []
    const fetch: OpenAIImagesFetch = async (input, init) => {
      requested.push({ input, ...(init === undefined ? {} : { init }) })
      return new Response(Buffer.from("downloaded-image"), {
        status: 200,
        headers: { "content-type": "image/png; charset=binary" }
      })
    }
    const adapter = new OpenAIImagesAdapter({
      secretResolver: new TrackingSecretResolver("unused"),
      fetch,
      maxMaterializedBytes: 32
    })
    const request = adapterRequest()
    const reference: MediaGenerationProviderOutputReference = {
      kindOfReference: "remote_url",
      url: "https://cdn.openai.test/output.png?signature=abc",
      metadata: { providerId: "openai-compatible" }
    }

    await expect(adapter.materialize(reference, request)).resolves.toEqual({
      bytes: Buffer.from("downloaded-image"),
      kind: "image",
      mediaType: "image/png",
      metadata: { providerId: "openai-compatible" }
    })
    expect(requested).toEqual([{
      input: "https://cdn.openai.test/output.png?signature=abc",
      init: {
        method: "GET",
        signal: request.signal,
        redirect: "error"
      }
    }])
    await expect(adapter.materialize({
      kindOfReference: "remote_url",
      url: "https://localhost/output.png"
    }, request)).rejects.toThrow("unsafe")
    expect(requested).toHaveLength(1)
  })

  it("rejects oversized and non-image materialized responses", async () => {
    const responses = [
      new Response("x".repeat(9), {
        headers: { "content-type": "image/png" }
      }),
      new Response("not-an-image", {
        headers: { "content-type": "text/html" }
      })
    ]
    const adapter = new OpenAIImagesAdapter({
      secretResolver: new TrackingSecretResolver("unused"),
      maxMaterializedBytes: 8,
      fetch: async () => responses.shift()!
    })
    const reference: MediaGenerationProviderOutputReference = {
      kindOfReference: "remote_url",
      url: "https://cdn.openai.test/output.png"
    }

    await expect(
      adapter.materialize(reference, adapterRequest())
    ).rejects.toThrow("exceeds 8 bytes")
    await expect(
      adapter.materialize(reference, adapterRequest())
    ).rejects.toThrow("content-type must be image")
  })
})

class TrackingSecretResolver implements SecretResolverPort {
  readonly contexts: unknown[] = []
  readonly secrets: ResolvedSecret[] = []

  constructor(private readonly value: string) {}

  async resolve(
    ref: string,
    context?: Parameters<SecretResolverPort["resolve"]>[1]
  ): Promise<ResolvedSecret> {
    this.contexts.push(context)
    const secret = new InMemoryResolvedSecret({
      ref,
      provider: "test",
      value: this.value
    })
    this.secrets.push(secret)
    return secret
  }
}

function adapterRequest(options: {
  readonly endpoint?: MediaGenerationModelEndpoint
  readonly options?: Record<string, unknown>
  readonly signal?: AbortSignal
} = {}): MediaGenerationAdapterRequest {
  const modelEndpoint = options.endpoint ?? imageEndpoint()
  return {
    operationId: "media-operation",
    binding: prepareMediaGenerationOperationBinding({
      operation: "image.generate",
      modelEndpoint: modelEndpointExecutionBinding(modelEndpoint),
      prompt: "a precise red triangle",
      outputModality: "image",
      ...(options.options === undefined
        ? {}
        : { options: options.options as never })
    }),
    signal: options.signal ?? new AbortController().signal
  }
}

function imageEndpoint(options: {
  readonly protocolId?: string
} = {}): MediaGenerationModelEndpoint {
  return {
    id: "openai-image",
    connection: {
      id: "openai-connection",
      providerId: "openai-compatible",
      baseUrl: "https://api.openai.test/v1/",
      secretRef: "static://openai-connection"
    },
    protocol: { id: options.protocolId ?? "openai-images" },
    model: {
      id: "gpt-image-test",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: "test.gpt-image-test",
        revision: "1"
      }
    }
  }
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
}
