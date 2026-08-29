import {
  envelopeBackendRouteResult
} from "../../result.js"
import {
  parseBackendPortRouteInput,
  parseBackendPortWorkflowEnvelope
} from "../input/routing.js"
import {
  messageFrom,
  portError,
  unreachableBackendPortCommand
} from "../envelope.js"
import type {
  BackendCommandPortEnvelope
} from "../contract.js"
import type {
  BackendApp,
  BackendCommandPortRequest
} from "../../model/index.js"

export async function dispatchBackendRoutingPortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "routeInput": {
      try {
        const routed = await app.commands.routeInput(
          parseBackendPortRouteInput(request.input)
        )
        return envelopeBackendRouteResult(command, routed)
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
          parseBackendPortWorkflowEnvelope(request.input)
        )
        return envelopeBackendRouteResult(command, routed)
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
  return unreachableBackendPortCommand(command)
}
