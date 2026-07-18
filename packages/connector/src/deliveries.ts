import type {
  ChannelDeliveryAcknowledgement,
  ChannelDeliverySubmission
} from "@wanex/protocol"
import type { ConnectorRuntimeStorage } from "./storage.js"
import type {
  CompleteConnectorDeliveryRequest,
  FailConnectorDeliveryRequest,
  SubmitConnectorDeliveryRequest
} from "./types.js"

export class ConnectorDeliveriesRuntime {
  constructor(private readonly storage: ConnectorRuntimeStorage) {}

  async submitDelivery(
    request: SubmitConnectorDeliveryRequest
  ): Promise<ChannelDeliverySubmission> {
    return await this.storage.submitChannelDelivery({
      ...(request.id === undefined ? {} : { id: request.id }),
      connectorId: request.connectorId,
      channelKind: request.channelKind,
      channelId: request.channelId,
      ...(request.targetExternalIdentityId === undefined
        ? {}
        : { targetExternalIdentityId: request.targetExternalIdentityId }),
      ...(request.externalThreadId === undefined
        ? {}
        : { externalThreadId: request.externalThreadId }),
      principalId: request.principalId,
      payload: request.payload,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey }),
      ...(request.scheduledAt === undefined
        ? {}
        : { scheduledAt: request.scheduledAt }),
      ...(request.notBefore === undefined
        ? {}
        : { notBefore: request.notBefore }),
      ...(request.priority === undefined ? {} : { priority: request.priority }),
      ...(request.maxAttempts === undefined
        ? {}
        : { maxAttempts: request.maxAttempts }),
      ...(request.retryPolicy === undefined
        ? {}
        : { retryPolicy: request.retryPolicy }),
      ...(request.budgetGrantId === undefined
        ? {}
        : { budgetGrantId: request.budgetGrantId })
    })
  }

  async completeDelivery(
    request: CompleteConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    return await this.storage.completeChannelDelivery({
      deliveryId: request.deliveryId,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      ...(request.result === undefined ? {} : { result: request.result }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }

  async failDelivery(
    request: FailConnectorDeliveryRequest
  ): Promise<ChannelDeliveryAcknowledgement | null> {
    return await this.storage.failChannelDelivery({
      deliveryId: request.deliveryId,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      error: request.error,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }
}
