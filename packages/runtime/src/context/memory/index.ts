export const WANEX_RUNTIME_CONTEXT_MEMORY = "wanex-runtime-context-memory" as const

export { DeterministicContextCompiler } from "./compiler.js"
export { DEFAULT_POLICY, mergePolicy } from "./policy.js"
export {
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR,
  estimatePartTokens,
  estimatePartsTokens
} from "./token-estimate.js"
export type { ContextTokenEstimator } from "./token-estimate.js"
export type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler,
  ContextCompileStats,
  ContextMemoryPolicy,
  ContextReplacementRecord,
  ContextReplacementStore,
  ContextReplacementTier,
  DeterministicContextCompilerOptions
} from "./types.js"
