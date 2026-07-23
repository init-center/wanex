import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppAgentContextCommands } from "./types-context.js"

export function createWanexAppContextCommands(
  context: WanexAppCommandContext
): WanexAppAgentContextCommands {
  return {
    async setAgentContextProfile(profile) {
      context.assertActive()
      return await context.agentContext.setProfile(profile)
    },
    async refreshAgentContextProfile() {
      context.assertActive()
      return await context.agentContext.refresh()
    },
    async startAgentContextMonitor(options = {}) {
      context.assertActive()
      return context.agentContextMonitor.start(options)
    },
    async stopAgentContextMonitor() {
      context.assertActive()
      return await context.agentContextMonitor.stop()
    }
  }
}
