export const WANEX_RUNTIME_AGENT_HOST = "wanex-runtime-agent-host" as const

export { WanexAgentRuntime } from "./runtime.js"
export type {
  AgentRunOnceResult,
  SubmitAndRunUserTextResult,
  SubmitUserTextRequest,
  SubmitUserTextResult,
  WanexAgentRuntimeOptions
} from "./types.js"
