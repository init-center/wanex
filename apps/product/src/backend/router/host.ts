import type {
  BackendInputRouterCommands,
  BackendStatus
} from "../model/index.js"

export interface BackendInputRouterHost {
  readonly commands: BackendInputRouterCommands
  status(): BackendStatus
}

export type BackendInputRouterApp = BackendInputRouterHost
