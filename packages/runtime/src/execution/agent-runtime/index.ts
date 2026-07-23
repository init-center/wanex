export const WANEX_RUNTIME_AGENT_HOST = "wanex-runtime-agent-host" as const

export { WanexAgentRuntime } from "./runtime.js"
export type {
  AgentRunOnceResult,
  SubmitAndRunUserTurnResult,
  SubmitUserTurnRequest,
  SubmitUserTurnResult,
  WanexAgentRuntimeOptions
} from "./types.js"
