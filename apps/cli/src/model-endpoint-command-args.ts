import type {
  ModelBehavior,
  ModelFeature,
  ModelInputModality,
  ModelOperation,
  ModelOutputModality
} from "@wanex/protocol"
import { normalizeModelEndpoint } from "@wanex/runtime/provider"
import {
  parsePositiveInteger,
  requireOption,
  ensureNoPositionals
} from "./parse-helpers.js"
import type { ParsedGlobalOptions } from "./parsed-options.js"
import type { GlobalOptions, ParsedCommand } from "./types.js"

const operations = [
  "conversation",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.transcribe",
  "audio.synthesize"
] as const satisfies readonly ModelOperation[]
const inputModalities = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ModelInputModality[]
const outputModalities = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ModelOutputModality[]
const features = [
  "tool_calling",
  "parallel_tool_calls",
  "reasoning"
] as const satisfies readonly ModelFeature[]
const replayPolicies = [
  "optional",
  "required",
  "forbidden"
] as const satisfies readonly NonNullable<ModelBehavior["reasoningReplay"]>[]

export function parseModelEndpointCommand(globals: {
  readonly options: GlobalOptions
  readonly positionals: readonly string[]
  readonly modelEndpointOptions: Readonly<Record<string, string>>
}): ParsedCommand {
  const [action, endpointId, ...extra] = globals.positionals
  if (action !== "set" && action !== "get") {
    throw new Error("model-endpoint requires action: set or get")
  }
  if (endpointId === undefined) {
    throw new Error(`model-endpoint ${action} requires endpoint id`)
  }
  ensureNoPositionals(extra, `model-endpoint ${action}`)
  if (action === "get") {
    return {
      name: "model-endpoint-get",
      options: globals.options,
      endpointId
    }
  }

  const protocolId = requireOption(globals.modelEndpointOptions, "protocol")
  const providerId = requireOption(globals.modelEndpointOptions, "provider-id")
  const modelId = requireOption(globals.modelEndpointOptions, "model")
  const connectionId =
    globals.modelEndpointOptions["connection-id"] ?? endpointId
  const baseUrl = globals.modelEndpointOptions["base-url"]
  const secretRef = globals.modelEndpointOptions["secret-ref"]
  if (protocolId !== "fake" && baseUrl === undefined) {
    throw new Error("model-endpoint set requires --base-url for non-fake protocols")
  }
  if (protocolId !== "fake" && secretRef === undefined) {
    throw new Error("model-endpoint set requires --secret-ref for non-fake protocols")
  }
  const reasoningReplay = optionalValue(
    globals.modelEndpointOptions["reasoning-replay"],
    replayPolicies,
    "reasoning replay"
  )
  const maxInputTokens = optionalPositiveInteger(
    globals.modelEndpointOptions["model-max-input-tokens"],
    "--model-max-input-tokens"
  )
  const maxOutputTokens = optionalPositiveInteger(
    globals.modelEndpointOptions["model-max-output-tokens"],
    "--model-max-output-tokens"
  )
  const maxInputResources = optionalPositiveInteger(
    globals.modelEndpointOptions["model-max-input-resources"],
    "--model-max-input-resources"
  )
  const contextWindowTokens = optionalPositiveInteger(
    globals.modelEndpointOptions["model-context-window-tokens"],
    "--model-context-window-tokens"
  )
  const modelEndpoint = normalizeModelEndpoint({
    id: endpointId,
    connection: {
      id: connectionId,
      providerId,
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(secretRef === undefined ? {} : { secretRef })
    },
    protocol: { id: protocolId },
    model: {
      id: modelId,
      operations: parseList(
        globals.modelEndpointOptions.operations ?? "conversation",
        operations,
        "operation"
      ),
      inputModalities: parseList(
        globals.modelEndpointOptions["input-modalities"] ?? "text",
        inputModalities,
        "input modality"
      ),
      outputModalities: parseList(
        globals.modelEndpointOptions["output-modalities"] ?? "text",
        outputModalities,
        "output modality"
      ),
      features: parseList(
        globals.modelEndpointOptions.features ?? "",
        features,
        "feature",
        true
      ),
      ...(contextWindowTokens === undefined &&
      maxInputTokens === undefined &&
      maxOutputTokens === undefined &&
      maxInputResources === undefined
        ? {}
        : {
            limits: {
              ...(contextWindowTokens === undefined
                ? {}
                : { contextWindowTokens }),
              ...(maxInputTokens === undefined ? {} : { maxInputTokens }),
              ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
              ...(maxInputResources === undefined ? {} : { maxInputResources })
            }
          }),
      ...(reasoningReplay === undefined
        ? {}
        : { behavior: { reasoningReplay } }),
      catalog: {
        source: "custom",
        catalogId: `cli.${endpointId}`,
        revision: "1"
      }
    }
  })
  return {
    name: "model-endpoint-set",
    options: globals.options,
    modelEndpoint
  }
}

function optionalPositiveInteger(
  value: string | undefined,
  label: string
): number | undefined {
  return value === undefined ? undefined : parsePositiveInteger(value, label)
}

function parseList<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
  allowEmpty = false
): T[] {
  const raw = value.length === 0 ? [] : value.split(",")
  if (raw.length === 0 && !allowEmpty) {
    throw new Error(`model ${label} list must not be empty`)
  }
  const values = raw.map((item) => item.trim())
  if (values.some((item) => !allowed.includes(item as T))) {
    throw new Error(`invalid model ${label}: ${values.find((item) => !allowed.includes(item as T))}`)
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`model ${label} list must not contain duplicates`)
  }
  return values as T[]
}

function optionalValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string
): T | undefined {
  if (value === undefined) return undefined
  if (!allowed.includes(value as T)) {
    throw new Error(`invalid model ${label}: ${value}`)
  }
  return value as T
}

export function parseMemoryCommand(globals: ParsedGlobalOptions): ParsedCommand {
  const [action, ...extra] = globals.positionals
  if (action !== "sweep") {
    throw new Error("memory requires action: sweep")
  }
  ensureNoPositionals(extra, "memory sweep")
  const principalId = globals.memoryOptions.principal ?? "cli-memory-maintenance"
  if (principalId.length === 0) {
    throw new Error("--principal must not be empty")
  }
  return {
    name: "memory-sweep",
    options: globals.options,
    principalId,
    ...(globals.memoryOptions["session-limit"] === undefined
      ? {}
      : {
          sessionLimit: parsePositiveInteger(
            globals.memoryOptions["session-limit"],
            "--session-limit"
          )
        }),
    ...(globals.memoryOptions["minimum-token-savings"] === undefined
      ? {}
      : {
          minimumTokenSavings: parsePositiveInteger(
            globals.memoryOptions["minimum-token-savings"],
            "--minimum-token-savings"
          )
        }),
    ...(globals.memoryOptions["idempotency-prefix"] === undefined
      ? {}
      : { idempotencyKeyPrefix: globals.memoryOptions["idempotency-prefix"] })
  }
}
