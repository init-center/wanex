import type {
  ProviderCapabilities,
  ProviderInputModality,
  ProviderOutputModality,
  ProviderProfileKind
} from "@wanex/protocol"

const INPUT_ORDER: readonly ProviderInputModality[] = [
  "text",
  "image",
  "audio",
  "video",
  "document"
]
const OUTPUT_ORDER: readonly ProviderOutputModality[] = [
  "text",
  "image",
  "audio",
  "video"
]

export const TEXT_PROVIDER_CAPABILITIES = {
  input: ["text"],
  output: ["text"]
} as const satisfies ProviderCapabilities

export const OPENAI_CHAT_PROVIDER_CAPABILITIES = {
  input: ["text", "image"],
  output: ["text"]
} as const satisfies ProviderCapabilities

export const ANTHROPIC_MESSAGES_PROVIDER_CAPABILITIES = {
  input: ["text", "image", "document"],
  output: ["text"]
} as const satisfies ProviderCapabilities

export const FAKE_PROVIDER_CAPABILITIES = {
  input: INPUT_ORDER,
  output: ["text"]
} as const satisfies ProviderCapabilities

export function normalizeProviderCapabilities(
  capabilities: ProviderCapabilities
): ProviderCapabilities {
  const input = normalizeModalities(
    capabilities.input,
    INPUT_ORDER,
    "provider input modality"
  )
  const output = normalizeModalities(
    capabilities.output,
    OUTPUT_ORDER,
    "provider output modality"
  )
  if (!input.includes("text")) {
    throw new Error("provider capabilities must include text input")
  }
  if (!output.includes("text")) {
    throw new Error("conversational provider capabilities must include text output")
  }
  return { input, output }
}

export function assertProfileCapabilitiesSupported(
  kind: ProviderProfileKind,
  capabilities: ProviderCapabilities
): ProviderCapabilities {
  const normalized = normalizeProviderCapabilities(capabilities)
  const supported = supportedCapabilitiesForKind(kind)
  assertSubset(normalized.input, supported.input, `${kind} input`)
  assertSubset(normalized.output, supported.output, `${kind} output`)
  return normalized
}

export function supportedCapabilitiesForKind(
  kind: ProviderProfileKind
): ProviderCapabilities {
  switch (kind) {
    case "fake":
      return FAKE_PROVIDER_CAPABILITIES
    case "openai-compatible":
      return OPENAI_CHAT_PROVIDER_CAPABILITIES
    case "anthropic":
      return ANTHROPIC_MESSAGES_PROVIDER_CAPABILITIES
    case "deepseek":
      return TEXT_PROVIDER_CAPABILITIES
  }
}

export function sameProviderCapabilities(
  left: ProviderCapabilities,
  right: ProviderCapabilities
): boolean {
  const a = normalizeProviderCapabilities(left)
  const b = normalizeProviderCapabilities(right)
  return a.input.join("\0") === b.input.join("\0") &&
    a.output.join("\0") === b.output.join("\0")
}

function normalizeModalities<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  label: string
): T[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} list must not be empty`)
  }
  const seen = new Set<T>()
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(`invalid ${label}: ${String(value)}`)
    }
    if (seen.has(value)) {
      throw new Error(`duplicate ${label}: ${value}`)
    }
    seen.add(value)
  }
  return allowed.filter((value) => seen.has(value))
}

function assertSubset<T extends string>(
  values: readonly T[],
  supported: readonly T[],
  label: string
): void {
  const unsupported = values.find((value) => !supported.includes(value))
  if (unsupported !== undefined) {
    throw new Error(`${label} modality is not supported by this adapter: ${unsupported}`)
  }
}
