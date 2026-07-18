import {
  envelopeProductAppBackendRouteResult
} from "./result-envelope.js"
import {
  parseProductAppBackendPortRouteInput,
  parseProductAppBackendPortWorkflowEnvelope
} from "./command-port-input-routing.js"
import {
  messageFrom,
  portError,
  unreachableProductAppBackendPortCommand
} from "./command-port-envelope.js"
import type {
  ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendCommandPortRequest
} from "./types.js"

export async function dispatchProductAppBackendRoutingPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "routeInput": {
      try {
        const routed = await app.commands.routeInput(
          parseProductAppBackendPortRouteInput(request.input)
        )
        return envelopeProductAppBackendRouteResult(command, routed)
      } catch (error) {
        return portError({
          command,
          code: "validation_error",
          category: "validation",
          message: messageFrom(error)
        })
      }
    }
    case "routeWorkflowEnvelope": {
      try {
        const routed = await app.commands.routeWorkflowEnvelope(
          parseProductAppBackendPortWorkflowEnvelope(request.input)
        )
        return envelopeProductAppBackendRouteResult(command, routed)
      } catch (error) {
        return portError({
          command,
          code: "validation_error",
          category: "validation",
          message: messageFrom(error)
        })
      }
    }
  }
  return unreachableProductAppBackendPortCommand(command)
}
