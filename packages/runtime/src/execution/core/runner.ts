import { AgentRunnerExecutionContext } from "./runner-context.js"
import { executeAgentTurn } from "./runner-to-completion.js"
import type {
  ExecuteTurnRequest,
  ExecuteTurnResult,
  WanexAgentRunnerOptions
} from "./types.js"

export class WanexAgentRunner {
  private readonly context: AgentRunnerExecutionContext

  constructor(options: WanexAgentRunnerOptions) {
    this.context = new AgentRunnerExecutionContext(options)
  }

  async executeTurn(request: ExecuteTurnRequest): Promise<ExecuteTurnResult> {
    return await executeAgentTurn(this.context, request)
  }
}
