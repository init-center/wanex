import {
  handleProductAppWebRequest
} from "@wanex/product-app-web"
import {
  startProductAppLocalWebApp
} from "./index.js"
import {
  handleProductAppDesktopMainRequest
} from "./desktop-host-request.js"
import {
  projectProductAppDesktopMainSnapshot
} from "./desktop-host-snapshot.js"
import type {
  ProductAppLocalWebApp
} from "./types.js"
import type {
  ProductAppDesktopMainHost,
  StartProductAppDesktopMainHostOptions
} from "./desktop-host-types.js"

export type * from "./desktop-host-types.js"

export async function startProductAppDesktopMainHost(
  options: StartProductAppDesktopMainHostOptions
): Promise<ProductAppDesktopMainHost> {
  const local = await startProductAppLocalWebApp(options)
  return createProductAppDesktopMainHost(local)
}

function createProductAppDesktopMainHost(
  local: ProductAppLocalWebApp
): ProductAppDesktopMainHost {
  let closed = false
  return {
    kind: "product-app-desktop-main.host",
    url: local.url,
    settings: local.settings,
    providerProfiles: local.providerProfiles,
    providerSetup: local.providerSetup,
    attachments: local.attachments,
    async readSnapshot() {
      return projectProductAppDesktopMainSnapshot(await local.readSnapshot())
    },
    async handleWebRequest(request) {
      return await handleProductAppWebRequest(local.webController, request)
    },
    async handleRequest(request) {
      return await handleProductAppDesktopMainRequest(local, request)
    },
    async close() {
      if (closed) {
        return
      }
      closed = true
      await local.close()
    }
  }
}
