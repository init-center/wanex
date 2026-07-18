import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  createProductAppBackendShell
} from "@wanex/product-app/backend"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

const sessionId = "ses_eval_product_workbench"

export const productAppBackendWorkbenchScenario = createEvalScenario({
  id: "product.skeleton-workbench-contract",
  title: "App Shell command runtime reads and continues selected sessions",
  tags: ["product-path", "workbench", "session"],
  async run(context) {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-eval-product-workbench-"))
    const shell = await createProductAppBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      providerProfile: {
        id: "eval-product-workbench",
        modelId: "eval-product-workbench-model"
      }
    })

    try {
      await shell.commands.runAgentTurn({
        text: "seed workbench",
        sessionId
      })
      const typed = await shell.commands.readProductWorkbench({ sessionId })
      const port = await shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
        input: { sessionId }
      })
      const continued = await shell.dispatchJson(
        JSON.stringify({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.continueProductWorkbenchSession,
          input: {
            sessionId,
            text: "continue workbench"
          }
        })
      )

      assertWorkbench(typed, 1, "seed workbench")
      assert(port.ok, "workbench command-port dispatch should succeed")
      assertWorkbench(port.value, 1, "seed workbench")
      assert(
        continued.status === "success" && continued.envelope.ok,
        "workbench continue JSON dispatch should succeed"
      )
      assertContinued(continued.envelope.value)

      return {
        sessionId,
        typedInputCount: typed.summary.inputCount,
        typedMessageCount: typed.summary.messageCount,
        continuedInputCount: continued.envelope.value.workbench.summary.inputCount,
        continuedMessageCount:
          continued.envelope.value.workbench.summary.messageCount,
        latestUserText:
          continued.envelope.value.workbench.summary.latestUserText ?? "",
        continueKind: continued.envelope.value.kind
      }
    } finally {
      await shell.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function assertWorkbench(
  value: unknown,
  inputCount: number,
  latestUserText: string
): void {
  assert(isRecord(value), "workbench should be an object")
  assert(value.kind === "product-app.backend.workbench", "workbench kind should match")
  assert(value.sessionId === sessionId, "workbench sessionId should match")
  assert(isRecord(value.summary), "workbench should include summary")
  assert(value.summary.inputCount === inputCount, "workbench input count should match")
  assert(value.summary.messageCount === inputCount, "workbench message count should match")
  assert(
    value.summary.latestUserText === latestUserText,
    "workbench latest user text should match"
  )
  assert(
    Array.isArray(value.summary.originKinds) &&
      value.summary.originKinds.includes("interactive"),
    "workbench should summarize provenance origins"
  )
  assert(isRecord(value.actions), "workbench should include actions")
  assert(
    value.actions.continueCommandId === "product.workbench.continue",
    "workbench should expose continue action"
  )
}

function assertContinued(value: unknown): asserts value is {
  readonly kind: "product-app.backend.workbench.continued"
  readonly workbench: {
    readonly summary: {
      readonly inputCount: number
      readonly messageCount: number
      readonly latestUserText?: string
    }
  }
} {
  assert(isRecord(value), "continued workbench should be an object")
  assert(
    value.kind === "product-app.backend.workbench.continued",
    "continued workbench kind should match"
  )
  assert(isRecord(value.workbench), "continued workbench should include workbench")
  assertWorkbench(value.workbench, 2, "continue workbench")
}
