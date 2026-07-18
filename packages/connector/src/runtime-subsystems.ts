import { ConnectorBindingsRuntime } from "./bindings.js"
import { ConnectorCredentialsRuntime } from "./credentials.js"
import { ConnectorDeliveriesRuntime } from "./deliveries.js"
import { ConnectorEventsRuntime } from "./events.js"
import { ConnectorProjectionsRuntime } from "./projections.js"
import { ConnectorRegistryRuntime } from "./registry.js"
import { ConnectorSessionsRuntime } from "./sessions.js"
import type { ConnectorRuntimeStorage } from "./storage.js"

export interface ConnectorRuntimeSubsystems {
  readonly registry: ConnectorRegistryRuntime
  readonly credentials: ConnectorCredentialsRuntime
  readonly sessions: ConnectorSessionsRuntime
  readonly bindings: ConnectorBindingsRuntime
  readonly events: ConnectorEventsRuntime
  readonly deliveries: ConnectorDeliveriesRuntime
  readonly projections: ConnectorProjectionsRuntime
}

export function createConnectorRuntimeSubsystems(
  storage: ConnectorRuntimeStorage
): ConnectorRuntimeSubsystems {
  return {
    registry: new ConnectorRegistryRuntime(storage),
    credentials: new ConnectorCredentialsRuntime(storage),
    sessions: new ConnectorSessionsRuntime(storage),
    bindings: new ConnectorBindingsRuntime(storage),
    events: new ConnectorEventsRuntime(storage),
    deliveries: new ConnectorDeliveriesRuntime(storage),
    projections: new ConnectorProjectionsRuntime(storage)
  }
}

export abstract class ConnectorRuntimeSubsystemFacade {
  protected constructor(
    protected readonly subsystems: ConnectorRuntimeSubsystems
  ) {}
}
