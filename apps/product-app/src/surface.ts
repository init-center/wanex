import type {
  ProductAppShell
} from "./types.js"
import {
  knownProductAppSurfaceCommands,
  productAppSurfaceCommandMutatesState,
  productAppSurfaceDescriptor
} from "./surface-descriptor.js"
import {
  createProductAppSurfaceEventRecorder
} from "./surface-events.js"
import {
  normalizeProductAppSurfaceError,
  optionalRequestId,
  parseProductAppSurfaceRequest
} from "./surface-input.js"
import {
  runProductAppSurfaceCommand
} from "./surface-dispatch.js"
import type {
  ProductAppSurfaceAdapter,
  ProductAppSurfaceCommand,
  ProductAppSurfaceEnvelope,
  ProductAppSurfaceError,
  ProductAppSurfaceEvent
} from "./types-surface.js"

export interface ProductAppSurfaceAdapterOptions {
  readonly now?: () => number
}

export { productAppSurfaceDescriptor } from "./surface-descriptor.js"

export function createProductAppSurfaceAdapter(
  app: ProductAppShell,
  options: ProductAppSurfaceAdapterOptions = {}
): ProductAppSurfaceAdapter {
  const events = createProductAppSurfaceEventRecorder(options.now ?? Date.now)

  return {
    descriptor() {
      return productAppSurfaceDescriptor()
    },
    async dispatchSurfaceCommand(input) {
      return await dispatchProductAppSurfaceCommand(app, events, input)
    },
    readSurfaceEvents(request) {
      return events.read(request)
    }
  }
}

async function dispatchProductAppSurfaceCommand(
  app: ProductAppShell,
  events: ReturnType<typeof createProductAppSurfaceEventRecorder>,
  input: unknown
): Promise<ProductAppSurfaceEnvelope> {
  const parsed = parseProductAppSurfaceRequest(input)
  if (!parsed.ok) {
    return rejectedEnvelope({
      events,
      command: "unknown",
      error: parsed.error
    })
  }

  const request = parsed.request
  if (!knownProductAppSurfaceCommands.has(request.command)) {
    return rejectedEnvelope({
      events,
      command: request.command,
      ...optionalRequestId(request.requestId),
      error: {
        code: "unknown_command",
        category: "validation",
        message: `unknown product app surface command: ${request.command}`
      }
    })
  }

  try {
    const value = await runProductAppSurfaceCommand(app, request)
    const state = productAppSurfaceCommandMutatesState(
      request.command as ProductAppSurfaceCommand
    )
      ? app.status().state
      : undefined
    const event = events.record({
      type: "product-app.surface.command_completed",
      command: request.command,
      ...optionalRequestId(request.requestId),
      ...(state === undefined ? {} : { state })
    })
    if (state !== undefined) {
      events.record({
        type: "product-app.surface.state_changed",
        command: request.command,
        ...optionalRequestId(request.requestId),
        state
      })
    }
    return {
      ok: true,
      command: request.command,
      value,
      event
    }
  } catch (error) {
    return rejectedEnvelope({
      events,
      command: request.command,
      ...optionalRequestId(request.requestId),
      error: normalizeProductAppSurfaceError(error)
    })
  }
}

function rejectedEnvelope(request: {
  readonly events: ReturnType<typeof createProductAppSurfaceEventRecorder>
  readonly command: string
  readonly requestId?: string
  readonly error: ProductAppSurfaceError
}): Extract<ProductAppSurfaceEnvelope, { readonly ok: false }> {
  const event = recordRejectedEvent(request)
  return {
    ok: false,
    command: request.command,
    error: request.error,
    event
  }
}

function recordRejectedEvent(request: {
  readonly events: ReturnType<typeof createProductAppSurfaceEventRecorder>
  readonly command: string
  readonly requestId?: string
  readonly error: ProductAppSurfaceError
}): ProductAppSurfaceEvent {
  return request.events.record({
    type: "product-app.surface.command_rejected",
    command: request.command,
    ...optionalRequestId(request.requestId),
    error: request.error
  })
}
