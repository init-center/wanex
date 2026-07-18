import {
  createWanexAppShellAgentCommands,
} from "./commands-agent.js"
import { createWanexAppShellContextCommands } from "./commands-context.js"
import { createWanexAppShellExecutionReferenceCommands } from "./commands-execution-reference.js"
import { createWanexAppShellProviderCommands } from "./commands-provider.js"
import { createWanexAppShellSystemCommands } from "./commands-system.js"
import type { WanexAppShellCommandContext } from "./command-context.js"
import type { WanexAppShellCommands } from "./types-app.js"

export function createWanexAppShellCommands(options: {
  readonly context: WanexAppShellCommandContext
  readonly isDisposed: () => boolean
}): WanexAppShellCommands {
  let commands: WanexAppShellCommands
  const agentCommands = createWanexAppShellAgentCommands(
    options.context,
    () => commands
  )
  commands = {
    ...agentCommands,
    ...createWanexAppShellContextCommands(options.context),
    ...createWanexAppShellExecutionReferenceCommands(options.context),
    ...createWanexAppShellProviderCommands(options.context),
    ...createWanexAppShellSystemCommands(options.context, options.isDisposed)
  }
  return commands
}
