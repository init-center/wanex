import {
  assertProductAppBackendPortNoInput
} from "./command-port-input-core.js"
import {
  parseProductAppBackendPortDiagnosticsDetailOptions,
  parseProductAppBackendPortOverviewOptions
} from "./command-port-input-diagnostics.js"
import {
  parseProductAppBackendPortExplainCommandContributionInput,
  parseProductAppBackendPortExecuteProductCommandInput,
  parseProductAppBackendPortPreviewCommandInvocationInput
} from "./command-port-input-command.js"
import {
  parseProductAppBackendPortRecentSessionsInput,
  parseProductAppBackendPortSessionInputProvenanceInput,
  parseProductAppBackendPortSessionTranscriptInput
} from "./command-port-input-read-model.js"
import {
  parseProductAppBackendPortWorkbenchInput
} from "./command-port-input-workbench.js"
import {
  runProductAppBackendCommandPortSafe,
  unreachableProductAppBackendPortCommand
} from "./command-port-envelope.js"
import type {
  ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendCommandRegistryReadModel,
  ProductAppBackendCommandPortRequest
} from "./types.js"

export async function dispatchProductAppBackendReadModelPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "status":
      return await runProductAppBackendCommandPortSafe({
        command,
        run() {
          assertProductAppBackendPortNoInput(command, request.input)
          return app.status()
        }
      })
    case "readProductOverview":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductOverview(
            parseProductAppBackendPortOverviewOptions(request.input)
          )
        }
      })
    case "readProductDiagnosticsDetail":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductDiagnosticsDetail(
            parseProductAppBackendPortDiagnosticsDetailOptions(request.input)
          )
        }
      })
    case "readRecentSessions":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readRecentSessions(
            parseProductAppBackendPortRecentSessionsInput(request.input)
          )
        }
      })
    case "readProductWorkbench":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductWorkbench(
            parseProductAppBackendPortWorkbenchInput(request.input)
          )
        }
      })
    case "readProductCapabilities":
      return await runProductAppBackendCommandPortSafe({
        command,
        run() {
          assertProductAppBackendPortNoInput(command, request.input)
          return app.commands.readProductCapabilities()
        }
      })
    case "readProductCommands":
      return await runProductAppBackendCommandPortSafe({
        command,
        run(): ProductAppBackendCommandRegistryReadModel {
          assertProductAppBackendPortNoInput(command, request.input)
          return app.commands.readProductCommands()
        }
      })
    case "explainProductCommandContribution":
      return await runProductAppBackendCommandPortSafe({
        command,
        run() {
          return app.commands.explainProductCommandContribution(
            parseProductAppBackendPortExplainCommandContributionInput(request.input)
          )
        }
      })
    case "previewProductCommandInvocation":
      return await runProductAppBackendCommandPortSafe({
        command,
        run() {
          return app.commands.previewProductCommandInvocation(
            parseProductAppBackendPortPreviewCommandInvocationInput(request.input)
          )
        }
      })
    case "executeProductCommand":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.executeProductCommand(
            parseProductAppBackendPortExecuteProductCommandInput(request.input)
          )
        }
      })
    case "readSessionInputProvenance":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readSessionInputProvenance(
            parseProductAppBackendPortSessionInputProvenanceInput(request.input)
          )
        }
      })
    case "readSessionTranscript":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readSessionTranscript(
            parseProductAppBackendPortSessionTranscriptInput(request.input)
          )
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
