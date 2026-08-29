import type { CodingApplication } from "../application/model.js";
import {
  codingEventEnvelope,
  dispatchCodingCommand,
} from "../transport/dispatch.js";
import type { CodingTransportEndpoint } from "../transport/model.js";

export function createCodingTransportEndpoint(
  application: CodingApplication,
): CodingTransportEndpoint {
  const endpoint: CodingTransportEndpoint = {
    send: async (request) => await dispatchCodingCommand(application, request),
    subscribe(listener) {
      return application.subscribe((event) =>
        listener(codingEventEnvelope(event)),
      );
    },
  };
  return Object.freeze(endpoint);
}
