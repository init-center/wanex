import { ConnectorStoreMethods } from "./store-connector.js"
import { bindStoreFacet } from "./store-facet.js"
import type { StorageTransport } from "./transport.js"
import type { ConnectorStore } from "./types-connector.js"

export type { ConnectorStore } from "./types-connector.js"

export const createConnectorStore = (
  transport: StorageTransport
): ConnectorStore => bindStoreFacet(new ConnectorStoreMethods({ transport }))
