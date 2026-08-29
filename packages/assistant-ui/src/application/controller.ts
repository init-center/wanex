import { createSurface } from "./surface.js"
import type {
  CreateControllerOptions,
  Controller,
} from "./model.js"

export async function createController(
  options: CreateControllerOptions
): Promise<Controller> {
  const surface = await createSurface(options)

  return {
    snapshot() {
      return surface.snapshot()
    },
    async refresh(homeOptions) {
      return await surface.refresh(homeOptions)
    },
    async reconcileEvents(reconcileOptions) {
      return await surface.reconcileEvents(reconcileOptions)
    },
    async dispatchAction(action, actionOptions) {
      return await surface.dispatchAction(action, actionOptions)
    }
  }
}
