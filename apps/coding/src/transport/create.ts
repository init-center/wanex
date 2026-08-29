import type {
  CodingClientTransport,
  CodingCommandRequest,
  CodingMessageTransportOptions,
  CodingTransportEndpoint,
} from "./model.js";

export function createInProcessCodingTransport(
  endpoint: CodingTransportEndpoint,
): CodingClientTransport {
  return createMessageCodingTransport(endpoint);
}

export function createMessageCodingTransport(
  options: CodingMessageTransportOptions,
): CodingClientTransport {
  return Object.freeze({
    send: async (request: CodingCommandRequest) => await options.send(request),
    subscribe: (listener: (event: unknown) => void) =>
      options.subscribe(listener),
  });
}
