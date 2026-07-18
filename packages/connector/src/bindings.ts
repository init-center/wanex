import type {
  ChannelBindingRecord,
  ChannelBindingState,
  PrincipalId
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type { BindExternalIdentityRequest } from "./types.js"

export class ConnectorBindingsRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async bindExternalIdentity(
    request: BindExternalIdentityRequest
  ): Promise<ChannelBindingRecord> {
    return await this.storage.putChannelBinding({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      channelKind: request.channelKind,
      channelId: request.channelId,
      externalIdentityId: request.externalIdentityId,
      principalId: request.principalId,
      ...(request.displayName === undefined
        ? {}
        : { displayName: request.displayName }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async listBindings(
    request: {
      readonly connectorId?: string
      readonly channelKind?: string
      readonly channelId?: string
      readonly principalId?: PrincipalId
      readonly externalIdentityId?: string
      readonly state?: ChannelBindingState
      readonly limit?: number
    } = {}
  ): Promise<ChannelBindingRecord[]> {
    return await this.storage.listChannelBindings({
      ...(request.connectorId === undefined
        ? {}
        : { connectorId: request.connectorId }),
      ...(request.channelKind === undefined
        ? {}
        : { channelKind: request.channelKind }),
      ...(request.channelId === undefined ? {} : { channelId: request.channelId }),
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
      ...(request.externalIdentityId === undefined
        ? {}
        : { externalIdentityId: request.externalIdentityId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async revokeBinding(bindingId: string): Promise<ChannelBindingRecord> {
    return await this.storage.revokeChannelBinding({ bindingId })
  }
}
