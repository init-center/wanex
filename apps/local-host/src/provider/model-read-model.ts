import type {
  ModelEndpointListReadModel,
  ModelEndpointReadModel
} from "@wanex/product"
import type { LocalWebApp } from "../model.js"

type TrustedModelEndpointList = Awaited<
  ReturnType<LocalWebApp["modelEndpoints"]["listModelEndpoints"]>
>

type TrustedModelEndpoint = TrustedModelEndpointList["endpoints"][number]

export function projectLocalModelEndpoints(
  endpointList: TrustedModelEndpointList
): ModelEndpointListReadModel {
  return {
    ...(endpointList.activeEndpointId === undefined
      ? {}
      : { activeEndpointId: endpointList.activeEndpointId }),
    endpoints: endpointList.endpoints.map(projectLocalModelEndpoint)
  }
}

export function projectLocalModelEndpoint(
  endpoint: TrustedModelEndpoint
): ModelEndpointReadModel {
  return {
    id: endpoint.id,
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model,
    credentialConfigured: endpoint.credentialConfigured,
    active: endpoint.active
  }
}
