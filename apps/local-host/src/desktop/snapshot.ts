import type {
  LocalSnapshot
} from "../model.js"
import type {
  DesktopMainSnapshot
} from "./model.js"

export function projectDesktopMainSnapshot(
  local: LocalSnapshot
): DesktopMainSnapshot {
  return {
    kind: "desktop.snapshot",
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
