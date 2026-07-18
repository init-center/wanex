import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createProductAppBackendShell,
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS
} from "@wanex/product-app/backend"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "./distribution-audit.js"
import { assertProductAppBackendClosureExcludes } from "./product-app-backend-eval-utils.js"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

export const productAppBackendBackendShellScenario = createEvalScenario({
  id: "product.skeleton-backend-shell-contract",
  title: "App Shell command runtime owns local app dispatch lifecycle",
  tags: ["product-path", "backend-shell", "distribution"],
  async run(context) {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-eval-product-shell-"))
    const shell = await createProductAppBackendShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: context.serviceBin },
      providerProfile: {
        id: "eval-product-backend-shell",
        modelId: "eval-product-backend-shell-model"
      }
    })

    try {
      const initialStatus = shell.status()
      const typedCapabilities = shell.commands.readProductCapabilities()
      const route = await shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: { text: "/status" }
      })
      const json = await shell.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
        })
      )
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const closureExcludes = assertProductAppBackendClosureExcludes(
        entryByName(footprint, "@wanex/app"),
        "backend shell"
      )

      assert(
        !initialStatus.disposed &&
          initialStatus.providerProfileId === "eval-product-backend-shell" &&
          typedCapabilities.selectedCount === 7,
        "backend shell should expose initial status and typed commands"
      )
      assert(
        route.ok && json.status === "success" && json.envelope.ok,
        "backend shell dispatch should succeed through command and JSON paths"
      )

      const routeValue = route.value
      const jsonValue = json.envelope.value
      assert(
        isRecord(routeValue) &&
          routeValue.kind === "read_model" &&
          routeValue.command === "status" &&
          isRecord(jsonValue) &&
          jsonValue.selectedCount === 7,
        "backend shell dispatch should project route and JSON read models"
      )

      await shell.dispose()
      const disposedStatus = shell.status()
      await shell.dispose()
      const afterDispose = await shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readDiagnostics
      })
      assert(
        disposedStatus.disposed &&
          !afterDispose.ok &&
          afterDispose.error.code === "lifecycle_error" &&
          afterDispose.error.message === "product app backend is disposed",
        "backend shell should dispose safely and project lifecycle errors"
      )

      return {
        providerProfileId: initialStatus.providerProfileId,
        selectedCount: typedCapabilities.selectedCount,
        routeCommand: routeValue.command,
        jsonStatus: json.status,
        disposed: disposedStatus.disposed,
        afterDisposeCode: afterDispose.error.code,
        closureExcludes
      }
    } finally {
      await shell.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
