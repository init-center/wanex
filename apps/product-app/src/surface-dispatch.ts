import type {
  ProductAppShell
} from "./types.js"
import {
  expectProductAppSurfaceNoInput,
  parseProductAppSurfaceCommandExecutionRequest,
  parseProductAppSurfaceExecutionReferenceRequest,
  parseProductAppSurfaceCommandInvocationPreviewRequest,
  parseProductAppSurfaceContinueWorkbenchRequest,
  parseProductAppSurfaceHomeOptions,
  parseProductAppSurfaceJsonBody,
  parseProductAppSurfaceLayout,
  parseProductAppSurfaceMode,
  parseProductAppSurfaceOpenWorkbenchRequest,
  parseProductAppSurfacePreferencesPatch,
  parseProductAppSurfaceProviderProfileSelector,
  parseProductAppSurfaceProductCommandRequest,
  parseProductAppSurfaceSessionSelector,
  parseProductAppSurfaceStartWorkbenchRequest
} from "./surface-input.js"
import type {
  ProductAppSurfaceCommand,
  ProductAppSurfaceCommandRequest
} from "./types-surface.js"

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
      return await app.providerProfiles.listProviderProfiles()
    case "readProductCommands":
      expectProductAppSurfaceNoInput(request.input, "readProductCommands")
      return app.readProductCommands()
    case "setActiveProviderProfile":
      return await app.providerProfiles.setActiveProviderProfile(
        parseProductAppSurfaceProviderProfileSelector(request.input)
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
    case "startWorkbench":
      return await app.startWorkbench(
        parseProductAppSurfaceStartWorkbenchRequest(request.input)
      )
    case "continueWorkbench":
      return await app.continueWorkbench(
        parseProductAppSurfaceContinueWorkbenchRequest(request.input)
      )
  }
}
