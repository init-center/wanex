import {
  ConnectorRuntimeChannelOperationsFacade
} from "./runtime-channel-operations.js"
import {
  createConnectorRuntimeSubsystems
} from "./runtime-subsystems.js"
import type {
  ConnectorRuntimeOptions
} from "./types.js"

export type {
  BindExternalIdentityRequest,
  CompleteConnectorDeliveryRequest,
  ConnectorDeliveryHandler,
  ConnectorDeliveryHandlerContext,
  ConnectorDeliveryJobPayload,
  FailConnectorDeliveryRequest,
  FinishConnectorSessionLeaseRequest,
  HeartbeatConnectorSessionLeaseRequest,
  IngestConnectorEventRequest,
  ProjectConnectorEventRequest,
  PutConnectorCredentialRefRequest,
  RegisterConnectorRequest,
  StartConnectorSessionLeaseRequest,
  SubmitConnectorDeliveryRequest,
  ConnectorRuntimeOptions
} from "./types.js"

export class ConnectorRuntime
  extends ConnectorRuntimeChannelOperationsFacade {
  constructor(options: ConnectorRuntimeOptions) {
    super(createConnectorRuntimeSubsystems(options.storage))
  }
}

export type { ConnectorRuntimeStorage } from "./storage.js"
