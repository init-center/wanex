import type { ContextMemoryPolicy } from "./types.js"

export const DEFAULT_POLICY: ContextMemoryPolicy = {
  version: "deterministic-v1",
  maxInputTokens: 32_000,
  recentUserTurns: 2,
  snipTextOverChars: 1_200,
  placeholderTextOverChars: 4_000,
  snipHeadChars: 320,
  snipTailChars: 160
}

export function mergePolicy(
  override: Partial<ContextMemoryPolicy> | undefined,
  base: ContextMemoryPolicy = DEFAULT_POLICY
): ContextMemoryPolicy {
  return {
    version: override?.version ?? base.version,
    maxInputTokens: override?.maxInputTokens ?? base.maxInputTokens,
    recentUserTurns: override?.recentUserTurns ?? base.recentUserTurns,
    snipTextOverChars: override?.snipTextOverChars ?? base.snipTextOverChars,
    placeholderTextOverChars:
      override?.placeholderTextOverChars ?? base.placeholderTextOverChars,
    snipHeadChars: override?.snipHeadChars ?? base.snipHeadChars,
    snipTailChars: override?.snipTailChars ?? base.snipTailChars
  }
}
