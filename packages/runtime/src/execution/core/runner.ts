import { AgentRunnerExecutionContext } from "./runner-context.js"
import { runAgentOnce } from "./runner-once.js"
import { runAgentToCompletion } from "./runner-to-completion.js"
import type {
  RunOnceRequest,
  RunOnceResult,
  RunToCompletionRequest,
  RunToCompletionResult,
  WanexAgentRunnerOptions
} from "./types.js"

export class WanexAgentRunner {
  private readonly context: AgentRunnerExecutionContext

  constructor(options: WanexAgentRunnerOptions) {
    this.context = new AgentRunnerExecutionContext(options)
  }

  async runOnce(request: RunOnceRequest): Promise<RunOnceResult> {
    return await runAgentOnce(this.context, request)
  }

  async runToCompletion(
    request: RunToCompletionRequest
  ): Promise<RunToCompletionResult> {
    return await runAgentToCompletion(this.context, request)
  }
}
