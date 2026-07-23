import {
  parsePositiveInteger,
  requireOption,
  ensureNoPositionals
} from "./parse-helpers.js"
import type { ParsedGlobalOptions } from "./parsed-options.js"
import type { GlobalOptions, ParsedCommand } from "./types.js"
import { assertProfileCapabilitiesSupported } from "@wanex/runtime/provider"
import type {
  ProviderInputModality,
  ProviderOutputModality
} from "@wanex/protocol"

const providerInputModalities = [
  "text",
  "image",
  "audio",
  "video",
  "document"
] as const satisfies readonly ProviderInputModality[]
const providerOutputModalities = [
  "text",
  "image",
  "audio",
  "video"
] as const satisfies readonly ProviderOutputModality[]

export function parseProviderCommand(globals: {
  readonly options: GlobalOptions
  readonly positionals: readonly string[]
  readonly providerOptions: Readonly<Record<string, string>>
}): ParsedCommand {
  const [action, profileId] = globals.positionals
  if (action !== "set" && action !== "get") {
    throw new Error("provider requires action: set or get")
  }
  if (profileId === undefined) {
    throw new Error(`provider ${action} requires profile id`)
  }
  if (action === "get") {
    return {
      name: "provider-get",
      options: globals.options,
      profileId
    }
  }

  const kind = globals.providerOptions.kind
  if (
    kind !== "fake" &&
    kind !== "openai-compatible" &&
    kind !== "anthropic" &&
    kind !== "deepseek"
  ) {
    throw new Error(
      "provider set requires --kind fake|openai-compatible|anthropic|deepseek"
    )
  }
  const providerId = requireOption(globals.providerOptions, "provider-id")
  const modelId = requireOption(globals.providerOptions, "model")
  const capabilities = assertProfileCapabilitiesSupported(kind, {
    input: parseCapabilityList(
      globals.providerOptions["input-modalities"] ?? "text",
      providerInputModalities,
      "input"
    ),
    output: parseCapabilityList(
      globals.providerOptions["output-modalities"] ?? "text",
      providerOutputModalities,
      "output"
    )
  })
  return {
    name: "provider-set",
    options: globals.options,
    profile: {
      id: profileId,
      kind,
      providerId,
      modelId,
      capabilities,
      ...(globals.providerOptions["base-url"] === undefined
        ? {}
        : { baseUrl: globals.providerOptions["base-url"] }),
      ...(globals.providerOptions["secret-ref"] === undefined
        ? {}
        : { secretRef: globals.providerOptions["secret-ref"] })
    }
  }
}

function parseCapabilityList<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string
): T[] {
  const modalities = value.split(",").map((item) => item.trim())
  if (modalities.some((item) => item.length === 0)) {
    throw new Error("provider modality lists must contain comma-separated names")
  }
  return modalities.map((modality) => {
    if (!allowed.includes(modality as T)) {
      throw new Error(`invalid provider ${label} modality: ${modality}`)
    }
    return modality as T
  })
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
    ...(globals.memoryOptions["waterline-tokens"] === undefined
      ? {}
      : {
          waterlineTokens: parsePositiveInteger(
            globals.memoryOptions["waterline-tokens"],
            "--waterline-tokens"
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
    ...(globals.memoryOptions["policy-version"] === undefined
      ? {}
      : { policyVersion: globals.memoryOptions["policy-version"] }),
    ...(globals.memoryOptions["idempotency-prefix"] === undefined
      ? {}
      : { idempotencyKeyPrefix: globals.memoryOptions["idempotency-prefix"] })
  }
}
