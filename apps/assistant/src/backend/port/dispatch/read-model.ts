import {
  assertBackendPortNoInput
} from "../input/core.js"
import {
  parseBackendPortDiagnosticsDetailOptions,
  parseBackendPortOverviewOptions
} from "../input/diagnostics.js"
import {
  parseBackendPortExplainCommandContributionInput,
  parseBackendPortExecuteAssistantCommandInput,
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
    case "readAssistantOverview":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readAssistantOverview(
            parseBackendPortOverviewOptions(request.input)
          )
        }
      })
    case "readAssistantDiagnosticsDetail":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readAssistantDiagnosticsDetail(
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
    case "readAssistantWorkbench":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readAssistantWorkbench(
            parseBackendPortWorkbenchInput(request.input)
          )
        }
      })
    case "readAssistantCapabilities":
      return await runBackendCommandPortSafe({
        command,
        run() {
          assertBackendPortNoInput(command, request.input)
          return app.commands.readAssistantCapabilities()
        }
      })
    case "readAssistantCommands":
      return await runBackendCommandPortSafe({
        command,
        run(): BackendCommandRegistryReadModel {
          assertBackendPortNoInput(command, request.input)
          return app.commands.readAssistantCommands()
        }
      })
    case "explainAssistantCommandContribution":
      return await runBackendCommandPortSafe({
        command,
        run() {
          return app.commands.explainAssistantCommandContribution(
            parseBackendPortExplainCommandContributionInput(request.input)
          )
        }
      })
    case "previewAssistantCommandInvocation":
      return await runBackendCommandPortSafe({
        command,
        run() {
          return app.commands.previewAssistantCommandInvocation(
            parseBackendPortPreviewCommandInvocationInput(request.input)
          )
        }
      })
    case "executeAssistantCommand":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.executeAssistantCommand(
            parseBackendPortExecuteAssistantCommandInput(request.input)
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
