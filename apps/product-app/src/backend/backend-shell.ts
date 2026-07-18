import { createProductAppBackendApp } from "./app.js"
import {
  createProductAppBackendCommandPort,
  type ProductAppBackendCommandPort,
  type ProductAppBackendCommandPortEnvelope
} from "./command-port.js"
import {
  createProductAppBackendCommandPortJsonMapper,
  type ProductAppBackendCommandPortJsonMapper,
  type ProductAppBackendCommandPortJsonResult
} from "./command-port-json.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendAppOptions,
  ProductAppBackendCommands,
  ProductAppBackendStatus
} from "./types.js"

export interface ProductAppBackendShell {
  readonly app: ProductAppBackendApp
  readonly commands: ProductAppBackendCommands
  readonly port: ProductAppBackendCommandPort
  readonly json: ProductAppBackendCommandPortJsonMapper
  status(): ProductAppBackendStatus
  dispatch(request: unknown): Promise<ProductAppBackendCommandPortEnvelope>
  dispatchJson(body: unknown): Promise<ProductAppBackendCommandPortJsonResult>
  dispose(): Promise<void>
}

export async function createProductAppBackendShell(
  options: ProductAppBackendAppOptions
): Promise<ProductAppBackendShell> {
  const app = await createProductAppBackendApp(options)
  const port = createProductAppBackendCommandPort(app)
  const json = createProductAppBackendCommandPortJsonMapper(port)

  return {
    app,
    commands: app.commands,
    port,
    json,
    status() {
      return app.status()
    },
    async dispatch(request) {
      return await port.dispatch(request)
    },
    async dispatchJson(body) {
      return await json.dispatchJson(body)
    },
    async dispose() {
      await app.dispose()
    }
  }
}
