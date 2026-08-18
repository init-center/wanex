import {
  createBackendShell,
  BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/product/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { assertBackendClosureExcludes } from "./product-backend-eval-utils.js"
import {
  createConversationSettlementFixture
} from "./product/conversation-helpers.js"
import { createEvalScenario } from "./runner.js"
import { assert, evalFakeModelEndpoint, isRecord } from "./scenario-utils.js"

export const backendDiagnosticsDetailScenario = createEvalScenario({
  id: "product.skeleton-diagnostics-detail-contract",
  title: "App command runtime projects diagnostics detail state",
  tags: ["product-path", "diagnostics", "command-port", "distribution"],
  async run(context) {
    const storage = await createConversationSettlementFixture({
      serviceBin: context.serviceBin,
      prefix: "wanex-eval-product-diagnostics-detail-"
    })
    const shell = await createBackendShell({
      storage: storage.storage,
      modelEndpoint: evalFakeModelEndpoint(
        "eval-product-diagnostics-detail",
        "eval-product-diagnostics-detail-model"
      )
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed eval diagnostics detail" }],
        sessionId: "ses_eval_product_diagnostics_detail"
      })
      await storage.settlements.waitForJob(receipt.jobId)

      const typed = await shell.commands.readProductDiagnosticsDetail({
        now: 8_201,
        diagnosticLimit: 1,
        activityLimit: 1
      })
      const port = await shell.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
        input: {
          now: 8_202,
          diagnosticLimit: 2,
          activityLimit: 2
        }
      })
      const json = await shell.dispatchJson(
        JSON.stringify({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
          input: {
            now: 8_203,
            diagnosticLimit: 2,
            activityLimit: 2
          }
        })
      )
      const rejected = await shell.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
        input: "bad"
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const closureExcludes = assertBackendClosureExcludes(
        entryByName(footprint, "@wanex/app"),
        "diagnostics detail"
      )

      assertDiagnosticsDetail(typed, 8_201)
      assert(port.ok, "diagnostics detail command-port dispatch should succeed")
      assertDiagnosticsDetail(port.value, 8_202)
      assert(
        json.status === "success" && json.envelope.ok,
        "diagnostics detail JSON dispatch should succeed"
      )
      assertDiagnosticsDetail(json.envelope.value, 8_203)
      assert(
        !rejected.ok &&
          rejected.error.code === "validation_error" &&
          rejected.error.message ===
            "readProductDiagnosticsDetail input must be an object",
        "diagnostics detail command-port input should fail closed"
      )

      return {
        typedGeneratedAt: typed.generatedAt,
        portGeneratedAt: isRecord(port.value) ? port.value.generatedAt : null,
        jsonGeneratedAt: json.envelope.ok && isRecord(json.envelope.value)
          ? json.envelope.value.generatedAt
          : null,
        diagnosticCount: typed.diagnostics.length,
        activityCount: typed.activity.length,
        sourceCount: typed.sources.length,
        rejectedCode: rejected.error.code,
        closureExcludes
      }
    } finally {
      await shell.dispose()
      await storage.dispose()
    }
  }
})

function assertDiagnosticsDetail(
  value: unknown,
  generatedAt: number
): asserts value is {
  readonly generatedAt: number
  readonly diagnostics: readonly unknown[]
  readonly activity: readonly unknown[]
  readonly sources: readonly unknown[]
} {
  assert(isRecord(value), "diagnostics detail should be an object")
  assert(
    value.kind === "product.backend.diagnostics-detail",
    "diagnostics detail kind should match"
  )
  assert(
    value.generatedAt === generatedAt,
    "diagnostics detail generatedAt should match"
  )
  assert(isRecord(value.summary), "diagnostics detail should include summary")
  assert(
    Array.isArray(value.diagnostics) &&
      value.diagnostics.length > 0 &&
      value.diagnostics.every((row) => isRecord(row) && row.hasDetail === true),
    "diagnostics detail should expose summary rows with detail presence"
  )
  assert(
    Array.isArray(value.activity) &&
      value.activity.length > 0 &&
      value.activity.every((row) => isRecord(row) && row.hasDetail === true),
    "diagnostics detail should expose activity rows with detail presence"
  )
  assert(
    Array.isArray(value.sources) &&
      value.sources.some(
        (source) => isRecord(source) && source.source === "scheduler"
      ),
    "diagnostics detail should summarize scheduler source"
  )
  assert(isRecord(value.limits), "diagnostics detail should include limits")
}
