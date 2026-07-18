import type {
  ProductAppLocalSnapshot
} from "./types.js"
import type {
  ProductAppDesktopMainSnapshot
} from "./desktop-host-types.js"

export function projectProductAppDesktopMainSnapshot(
  local: ProductAppLocalSnapshot
): ProductAppDesktopMainSnapshot {
  return {
    kind: "product-app-desktop-main.snapshot",
    url: local.url,
    local,
    privacy: {
      exposesStorePath: false,
      exposesServiceBinaryPath: false,
      exposesSecrets: false,
      exposesRawStorageClient: false,
      exposesRendererMutationApi: false
    }
  }
}
