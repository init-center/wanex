import {
  createBackendCommandPort,
  createBackendApp,
  BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/assistant/backend"
import { createEvalScenario } from "../runner.js"
import {
  createConversationSettlementFixture
} from "../assistant/conversation-helpers.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"
import { isRecord } from "./helpers.js"

export const backendCommandPortScenario = createEvalScenario({
  id: "assistant.skeleton-command-port-contract",
  title: "application backend exposes a reusable safe command port",
  tags: ["assistant-path", "command-port"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-assistant-backend-command-port-"
    })
    const app = await createBackendApp({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-assistant-port",
        "eval-assistant-port-model"
      )
    })
    const port = createBackendCommandPort(app)

    try {
      const capabilities = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantCapabilities
      })
      const commands = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantCommands
      })
      const explanation = await port.dispatch({
        command:
          BACKEND_COMMAND_PORT_COMMANDS.explainAssistantCommandContribution,
        input: {
          commandId: "assistant.agent.submit"
        }
      })
      const preview = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.previewAssistantCommandInvocation,
        input: {
          commandId: "assistant.agent.submit",
          input: {
            text: "preview through assistant command port"
          }
        }
      })
      const route = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: {
          text: "/status"
        }
      })
      const run = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.executeAssistantCommand,
        input: {
          commandId: "assistant.agent.submit",
          input: {
            text: "through assistant command port",
            sessionId: "ses_eval_assistant_app_backend_command_port"
          }
        }
      })
      const rejected = await port.dispatch({
        command: "plugin.run",
        input: {
          commandId: "plugin.echo"
        }
      })
      const malformed = await port.dispatch({
        input: {
          text: "missing command"
        }
      })
      const invalid = await port.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: {
          text: "/missing"
        }
      })

      assert(capabilities.ok, "capability command port request should succeed")
      assert(commands.ok, "command registry port request should succeed")
      assert(explanation.ok, "command explanation port request should succeed")
      assert(preview.ok, "command preview port request should succeed")
      assert(route.ok, "route port request should succeed")
      assert(run.ok, "execute assistant command port request should succeed")
      assert(!rejected.ok, "unknown port command should fail closed")
      assert(!malformed.ok, "malformed port request should fail closed")
      assert(!invalid.ok, "unknown assistant slash command should fail closed")

      const capabilityValue = capabilities.value
      const commandValue = commands.value
      const explanationValue = explanation.value
      const previewValue = preview.value
      const routeValue = route.value
      const runValue = run.value

      assert(
        isRecord(capabilityValue) && capabilityValue.selectedCount === 7,
        "capability port value should expose selected capability count"
      )
      assert(
        typeof capabilityValue.selectedCount === "number",
        "capability selected count should be numeric"
      )
      assert(
        isRecord(commandValue) &&
          Array.isArray(commandValue.commands) &&
          commandValue.commands.some(
            (item) => isRecord(item) && item.id === "assistant.agent.submit"
          ),
        "command port should expose assistant command contributions"
      )
      const commandRows = commandValue.commands
      assert(
        isRecord(explanationValue) &&
          explanationValue.kind === "found" &&
          isRecord(explanationValue.handler) &&
          explanationValue.handler.supported === true,
        "command explanation should expose allow-listed handler policy"
      )
      assert(
        isRecord(previewValue) &&
          previewValue.kind === "runnable" &&
          previewValue.inputAccepted === true,
        "command preview should validate invocation without execution"
      )
      assert(
        isRecord(routeValue) &&
          routeValue.kind === "read_model" &&
          routeValue.command === "status",
        "route port should return the deterministic status read model"
      )
      assert(
        isRecord(runValue) &&
          runValue.kind === "submitted" &&
          isRecord(runValue.value) &&
          runValue.value.sessionId ===
            "ses_eval_assistant_app_backend_command_port" &&
          typeof runValue.value.jobId === "string" &&
          typeof runValue.value.state === "string",
        "executeAssistantCommand should return a submitted asynchronous conversation receipt"
      )
      const runResult = runValue.value
      await storage.settlements.waitForJob(String(runResult.jobId))
      assert(
        typeof routeValue.command === "string",
        "route command should be a string"
      )
      assert(
        typeof runResult.state === "string",
        "conversation receipt state should be a string"
      )
      assert(
        rejected.error.code === "unknown_command",
        "unknown port commands should use the safe unknown_command code"
      )
      assert(
        malformed.error.code === "validation_error",
        "malformed port requests should use the safe validation_error code"
      )
      assert(
        invalid.error.code === "unknown_command",
        "route errors should be projected into safe envelopes"
      )

      return {
        selectedCount: capabilityValue.selectedCount,
        commandCount: commandRows.length,
        explanationKind: explanationValue.kind,
        explanationHandlerSupported:
          isRecord(explanationValue) && isRecord(explanationValue.handler)
            ? explanationValue.handler.supported === true
            : false,
        previewKind: previewValue.kind,
        previewInputAccepted:
          isRecord(previewValue) && previewValue.inputAccepted === true,
        routeCommand: routeValue.command,
        operationState: runResult.state,
        operationSessionId: String(runResult.sessionId),
        unknownPortCode: rejected.error.code,
        malformedPortCode: malformed.error.code,
        unknownRouteCode: invalid.error.code
      }
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  }
})
