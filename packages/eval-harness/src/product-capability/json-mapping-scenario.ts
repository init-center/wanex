import { rm } from "node:fs/promises"
import {
  createProductAppBackendCommandPort,
  createProductAppBackendCommandPortJsonMapper,
  createProductAppBackendApp,
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/product-app/backend"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { createProductCapabilityStoreDir, isRecord } from "./helpers.js"

export const productAppBackendJsonMappingScenario = createEvalScenario({
  id: "product.skeleton-json-mapping-contract",
  title: "Product App Backend JSON mapping dispatches safely without a transport",
  tags: ["product-path", "command-port", "json"],
  async run(context) {
    const storeDir = await createProductCapabilityStoreDir(
      "wanex-eval-product-json-"
    )
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      }
    })
    const mapper = createProductAppBackendCommandPortJsonMapper(
      createProductAppBackendCommandPort(app)
    )

    try {
      const results = await runJsonMappingAssertions(mapper)
      return results
    } finally {
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function runJsonMappingAssertions(
  mapper: ReturnType<typeof createProductAppBackendCommandPortJsonMapper>
): Promise<Record<string, string | boolean>> {
  const capabilities = await mapper.dispatchJson(
    JSON.stringify({
      command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
    })
  )
  const route = await mapper.dispatchJson(
    JSON.stringify({
      command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
      input: {
        text: "/status"
      }
    })
  )
  const malformedJson = await mapper.dispatchJson("{bad json")
  const malformedEnvelope = await mapper.dispatchJson(
    JSON.stringify({
      input: {
        text: "missing command"
      }
    })
  )
  const unsupported = await mapper.dispatchJson(
    JSON.stringify({
      command: "plugin.run"
    })
  )
  const invalidPayload = await mapper.dispatchJson(
    JSON.stringify({
      command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.runAgentTurn,
      input: {
        sessionId: "ses_eval_json_missing_text"
      }
    })
  )

  assert(
    capabilities.status === "success" && capabilities.envelope.ok,
    "capability JSON request should dispatch successfully"
  )
  assert(
    route.status === "success" && route.envelope.ok,
    "route JSON request should dispatch successfully"
  )
  assert(
    malformedJson.status === "validation_error" && !malformedJson.envelope.ok,
    "malformed JSON should return a validation envelope"
  )
  assert(
    malformedEnvelope.status === "validation_error" &&
      !malformedEnvelope.envelope.ok,
    "malformed command envelope should return a validation envelope"
  )
  assert(
    unsupported.status === "unknown_command" && !unsupported.envelope.ok,
    "unsupported command should return unknown_command"
  )
  assert(
    invalidPayload.status === "validation_error" && !invalidPayload.envelope.ok,
    "invalid command payload should return validation_error"
  )

  const capabilityValue = capabilities.envelope.value
  const routeValue = route.envelope.value
  assert(
    isRecord(capabilityValue) && capabilityValue.selectedCount === 7,
    "capability JSON envelope should expose selectedCount"
  )
  assert(
    isRecord(routeValue) &&
      routeValue.kind === "read_model" &&
      routeValue.command === "status",
    "route JSON envelope should expose status read model"
  )
  assert(
    parseJsonEnvelope(route.body).ok === true,
    "JSON mapping body should be parseable as a safe envelope"
  )

  return {
    capabilityStatus: capabilities.status,
    routeStatus: route.status,
    malformedJsonStatus: malformedJson.status,
    malformedEnvelopeStatus: malformedEnvelope.status,
    unsupportedStatus: unsupported.status,
    invalidPayloadStatus: invalidPayload.status,
    routeBodyOk: parseJsonEnvelope(route.body).ok
  }
}

function parseJsonEnvelope(text: string): Record<string, unknown> & {
  readonly ok: boolean
} {
  const parsed = JSON.parse(text) as unknown
  assert(isRecord(parsed), "JSON mapping body should be a JSON object")
  assert(typeof parsed.ok === "boolean", "JSON mapping body should include ok")
  return parsed as Record<string, unknown> & { readonly ok: boolean }
}
