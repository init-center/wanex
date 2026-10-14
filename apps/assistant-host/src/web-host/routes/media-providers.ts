import type { IncomingMessage, ServerResponse } from "node:http"
import type { MediaProviderPresetId } from "@wanex/assistant"
import type { LocalMediaProviderCommands } from "../../model.js"
import { readJsonBody } from "../request-body.js"
import { isRecord, WebHostHttpError } from "../http-error.js"
import { sendJson } from "../response.js"

export async function handleMediaProviderManagement(request: {
  readonly mediaProviders: LocalMediaProviderCommands
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  if (request.mediaProviders === undefined) {
    throw new WebHostHttpError(404, "not_found", "media provider management is not available")
  }
  if (request.request.method === "GET") {
    sendJson(request.response, 200, {
      ok: true,
      kind: "web.media-provider-list-response",
      providers: await request.mediaProviders.listProviders(),
      imageGeneration: await request.mediaProviders.readImageGenerationRoute()
    })
    return
  }
  const body = await readJsonBody(request.request, request.maxBodyBytes)
  if (request.request.method === "PUT") {
    const route = await request.mediaProviders.selectImageGenerationEndpoint(
      parseRoute(body)
    )
    sendJson(request.response, 200, {
      ok: true,
      kind: "web.media-provider-route-response",
      imageGeneration: route,
      providers: await request.mediaProviders.listProviders()
    })
    return
  }
  if (request.request.method === "DELETE") {
    const input = parseRemove(body)
    const result = await request.mediaProviders.removeProvider(input)
    sendJson(request.response, 200, {
      ok: true,
      kind: "web.media-provider-management-response",
      result,
      providers: await request.mediaProviders.listProviders(),
      imageGeneration: await request.mediaProviders.readImageGenerationRoute()
    })
    return
  }
  const result = await request.mediaProviders.saveMediaProvider(parseSave(body))
  sendJson(request.response, 200, {
    ok: true,
    kind: "web.media-provider-management-response",
    result,
    providers: await request.mediaProviders.listProviders(),
    imageGeneration: await request.mediaProviders.readImageGenerationRoute()
  })
}

function parseRoute(input: unknown): { readonly modelEndpointId: string } {
  if (!isRecord(input)) throw invalid("media provider route request must be an object")
  return { modelEndpointId: requiredString(input, "modelEndpointId", 512) }
}

function parseSave(input: unknown): {
  readonly connectionId?: string
  readonly presetId: MediaProviderPresetId
  readonly modelId: string
  readonly baseUrl?: string
  readonly acceptsReferenceImages?: boolean
  readonly credential?: string
} {
  if (!isRecord(input)) throw invalid("media provider save request must be an object")
  const presetId = requiredString(input, "presetId", 64)
  if (!["openai-images", "gemini-image", "volcengine-seedream", "openrouter-images"].includes(presetId)) {
    throw invalid("media provider presetId is not supported")
  }
  const connectionId = optionalString(input, "connectionId", 256)
  const baseUrl = optionalString(input, "baseUrl", 2_048)
  const acceptsReferenceImages = optionalBoolean(input, "acceptsReferenceImages")
  const credential = optionalString(input, "credential", 16_384)
  return {
    ...(connectionId === undefined ? {} : { connectionId }),
    presetId: presetId as MediaProviderPresetId,
    modelId: requiredString(input, "modelId", 256),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(acceptsReferenceImages === undefined ? {} : { acceptsReferenceImages }),
    ...(credential === undefined ? {} : { credential })
  }
}

function parseRemove(input: unknown): { readonly connectionId: string } {
  if (!isRecord(input)) throw invalid("media provider remove request must be an object")
  return { connectionId: requiredString(input, "connectionId", 256) }
}

function requiredString(input: Readonly<Record<string, unknown>>, field: string, max: number): string {
  const value = optionalString(input, field, max)
  if (value === undefined) throw invalid(`media provider ${field} is required`)
  return value
}

function optionalString(input: Readonly<Record<string, unknown>>, field: string, max: number): string | undefined {
  const raw = input[field]
  if (raw === undefined) return undefined
  if (typeof raw !== "string") throw invalid(`media provider ${field} must be a string`)
  const value = raw.trim()
  if (value.length === 0) return undefined
  if (Buffer.byteLength(value, "utf8") > max) throw invalid(`media provider ${field} is too long`)
  return value
}

function optionalBoolean(input: Readonly<Record<string, unknown>>, field: string): boolean | undefined {
  const raw = input[field]
  if (raw === undefined) return undefined
  if (typeof raw !== "boolean") throw invalid(`media provider ${field} must be a boolean`)
  return raw
}

function invalid(message: string): WebHostHttpError {
  return new WebHostHttpError(400, "invalid_media_provider_mutation", message)
}
