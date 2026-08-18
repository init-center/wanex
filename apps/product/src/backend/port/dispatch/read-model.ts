import {
  assertBackendPortNoInput
} from "../input/core.js"
import {
  parseBackendPortDiagnosticsDetailOptions,
  parseBackendPortOverviewOptions
} from "../input/diagnostics.js"
import {
  parseBackendPortExplainCommandContributionInput,
  parseBackendPortExecuteProductCommandInput,
  parseBackendPortPreviewCommandInvocationInput
} from "../input/command.js"
import {
  parseBackendPortRecentSessionsInput,
  parseBackendPortSessionInputProvenanceInput,
  parseBackendPortSessionTranscriptInput
} from "../input/read-model.js"
import {
  parseBackendPortWorkbenchInput
} from "../input/workbench.js"
import {
  runBackendCommandPortSafe,
  unreachableBackendPortCommand
} from "../envelope.js"
import type {
  BackendCommandPortEnvelope
} from "../contract.js"
import type {
  BackendApp,
  BackendCommandRegistryReadModel,
  BackendCommandPortRequest
} from "../../model/index.js"

export async function dispatchBackendReadModelPortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "status":
      return await runBackendCommandPortSafe({
        command,
        run() {
          assertBackendPortNoInput(command, request.input)
          return app.status()
        }
      })
    case "readProductOverview":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductOverview(
            parseBackendPortOverviewOptions(request.input)
          )
        }
      })
    case "readProductDiagnosticsDetail":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductDiagnosticsDetail(
            parseBackendPortDiagnosticsDetailOptions(request.input)
          )
        }
      })
    case "readRecentSessions":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readRecentSessions(
            parseBackendPortRecentSessionsInput(request.input)
          )
        }
      })
    case "readProductWorkbench":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readProductWorkbench(
            parseBackendPortWorkbenchInput(request.input)
          )
        }
      })
    case "readProductCapabilities":
      return await runBackendCommandPortSafe({
        command,
        run() {
          assertBackendPortNoInput(command, request.input)
          return app.commands.readProductCapabilities()
        }
      })
    case "readProductCommands":
      return await runBackendCommandPortSafe({
        command,
        run(): BackendCommandRegistryReadModel {
          assertBackendPortNoInput(command, request.input)
          return app.commands.readProductCommands()
        }
      })
    case "explainProductCommandContribution":
      return await runBackendCommandPortSafe({
        command,
        run() {
          return app.commands.explainProductCommandContribution(
            parseBackendPortExplainCommandContributionInput(request.input)
          )
        }
      })
    case "previewProductCommandInvocation":
      return await runBackendCommandPortSafe({
        command,
        run() {
          return app.commands.previewProductCommandInvocation(
            parseBackendPortPreviewCommandInvocationInput(request.input)
          )
        }
      })
    case "executeProductCommand":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.executeProductCommand(
            parseBackendPortExecuteProductCommandInput(request.input)
          )
        }
      })
    case "readSessionInputProvenance":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readSessionInputProvenance(
            parseBackendPortSessionInputProvenanceInput(request.input)
          )
        }
      })
    case "readSessionTranscript":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readSessionTranscript(
            parseBackendPortSessionTranscriptInput(request.input)
          )
        }
      })
  }
  return unreachableBackendPortCommand(command)
}
