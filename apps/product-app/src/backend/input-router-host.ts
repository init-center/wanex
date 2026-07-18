import type {
  ProductAppBackendInputRouterCommands,
  ProductAppBackendStatus
} from "./types.js"

export interface ProductAppBackendInputRouterHost {
  readonly commands: ProductAppBackendInputRouterCommands
  status(): ProductAppBackendStatus
}

export type ProductAppBackendInputRouterApp = ProductAppBackendInputRouterHost
