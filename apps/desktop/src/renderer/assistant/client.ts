import type {
  Client,
  ClientEvent,
  PreparedResourceDelivery,
} from "@wanex/assistant-ui/client";
import type {
  DesktopAssistantActivation,
  DesktopAssistantRendererBridge,
} from "../../assistant/bridge.js";

export function createDesktopRemoteAssistantClient(
  bridge: DesktopAssistantRendererBridge,
  activation: DesktopAssistantActivation,
): Client {
  return Object.freeze({
    async readInitialSnapshot() {
      return activation.snapshot;
    },
    async readSnapshot() {
      return await bridge.readSnapshot(activation.generation);
    },
    async dispatchAction(
      action: Parameters<Client["dispatchAction"]>[0],
      options: Parameters<Client["dispatchAction"]>[1],
    ) {
      return await bridge.dispatchAction({
        generation: activation.generation,
        action,
        ...(options?.requestId === undefined
          ? {}
          : { requestId: options.requestId }),
      });
    },
    async uploadAttachment(
      request: Parameters<NonNullable<Client["uploadAttachment"]>>[0],
    ) {
      return await bridge.uploadAttachment({
        generation: activation.generation,
        ...request,
      });
    },
    async prepareResourceDelivery(
      request: Parameters<NonNullable<Client["prepareResourceDelivery"]>>[0],
    ) {
      return await bridge.prepareResourceDelivery({
        generation: activation.generation,
        ...request,
      });
    },
    async releaseResourceDelivery(
      delivery: Pick<PreparedResourceDelivery, "kind" | "url">,
    ) {
      await bridge.releaseResourceDelivery({
        generation: activation.generation,
        delivery: {
          kind: delivery.kind,
          url: delivery.url,
        },
      });
    },
    subscribe(listener: (event: ClientEvent) => void) {
      return bridge.subscribe((envelope) => {
        if (envelope.generation === activation.generation) {
          listener(envelope.event);
        }
      });
    },
  });
}
