import type {
  HomeOptions,
  SurfaceClient
} from "@wanex/assistant/surface"
import type { Action } from "./actions.js"
import type { ReconcileEventsOptions } from "./transport.js"
import type { ActionResult, Snapshot } from "./view.js"

export interface CreateSurfaceOptions {
  readonly client: SurfaceClient
  readonly homeOptions?: HomeOptions
  readonly eventLimit?: number
  readonly now?: () => number
}

export type CreateControllerOptions = CreateSurfaceOptions

export interface Surface {
  snapshot(): Snapshot
  refresh(options?: HomeOptions): Promise<Snapshot>
  reconcileEvents(
    options?: ReconcileEventsOptions
  ): Promise<Snapshot>
  dispatchAction(
    action: Action,
    options?: ActionDispatchOptions
  ): Promise<ActionResult>
}

export interface Controller {
  snapshot(): Snapshot
  refresh(options?: HomeOptions): Promise<Snapshot>
  reconcileEvents(
    options?: ReconcileEventsOptions
  ): Promise<Snapshot>
  dispatchAction(
    action: Action,
    options?: ActionDispatchOptions
  ): Promise<ActionResult>
}

export interface ActionDispatchOptions {
  readonly requestId?: string
}
