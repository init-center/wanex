import { projectWanexAppSessionRow } from "./read-model.js"
import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppSessionLifecycleCommands } from "./types-session-lifecycle.js"

export function createWanexAppSessionLifecycleCommands(
  context: WanexAppCommandContext
): WanexAppSessionLifecycleCommands {
  return {
    async readSession(request) {
      context.assertActive()
      const session = await context.runtime.storage.getSession(request.sessionId)
      return session === null
        ? {
            kind: "wanex-app.session.missing",
            sessionId: request.sessionId
          }
        : {
            kind: "wanex-app.session.found",
            session: projectWanexAppSessionRow(session)
          }
    },
    async renameSession(request) {
      context.assertActive()
      return projectWanexAppSessionRow(
        await context.runtime.storage.renameSession(request)
      )
    },
    async archiveSession(request) {
      context.assertActive()
      return projectWanexAppSessionRow(
        await context.runtime.storage.archiveSession(request)
      )
    },
    async restoreSession(request) {
      context.assertActive()
      return projectWanexAppSessionRow(
        await context.runtime.storage.restoreSession(request)
      )
    }
  }
}
