import { rm } from "node:fs/promises"
import {
  createProductAppBackendCommandPort,
  createProductAppBackendApp,
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/product-app/backend"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { createProductCapabilityStoreDir, isRecord } from "./helpers.js"

export const productAppBackendCommandPortScenario = createEvalScenario({
  id: "product.skeleton-command-port-contract",
  title: "Product App Backend exposes a reusable safe command port",
  tags: ["product-path", "command-port"],
  async run(context) {
    const storeDir = await createProductCapabilityStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-port",
        modelId: "eval-product-port-model"
      }
    })
    const port = createProductAppBackendCommandPort(app)

    try {
      const capabilities = await port.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
      })
      const commands = await port.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCommands
      })
      const explanation = await port.dispatch({
        command:
          PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.explainProductCommandContribution,
        input: {
          commandId: "product.agent.run"
        }
      })
      const preview = await port.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation,
        input: {
          commandId: "product.agent.run",
          input: {
            text: "preview through product command port"
          }
        }
      })
      const route = await port.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: {
          text: "/status"
        }
      })
      const run = await port.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.executeProductCommand,
        input: {
          commandId: "product.agent.run",
          input: {
            text: "through product command port",
            sessionId: "ses_eval_product_app_backend_command_port"
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
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: {
          text: "/missing"
        }
      })

      assert(capabilities.ok, "capability command port request should succeed")
      assert(commands.ok, "command registry port request should succeed")
      assert(explanation.ok, "command explanation port request should succeed")
      assert(preview.ok, "command preview port request should succeed")
      assert(route.ok, "route port request should succeed")
      assert(run.ok, "execute product command port request should succeed")
      assert(!rejected.ok, "unknown port command should fail closed")
      assert(!malformed.ok, "malformed port request should fail closed")
      assert(!invalid.ok, "unknown product slash command should fail closed")

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
            (item) => isRecord(item) && item.id === "product.agent.run"
          ),
        "command port should expose product command contributions"
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
          runValue.kind === "completed" &&
          isRecord(runValue.value) &&
          runValue.value.assistantText ===
            "Fake response from eval-product-port-model",
        "executeProductCommand port request should run through the product allow-list"
      )
      const runResult = runValue.value
      assert(
        typeof routeValue.command === "string",
        "route command should be a string"
      )
      assert(
        typeof runResult.assistantText === "string",
        "assistant text should be a string"
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
        assistantText: runResult.assistantText,
        unknownPortCode: rejected.error.code,
        malformedPortCode: malformed.error.code,
        unknownRouteCode: invalid.error.code
      }
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
