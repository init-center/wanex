import {
  handleRequest as handleWebRequest
} from "@wanex/assistant-ui"
import {
  startAssistantWebApp
} from "../index.js"
import {
  handleDesktopMainRequest
} from "./request.js"
import {
  projectDesktopMainSnapshot
} from "./snapshot.js"
import type {
  AssistantWebApp
} from "../model.js"
import type {
  DesktopMainHost,
  StartDesktopMainHostOptions
} from "./model.js"

export type * from "./model.js"

export async function startDesktopMainHost(
  options: StartDesktopMainHostOptions
): Promise<DesktopMainHost> {
  const local = await startAssistantWebApp(options)
  return createDesktopMainHost(local)
}

function createDesktopMainHost(
  local: AssistantWebApp
): DesktopMainHost {
  let closePromise: Promise<void> | undefined
  return {
    kind: "desktop.host",
    url: local.url,
    settings: local.settings,
    modelEndpoints: local.modelEndpoints,
    providers: local.providers,
    modelCatalog: local.modelCatalog,
    attachments: local.attachments,
    resourceDeliveries: local.resourceDeliveries,
    async readSnapshot() {
      return projectDesktopMainSnapshot(await local.readSnapshot())
    },
    async handleWebRequest(request) {
      return await handleWebRequest(local.controller, request)
    },
    async handleRequest(request) {
      return await handleDesktopMainRequest(local, request)
    },
    async close() {
      if (closePromise !== undefined) {
        return await closePromise
      }
      closePromise = local.close()
      return await closePromise
    }
  }
}
