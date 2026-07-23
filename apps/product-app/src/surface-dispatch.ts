import type {
  ProductAppShell
} from "./types.js"
import {
  expectProductAppSurfaceNoInput,
  parseProductAppSurfaceCommandExecutionRequest,
  parseProductAppSurfaceExecutionReferenceRequest,
  parseProductAppSurfaceCommandInvocationPreviewRequest,
  parseProductAppSurfaceCancelConversationRequest,
  parseProductAppSurfaceConversationReadRequest,
  parseProductAppSurfaceConversationRegenerateRequest,
  parseProductAppSurfaceConversationSubmitRequest,
  parseProductAppSurfaceHomeOptions,
  parseProductAppSurfaceJsonBody,
  parseProductAppSurfaceLayout,
  parseProductAppSurfaceMode,
  parseProductAppSurfaceOpenWorkbenchRequest,
  parseProductAppSurfacePrepareConversationAttachmentRequest,
  parseProductAppSurfaceReadConversationAttachmentsRequest,
  parseProductAppSurfaceRemoveConversationAttachmentRequest,
  parseProductAppSurfacePreferencesPatch,
  parseProductAppSurfaceProviderProfileSelector,
  parseProductAppSurfaceProductCommandRequest,
  parseProductAppSurfaceSessionSelector,
} from "./surface-input.js"
import type {
  ProductAppSurfaceCommand,
  ProductAppSurfaceCommandRequest
} from "./types-surface.js"
import {
  projectProductAppProviderProfile,
  projectProductAppProviderProfiles
} from "./provider-readiness.js"

export async function runProductAppSurfaceCommand(
  app: ProductAppShell,
  request: ProductAppSurfaceCommandRequest
): Promise<unknown> {
  switch (request.command as ProductAppSurfaceCommand) {
    case "status":
      expectProductAppSurfaceNoInput(request.input, "status")
      return app.status()
    case "readHome":
      return await app.readHome(
        parseProductAppSurfaceHomeOptions(request.input)
      )
    case "readSettings":
      expectProductAppSurfaceNoInput(request.input, "readSettings")
      return app.readSettings()
    case "selectSession":
      return app.selectSession(
        parseProductAppSurfaceSessionSelector(request.input)
      )
    case "setLayout":
      return app.setLayout({
        layout: parseProductAppSurfaceLayout(request.input)
      })
    case "setMode":
      return app.setMode({
        mode: parseProductAppSurfaceMode(request.input)
      })
    case "updatePreferences":
      return app.updatePreferences(
        parseProductAppSurfacePreferencesPatch(request.input)
      )
    case "listProviderProfiles":
      expectProductAppSurfaceNoInput(request.input, "listProviderProfiles")
      return projectProductAppProviderProfiles(
        await app.providerProfiles.listProviderProfiles()
      )
    case "readProductCommands":
      expectProductAppSurfaceNoInput(request.input, "readProductCommands")
      return app.readProductCommands()
    case "setActiveProviderProfile":
      return projectProductAppProviderProfile(
        await app.providerProfiles.setActiveProviderProfile(
          parseProductAppSurfaceProviderProfileSelector(request.input)
        )
      )
    case "dispatchProductCommand":
      return await app.dispatchProductCommand(
        parseProductAppSurfaceProductCommandRequest(request.input)
      )
    case "dispatchProductCommandJson":
      return await app.dispatchProductCommandJson(
        parseProductAppSurfaceJsonBody(request.input)
      )
    case "previewProductCommandInvocation":
      return await app.previewProductCommandInvocation(
        parseProductAppSurfaceCommandInvocationPreviewRequest(request.input)
      )
    case "executeProductCommand":
      return await app.executeProductCommand(
        parseProductAppSurfaceCommandExecutionRequest(request.input)
      )
    case "readExecutionReference":
      return await app.readExecutionReference(
        parseProductAppSurfaceExecutionReferenceRequest(request.input)
      )
    case "openWorkbench":
      return await app.openWorkbench(
        parseProductAppSurfaceOpenWorkbenchRequest(request.input)
      )
    case "prepareConversationAttachment":
      return await app.prepareConversationAttachment(
        parseProductAppSurfacePrepareConversationAttachmentRequest(request.input)
      )
    case "readConversationAttachments":
      return app.readConversationAttachments(
        parseProductAppSurfaceReadConversationAttachmentsRequest(request.input)
      )
    case "removeConversationAttachment":
      return await app.removeConversationAttachment(
        parseProductAppSurfaceRemoveConversationAttachmentRequest(request.input)
      )
    case "submitConversationOperation":
      return await app.submitConversationOperation(
        parseProductAppSurfaceConversationSubmitRequest(request.input)
      )
    case "readTrackedConversationOperation":
      return await app.readTrackedConversationOperation(
        parseProductAppSurfaceConversationReadRequest(request.input)
      )
    case "cancelTrackedConversationOperation":
      return await app.cancelTrackedConversationOperation(
        parseProductAppSurfaceCancelConversationRequest(request.input)
      )
    case "regenerateTrackedConversationOperation":
      return await app.regenerateTrackedConversationOperation(
        parseProductAppSurfaceConversationRegenerateRequest(request.input)
      )
  }
}
