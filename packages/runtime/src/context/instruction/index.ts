export const WANEX_RUNTIME_INSTRUCTIONS = "wanex-runtime-instructions" as const

export { InstructionContextCompiler } from "./compiler.js"
export { discoverInstructionSnapshot } from "./discovery.js"
export { nodeInstructionFileSystem } from "./fs.js"
export { stableInstructionHash } from "./hash.js"
export {
  instructionSnapshotToSystemPart,
  renderInstructionSnapshot
} from "./render.js"
export type {
  InstructionContextCompiledContext,
  InstructionContextCompileInput,
  InstructionContextCompilerOptions,
  InstructionDiagnostic,
  InstructionDiagnosticCode,
  InstructionDiagnosticSeverity,
  InstructionDiscoveryOptions,
  InstructionFileStat,
  InstructionFileSystem,
  InstructionScope,
  InstructionSnapshot,
  InstructionSnapshotStatus,
  InstructionSource,
  InstructionSourceProvenance,
  InstructionTrustPolicy,
  ProjectInstructionTrust,
  RenderInstructionSnapshotOptions
} from "./types.js"
