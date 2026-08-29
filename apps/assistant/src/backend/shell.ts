import { createBackendApp } from "./app.js"
import {
  createBackendCommandPort,
  type BackendCommandPort,
  type BackendCommandPortEnvelope
} from "./port/runtime.js"
import {
  createBackendCommandPortJsonMapper,
  type BackendCommandPortJsonMapper,
  type BackendCommandPortJsonResult
} from "./port/json.js"
import type {
  BackendApp,
  BackendAppOptions,
  BackendCommands,
  BackendStatus
} from "./model/index.js"

export interface BackendShell {
  readonly app: BackendApp
  readonly commands: BackendCommands
  readonly events: BackendApp["events"]
  readonly trustedExecution: BackendApp["trustedExecution"]
  readonly port: BackendCommandPort
  readonly json: BackendCommandPortJsonMapper
  status(): BackendStatus
  dispatch(request: unknown): Promise<BackendCommandPortEnvelope>
  dispatchJson(body: unknown): Promise<BackendCommandPortJsonResult>
  dispose(): Promise<void>
}

export async function createBackendShell(
  options: BackendAppOptions
): Promise<BackendShell> {
  const app = await createBackendApp(options)
  const port = createBackendCommandPort(app)
  const json = createBackendCommandPortJsonMapper(port)

  return {
    app,
    commands: app.commands,
    events: app.events,
    trustedExecution: app.trustedExecution,
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
