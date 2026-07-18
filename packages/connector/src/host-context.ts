import type {
  ChannelInboundEventRecord,
  ConnectorSessionRecord,
  JsonValue
} from "@wanex/protocol"
import type { SecretResolver } from "./host-security/index.js"
import type { IngestConnectorEventRequest } from "./runtime.js"
import type { ConnectorRuntime } from "./runtime.js"
import type { ConnectorHostContext } from "./host.js"

export function createConnectorHostContext(request: {
  readonly runtime: ConnectorRuntime
  readonly connectorId: string
  readonly credentialId: string
  readonly ownerId: string
  readonly leaseMs: number
  readonly credentialSecretRef: string | undefined
  readonly secretResolver: SecretResolver | undefined
  readonly controller: AbortController
  readonly getSession: () => ConnectorSessionRecord
  readonly setSession: (session: ConnectorSessionRecord) => void
}): ConnectorHostContext {
  return {
    connectorId: request.connectorId,
    credentialId: request.credentialId,
    ownerId: request.ownerId,
    signal: request.controller.signal,
    get session() {
      return request.getSession()
    },
    heartbeat: async (metadata?: JsonValue) => {
      const current = request.getSession()
      const next = await request.runtime.heartbeatSession({
        sessionId: current.id,
        ownerId: request.ownerId,
        leaseToken: current.leaseToken,
        leaseMs: request.leaseMs,
        state: "connected",
        ...(metadata === undefined ? {} : { metadata })
      })
      request.setSession(next)
      return next
    },
    resolveCredentialSecret: async () => {
      if (request.secretResolver === undefined) {
        throw new Error("connector host secret resolver is not configured")
      }
      if (request.credentialSecretRef === undefined) {
        throw new Error("connector host credential secret ref is not configured")
      }
      return await request.secretResolver.resolve(request.credentialSecretRef, {
        connectorId: request.connectorId,
        credentialId: request.credentialId
      })
    },
    ingestEvent: async (
      eventRequest: Omit<IngestConnectorEventRequest, "connectorId">
    ): Promise<ChannelInboundEventRecord> => {
      return await request.runtime.ingestEvent({
        ...eventRequest,
        connectorId: request.connectorId
      })
    }
  }
}
