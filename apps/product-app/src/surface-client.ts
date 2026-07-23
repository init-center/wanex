import type {
  ProductAppBackendCommandPortRequest
} from "@wanex/product-app/backend"
import type {
  ProductAppCommandInvocationPreview,
  ProductAppCommandCatalogReadModel,
  ProductAppExecuteCommandRequest,
  ProductAppExecuteCommandResult,
  ProductAppExecutionReferenceReadResult,
  ProductAppCommandPortEnvelope,
  ProductAppCommandPortJsonResult,
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppAttachmentDraft,
  ProductAppConversationAttachmentsReadModel,
  ProductAppConversationAssistantTextDeltaEvent,
  ProductAppConversationOperationReadModel,
  ProductAppHomeReadModel,
  ProductAppHomeOptions,
  ProductAppOpenWorkbenchResult,
  ProductAppOpenWorkbenchRequest,
  ProductAppPrepareConversationAttachmentRequest,
  ProductAppPrepareConversationAttachmentResult,
  ProductAppReadConversationAttachmentsRequest,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppRemoveConversationAttachmentRequest,
  ProductAppRemoveConversationAttachmentResult,
  ProductAppPreviewCommandInvocationRequest,
  ProductAppReadExecutionReferenceRequest,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel,
  ProductAppSelectSessionRequest,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShellStatus,
  ProductAppSubmitConversationOperationRequest,
  ProductAppSubmitConversationOperationResult,
  ProductAppStateSnapshot,
  ProductAppUpdatePreferencesRequest
} from "./types.js"
import {
  PRODUCT_APP_SURFACE_COMMANDS,
  type ProductAppReadSurfaceEventsRequest,
  type ProductAppSurfaceAdapter,
  type ProductAppSurfaceCommand,
  type ProductAppSurfaceDescriptor,
  type ProductAppSurfaceEnvelope,
  type ProductAppSurfaceError,
  type ProductAppSurfaceEvent
} from "./types-surface.js"
import type {
  ProductAppSurfaceClientCommandRequest,
  ProductAppSurfaceClientTransport
} from "./types-surface-client.js"
import {
  createProductAppSurfaceClientEventFactory,
  type ProductAppSurfaceClientEventFactory
} from "./surface-client-events.js"
import {
  invalidTransportResponseError,
  isProductAppSurfaceDescriptor,
  isProductAppSurfaceEnvelope,
  isProductAppSurfaceEvent,
  normalizeProductAppSurfaceClientTransportFailure,
  transportFailureError
} from "./surface-client-validation.js"

export type {
  ProductAppSurfaceClientTransport,
  ProductAppSurfaceClientCommandRequest,
  ProductAppSurfaceClientTransportResult
} from "./types-surface-client.js"
export {
  PRODUCT_APP_SURFACE_TRANSPORT_OPERATIONS,
  createMessageProductAppSurfaceClientTransport,
  handleProductAppSurfaceTransportRequest
} from "./surface-transport.js"
export {
  createProductAppSurfaceHostEndpoint
} from "./surface-host.js"
export type {
  ProductAppSurfaceHostEndpoint,
  ProductAppSurfaceHostEndpointOptions
} from "./surface-host.js"
export type {
  ProductAppSurfaceCommandTransportRequest,
  ProductAppSurfaceCommandTransportResponse,
  ProductAppSurfaceDescriptorTransportRequest,
  ProductAppSurfaceDescriptorTransportResponse,
  ProductAppSurfaceEventsTransportRequest,
  ProductAppSurfaceEventsTransportResponse,
  ProductAppSurfaceTransportEnvelope,
  ProductAppSurfaceTransportOperation,
  ProductAppSurfaceTransportRequest,
  ProductAppSurfaceTransportResponse,
  ProductAppSurfaceTransportSender
} from "./surface-transport.js"
export type {
  ProductAppCommandInvocationPreview,
  ProductAppCommandCatalogReadModel,
  ProductAppExecuteCommandRequest,
  ProductAppExecuteCommandResult,
  ProductAppExecutionReferenceReadResult,
  ProductAppCancelTrackedConversationOperationRequest,
  ProductAppCancelTrackedConversationOperationResult,
  ProductAppAttachmentDraft,
  ProductAppConversationAttachmentsReadModel,
  ProductAppConversationAssistantTextDeltaEvent,
  ProductAppConversationOperationReadModel,
  ProductAppHomeReadModel,
  ProductAppHomeOptions,
  ProductAppOpenWorkbenchResult,
  ProductAppOpenWorkbenchRequest,
  ProductAppPrepareConversationAttachmentRequest,
  ProductAppPrepareConversationAttachmentResult,
  ProductAppReadConversationAttachmentsRequest,
  ProductAppReadTrackedConversationOperationRequest,
  ProductAppReadTrackedConversationOperationResult,
  ProductAppRegenerateTrackedConversationOperationRequest,
  ProductAppRegenerateTrackedConversationOperationResult,
  ProductAppRemoveConversationAttachmentRequest,
  ProductAppRemoveConversationAttachmentResult,
  ProductAppPreviewCommandInvocationRequest,
  ProductAppReadExecutionReferenceRequest,
  ProductAppProviderProfileListReadModel,
  ProductAppProviderProfileReadModel,
  ProductAppSelectSessionRequest,
  ProductAppSetLayoutRequest,
  ProductAppSetModeRequest,
  ProductAppSettingsReadModel,
  ProductAppShellStatus,
  ProductAppSubmitConversationOperationRequest,
  ProductAppSubmitConversationOperationResult,
  ProductAppStateSnapshot,
  ProductAppUpdatePreferencesRequest
} from "./types.js"

export interface ProductAppSurfaceClient {
  descriptor(): Promise<ProductAppSurfaceClientDescriptorResult>
  status(
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppShellStatus>>
  readHome(
    input?: ProductAppHomeOptions,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppHomeReadModel>>
  readSettings(
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppSettingsReadModel>>
  selectSession(
    input: ProductAppSelectSessionRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppStateSnapshot>>
  setLayout(
    input: ProductAppSetLayoutRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppStateSnapshot>>
  setMode(
    input: ProductAppSetModeRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppStateSnapshot>>
  updatePreferences(
    input: ProductAppUpdatePreferencesRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppStateSnapshot>>
  listProviderProfiles(
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppProviderProfileListReadModel>>
  readProductCommands(
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppCommandCatalogReadModel>>
  setActiveProviderProfile(
    input: { readonly profileId: string },
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppProviderProfileReadModel>>
  dispatchProductCommand(
    input: ProductAppBackendCommandPortRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppCommandPortEnvelope>>
  dispatchProductCommandJson(
    body: string,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppCommandPortJsonResult>>
  previewProductCommandInvocation(
    input: ProductAppPreviewCommandInvocationRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppCommandInvocationPreview>>
  executeProductCommand(
    input: ProductAppExecuteCommandRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppExecuteCommandResult>>
  readExecutionReference(
    input: ProductAppReadExecutionReferenceRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppExecutionReferenceReadResult>>
  openWorkbench(
    input?: ProductAppOpenWorkbenchRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppOpenWorkbenchResult>>
  prepareConversationAttachment(
    input: ProductAppPrepareConversationAttachmentRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppPrepareConversationAttachmentResult>>
  readConversationAttachments(
    input?: ProductAppReadConversationAttachmentsRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppConversationAttachmentsReadModel>>
  removeConversationAttachment(
    input: ProductAppRemoveConversationAttachmentRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppRemoveConversationAttachmentResult>>
  submitConversationOperation(
    input: ProductAppSubmitConversationOperationRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppSubmitConversationOperationResult>>
  readTrackedConversationOperation(
    input?: ProductAppReadTrackedConversationOperationRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppReadTrackedConversationOperationResult>>
  cancelTrackedConversationOperation(
    input: ProductAppCancelTrackedConversationOperationRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppCancelTrackedConversationOperationResult>>
  regenerateTrackedConversationOperation(
    input?: ProductAppRegenerateTrackedConversationOperationRequest,
    options?: ProductAppSurfaceClientRequestOptions
  ): Promise<ProductAppSurfaceClientCommandEnvelope<ProductAppRegenerateTrackedConversationOperationResult>>
  readSurfaceEvents(
    request?: ProductAppReadSurfaceEventsRequest
  ): Promise<ProductAppSurfaceClientEventsResult>
}

export interface ProductAppSurfaceClientRequestOptions {
  readonly requestId?: string
}

export type ProductAppSurfaceClientCommandEnvelope<T> =
  | {
      readonly ok: true
      readonly command: ProductAppSurfaceCommand
      readonly value: T
      readonly event: ProductAppSurfaceEvent
    }
  | {
      readonly ok: false
      readonly command: ProductAppSurfaceCommand
      readonly error: ProductAppSurfaceError
      readonly event: ProductAppSurfaceEvent
    }

export type ProductAppSurfaceClientDescriptorResult =
  | {
      readonly ok: true
      readonly value: ProductAppSurfaceDescriptor
    }
  | {
      readonly ok: false
      readonly error: ProductAppSurfaceError
    }

export type ProductAppSurfaceClientEventsResult =
  | {
      readonly ok: true
      readonly events: readonly ProductAppSurfaceEvent[]
    }
  | {
      readonly ok: false
      readonly error: ProductAppSurfaceError
    }

export function createProductAppSurfaceClient(
  transport: ProductAppSurfaceClientTransport
): ProductAppSurfaceClient {
  const events = createProductAppSurfaceClientEventFactory(Date.now)
  return {
    async descriptor() {
      try {
        const descriptor = await transport.descriptor()
        if (!isProductAppSurfaceDescriptor(descriptor)) {
          return invalidDescriptorResult()
        }
        return { ok: true, value: descriptor }
      } catch (error) {
        return {
          ok: false,
          error: normalizeProductAppSurfaceClientTransportFailure(
            error,
            "surface descriptor transport failed"
          )
        }
      }
    },
    async status(options) {
      return await dispatchTyped<ProductAppShellStatus>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.status,
        options
      })
    },
    async readHome(input, options) {
      return await dispatchTyped<ProductAppHomeReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readHome,
        input,
        options
      })
    },
    async readSettings(options) {
      return await dispatchTyped<ProductAppSettingsReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readSettings,
        options
      })
    },
    async selectSession(input, options) {
      return await dispatchTyped<ProductAppStateSnapshot>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.selectSession,
        input,
        options
      })
    },
    async setLayout(input, options) {
      return await dispatchTyped<ProductAppStateSnapshot>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.setLayout,
        input,
        options
      })
    },
    async setMode(input, options) {
      return await dispatchTyped<ProductAppStateSnapshot>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.setMode,
        input,
        options
      })
    },
    async updatePreferences(input, options) {
      return await dispatchTyped<ProductAppStateSnapshot>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.updatePreferences,
        input,
        options
      })
    },
    async listProviderProfiles(options) {
      return await dispatchTyped<ProductAppProviderProfileListReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.listProviderProfiles,
        options
      })
    },
    async readProductCommands(options) {
      return await dispatchTyped<ProductAppCommandCatalogReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readProductCommands,
        options
      })
    },
    async setActiveProviderProfile(input, options) {
      return await dispatchTyped<ProductAppProviderProfileReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.setActiveProviderProfile,
        input,
        options
      })
    },
    async dispatchProductCommand(input, options) {
      return await dispatchTyped<ProductAppCommandPortEnvelope>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.dispatchProductCommand,
        input,
        options
      })
    },
    async dispatchProductCommandJson(body, options) {
      return await dispatchTyped<ProductAppCommandPortJsonResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.dispatchProductCommandJson,
        input: body,
        options
      })
    },
    async previewProductCommandInvocation(input, options) {
      return await dispatchTyped<ProductAppCommandInvocationPreview>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.previewProductCommandInvocation,
        input,
        options
      })
    },
    async executeProductCommand(input, options) {
      return await dispatchTyped<ProductAppExecuteCommandResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.executeProductCommand,
        input,
        options
      })
    },
    async readExecutionReference(input, options) {
      return await dispatchTyped<ProductAppExecutionReferenceReadResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readExecutionReference,
        input,
        options
      })
    },
    async openWorkbench(input, options) {
      return await dispatchTyped<ProductAppOpenWorkbenchResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.openWorkbench,
        input,
        options
      })
    },
    async prepareConversationAttachment(input, options) {
      return await dispatchTyped<ProductAppPrepareConversationAttachmentResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.prepareConversationAttachment,
        input,
        options
      })
    },
    async readConversationAttachments(input, options) {
      return await dispatchTyped<ProductAppConversationAttachmentsReadModel>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readConversationAttachments,
        input,
        options
      })
    },
    async removeConversationAttachment(input, options) {
      return await dispatchTyped<ProductAppRemoveConversationAttachmentResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.removeConversationAttachment,
        input,
        options
      })
    },
    async submitConversationOperation(input, options) {
      return await dispatchTyped<ProductAppSubmitConversationOperationResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.submitConversationOperation,
        input,
        options
      })
    },
    async readTrackedConversationOperation(input, options) {
      return await dispatchTyped<ProductAppReadTrackedConversationOperationResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.readTrackedConversationOperation,
        input,
        options
      })
    },
    async cancelTrackedConversationOperation(input, options) {
      return await dispatchTyped<ProductAppCancelTrackedConversationOperationResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.cancelTrackedConversationOperation,
        input,
        options
      })
    },
    async regenerateTrackedConversationOperation(input, options) {
      return await dispatchTyped<ProductAppRegenerateTrackedConversationOperationResult>({
        transport,
        events,
        command: PRODUCT_APP_SURFACE_COMMANDS.regenerateTrackedConversationOperation,
        input,
        options
      })
    },
    async readSurfaceEvents(request) {
      try {
        const surfaceEvents = await transport.readSurfaceEvents(request)
        if (!Array.isArray(surfaceEvents)) {
          return { ok: false, error: invalidTransportResponseError() }
        }
        const invalid = surfaceEvents.some((event) => !isProductAppSurfaceEvent(event))
        if (invalid) {
          return { ok: false, error: invalidTransportResponseError() }
        }
        return { ok: true, events: surfaceEvents }
      } catch (error) {
        return {
          ok: false,
          error: normalizeProductAppSurfaceClientTransportFailure(
            error,
            "surface event transport failed"
          )
        }
      }
    }
  }
}

export function createInProcessProductAppSurfaceClientTransport(
  surface: ProductAppSurfaceAdapter
): ProductAppSurfaceClientTransport {
  return {
    descriptor() {
      return surface.descriptor()
    },
    async dispatchSurfaceCommand(request) {
      return await surface.dispatchSurfaceCommand(request)
    },
    readSurfaceEvents(request) {
      return surface.readSurfaceEvents(request)
    }
  }
}

async function dispatchTyped<T>(request: {
  readonly transport: ProductAppSurfaceClientTransport
  readonly events: ProductAppSurfaceClientEventFactory
  readonly command: ProductAppSurfaceCommand
  readonly input?: unknown
  readonly options: ProductAppSurfaceClientRequestOptions | undefined
}): Promise<ProductAppSurfaceClientCommandEnvelope<T>> {
  const commandRequest = createCommandRequest(request)
  try {
    const response = await request.transport.dispatchSurfaceCommand(commandRequest)
    if (!isProductAppSurfaceEnvelope(response, request.command)) {
      return rejectedClientEnvelope({
        events: request.events,
        command: request.command,
        requestId: request.options?.requestId,
        error: invalidTransportResponseError()
      })
    }
    return response.ok
      ? {
          ok: true,
          command: request.command,
          value: response.value as T,
          event: response.event
        }
      : {
          ok: false,
          command: request.command,
          error: response.error,
          event: response.event
        }
  } catch (error) {
    return rejectedClientEnvelope({
      events: request.events,
      command: request.command,
      requestId: request.options?.requestId,
      error: normalizeProductAppSurfaceClientTransportFailure(
        error,
        "surface command transport failed"
      )
    })
  }
}

function createCommandRequest(request: {
  readonly command: ProductAppSurfaceCommand
  readonly input?: unknown
  readonly options: ProductAppSurfaceClientRequestOptions | undefined
}): ProductAppSurfaceClientCommandRequest {
  return {
    command: request.command,
    ...(request.input === undefined ? {} : { input: request.input }),
    ...(request.options?.requestId === undefined
      ? {}
      : { requestId: request.options.requestId })
  }
}

function rejectedClientEnvelope<T>(request: {
  readonly events: ProductAppSurfaceClientEventFactory
  readonly command: ProductAppSurfaceCommand
  readonly requestId: string | undefined
  readonly error: ProductAppSurfaceError
}): ProductAppSurfaceClientCommandEnvelope<T> {
  return {
    ok: false,
    command: request.command,
    error: request.error,
    event: request.events.rejected(request)
  }
}

function invalidDescriptorResult(): ProductAppSurfaceClientDescriptorResult {
  return {
    ok: false,
    error: invalidTransportResponseError()
  }
}
