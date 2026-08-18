export const WANEX_RUNTIME_CONTEXT_MEMORY = "wanex-runtime-context-memory" as const

export { SemanticContextCompiler } from "./compiler.js"
export { resolveContextCompactionPolicy } from "./policy.js"
export { contextDigest, contextTextDigest, stableContextJson } from "./digest.js"
export {
  prepareContextCompaction,
  reconstructContextCompaction,
  validateActiveEpoch
} from "./sources.js"
export { serializeContextSource } from "./serialization.js"
export {
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR,
  estimatePartTokens,
  estimatePartsTokens,
  estimateMessagesTokens
} from "./token-estimate.js"
export type { ContextTokenEstimator } from "./token-estimate.js"
export type {
  CompileContextInput,
  CompiledContext,
  ContextCompactionEvidence,
  ContextCompactionPlanReason,
  ContextCompactionPolicy,
  ContextCompactionPolicyOverrides,
  ContextCompileStats,
  ContextCompiler,
  ContextEpochStore,
  PreparedContextCompaction,
  PrepareContextCompactionInput,
  ReconstructContextCompactionInput,
  SemanticContextCompilerOptions,
  SerializedContextSource
} from "./types.js"
