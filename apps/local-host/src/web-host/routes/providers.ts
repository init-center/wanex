import type { IncomingMessage, ServerResponse } from "node:http"
import {
  isProviderPresetId,
  normalizeProviderBaseUrl
} from "@wanex/product"
import type { Controller } from "@wanex/web"
import type { LocalProviderCommands } from "../../model.js"
import { readJsonBody } from "../request-body.js"
import { sendJson } from "../response.js"
import type { WebNodeRequestHandlerOptions } from "../types.js"
import { isRecord, WebHostHttpError } from "../http-error.js"

export async function handleProviderManagement(request: {
  readonly controller: Controller
  readonly providers?: WebNodeRequestHandlerOptions["providers"]
  readonly maxBodyBytes: number
  readonly request: IncomingMessage
  readonly response: ServerResponse
}): Promise<void> {
  if (request.providers === undefined) {
    throw new WebHostHttpError(
      404,
      "not_found",
      "product provider management is not available"
    )
  }
  if (request.request.method === "GET") {
    sendJson(request.response, 200, {
      ok: true,
      kind: "web.provider-list-response",
      providers: await request.providers.listProviders()
    })
    return
  }
  const body = await readJsonBody(request.request, request.maxBodyBytes)
  const removeInput = request.request.method === "DELETE"
    ? parseProviderRemoveInput(body)
    : undefined
  const saveInput = request.request.method === "DELETE"
    ? undefined
    : parseProviderSaveInput(body)
  let result:
    | Awaited<ReturnType<LocalProviderCommands["saveProvider"]>>
    | Awaited<ReturnType<LocalProviderCommands["removeProvider"]>>
  try {
    if (removeInput !== undefined) {
      result = await request.providers.removeProvider(removeInput)
    } else {
      if (saveInput === undefined) {
        throw new Error("provider save input is missing")
      }
      result = await request.providers.saveProvider(saveInput)
    }
  } catch {
    throw new WebHostHttpError(
      500,
      "provider_mutation_failed",
      request.request.method === "DELETE"
        ? "Provider could not be removed"
        : "Provider could not be saved"
    )
  }
  const snapshot = await request.controller.refresh()
  const providers = await request.providers.listProviders()
  sendJson(request.response, 200, {
    ok: true,
    kind: "web.provider-management-response",
    result,
    providers,
    snapshot
  })
}

function parseProviderSaveInput(input: unknown): {
  readonly connectionId?: string
  readonly presetId: "openai" | "anthropic" | "deepseek" | "openai-compatible"
  readonly conversationModelId: string
  readonly conversationInputModalities?: readonly ("text" | "image")[]
  readonly conversationFeatures?: readonly "tool_calling"[]
  readonly imageGenerationModelId?: string
  readonly baseUrl?: string
  readonly credential?: string
  readonly makeConversationActive?: boolean
} {
  if (!isRecord(input)) {
    throw invalidProviderMutation("provider save request must be an object")
  }
  const presetId = requiredProviderMutationString(input, "presetId", 64)
  if (!isProviderPresetId(presetId)) {
    throw invalidProviderMutation("provider presetId is not supported")
  }
  const connectionId = optionalProviderMutationString(input, "connectionId", 256)
  const conversationInputModalities = parseConversationInputModalities(
    input.conversationInputModalities
  )
  const conversationFeatures = parseConversationFeatures(
    input.conversationFeatures
  )
  if (
    conversationInputModalities !== undefined &&
    presetId !== "openai-compatible"
  ) {
    throw invalidProviderMutation(
      "standard provider does not accept conversationInputModalities"
    )
  }
  if (conversationFeatures !== undefined && presetId !== "openai-compatible") {
    throw invalidProviderMutation(
      "standard provider does not accept conversationFeatures"
    )
  }
  const suppliedBaseUrl = optionalProviderMutationString(input, "baseUrl", 2_048)
  if (presetId !== "openai-compatible" && suppliedBaseUrl !== undefined) {
    throw invalidProviderMutation("standard provider does not accept baseUrl")
  }
  let baseUrl: string | undefined
  if (presetId === "openai-compatible") {
    try {
      baseUrl = normalizeProviderBaseUrl(suppliedBaseUrl)
    } catch {
      throw invalidProviderMutation("custom provider requires an allowed baseUrl")
    }
  }
  const imageGenerationModelId = optionalProviderMutationString(
    input,
    "imageGenerationModelId",
    256
  )
  if (
    imageGenerationModelId !== undefined &&
    presetId !== "openai" &&
    presetId !== "openai-compatible"
  ) {
    throw invalidProviderMutation(
      `${presetId} provider does not support imageGenerationModelId`
    )
  }
  const credential = optionalProviderMutationString(input, "credential", 16_384)
  const makeConversationActive = optionalProviderMutationBoolean(
    input,
    "makeConversationActive"
  )
  return {
    ...(connectionId === undefined ? {} : { connectionId }),
    presetId,
    conversationModelId: requiredProviderMutationString(
      input,
      "conversationModelId",
      256
    ),
    ...(conversationInputModalities === undefined
      ? {}
      : { conversationInputModalities }),
    ...(conversationFeatures === undefined ? {} : { conversationFeatures }),
    ...(imageGenerationModelId === undefined ? {} : { imageGenerationModelId }),
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(credential === undefined ? {} : { credential }),
    ...(makeConversationActive === undefined ? {} : { makeConversationActive })
  }
}

function parseConversationFeatures(
  value: unknown
): readonly "tool_calling"[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw invalidProviderMutation("conversationFeatures must be an array")
  }
  const features = value.map((entry) => {
    if (entry !== "tool_calling") {
      throw invalidProviderMutation(
        "conversationFeatures supports only tool_calling"
      )
    }
    return entry
  })
  if (new Set(features).size !== features.length) {
    throw invalidProviderMutation(
      "conversationFeatures must not contain duplicates"
    )
  }
  return features.length === 0 ? [] : ["tool_calling"]
}

function parseConversationInputModalities(
  value: unknown
): readonly ("text" | "image")[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    throw invalidProviderMutation(
      "conversationInputModalities must be a non-empty array"
    )
  }
  const modalities = value.map((entry) => {
    if (entry !== "text" && entry !== "image") {
      throw invalidProviderMutation(
        "conversationInputModalities supports only text and image"
      )
    }
    return entry
  })
  if (new Set(modalities).size !== modalities.length) {
    throw invalidProviderMutation(
      "conversationInputModalities must not contain duplicates"
    )
  }
  if (!modalities.includes("text")) {
    throw invalidProviderMutation(
      "conversationInputModalities must include text"
    )
  }
  return modalities.includes("image") ? ["text", "image"] : ["text"]
}

function parseProviderRemoveInput(
  input: unknown
): { readonly connectionId: string } {
  if (!isRecord(input)) {
    throw invalidProviderMutation("provider remove request must be an object")
  }
  return {
    connectionId: requiredProviderMutationString(input, "connectionId", 256)
  }
}

function requiredProviderMutationString(
  value: Readonly<Record<string, unknown>>,
  field: string,
  maxLength = 2_048
): string {
  const result = optionalProviderMutationString(value, field, maxLength)
  if (result === undefined) {
    throw invalidProviderMutation(`provider ${field} is required`)
  }
  return result
}

function optionalProviderMutationString(
  value: Readonly<Record<string, unknown>>,
  field: string,
  maxLength: number
): string | undefined {
  const raw = value[field]
  if (raw === undefined) return undefined
  if (typeof raw !== "string") {
    throw invalidProviderMutation(`provider ${field} must be a string`)
  }
  const normalized = raw.trim()
  if (normalized.length === 0) return undefined
  if (Buffer.byteLength(normalized, "utf8") > maxLength) {
    throw invalidProviderMutation(`provider ${field} is too long`)
  }
  return normalized
}

function optionalProviderMutationBoolean(
  value: Readonly<Record<string, unknown>>,
  field: string
): boolean | undefined {
  const raw = value[field]
  if (raw === undefined) return undefined
  if (typeof raw !== "boolean") {
    throw invalidProviderMutation(`provider ${field} must be a boolean`)
  }
  return raw
}

function invalidProviderMutation(message: string): WebHostHttpError {
  return new WebHostHttpError(400, "invalid_provider_mutation", message)
}
