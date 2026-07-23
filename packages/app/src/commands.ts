import {
  createWanexAppAgentCommands,
} from "./commands-agent.js"
import { createWanexAppContextCommands } from "./commands-context.js"
import { createWanexAppConversationOperationCommands } from "./commands-conversation-operation.js"
import { createWanexAppExecutionReferenceCommands } from "./commands-execution-reference.js"
import { createWanexAppProviderCommands } from "./commands-provider.js"
import { createWanexAppResourceCommands } from "./commands-resources.js"
import { createWanexAppSystemCommands } from "./commands-system.js"
import { createWanexAppMediaGenerationCommands } from "./commands-media-generation.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppCommands } from "./types-app.js"

export function createWanexAppCommands(options: {
  readonly context: WanexAppCommandContext
  readonly isDisposed: () => boolean
}): WanexAppCommands {
  let commands: WanexAppCommands
  const agentCommands = createWanexAppAgentCommands(
    options.context,
    () => commands
  )
  commands = {
    ...agentCommands,
    ...createWanexAppConversationOperationCommands(options.context),
    ...createWanexAppMediaGenerationCommands(options.context),
    ...createWanexAppContextCommands(options.context),
    ...createWanexAppExecutionReferenceCommands(options.context),
    ...createWanexAppProviderCommands(options.context),
    ...createWanexAppResourceCommands(options.context),
    ...createWanexAppSystemCommands(options.context, options.isDisposed)
  }
  return commands
}
