import { rm } from "node:fs/promises"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter
} from "@wanex/product-app"
import {
  createProductAppWebController,
  handleProductAppWebRequest,
  type ProductAppWebResponse
} from "@wanex/product-app-web"
import {
  createProductAppWebHostSurfaceClient
} from "@wanex/product-app-web/host"
import {
  listenProductAppWebNodeHost,
  type ProductAppWebNodeHostServer
} from "@wanex/product-app-local/web-host"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"

export const productAppWebSurfaceContractScenario = createEvalScenario({
  id: "product.app-web-surface-contract",
  title: "Product App Web surface consumes only the renderer-side message client",
  tags: [
    "product-app",
    "product-app-web",
    "surface",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-web-")
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      },
      providerProfile: {
        id: "eval-product-app-web",
        modelId: "eval-product-app-web-model"
      }
    })
    const productSurface = createProductAppSurfaceAdapter(app)
    const operations: string[] = []
    const surfaceCommands: string[] = []
    const client = createProductAppWebHostSurfaceClient({
      surface: productSurface,
      observeRequest(request) {
        operations.push(request.operation)
        if (
          request.operation === "dispatchSurfaceCommand" &&
          typeof request.command.command === "string"
        ) {
          surfaceCommands.push(request.command.command)
        }
      }
    })

    let nodeHost: ProductAppWebNodeHostServer | undefined
    try {
      const web = await createProductAppWebController({
        client,
        now: () => 12_001
      })
      nodeHost = await listenProductAppWebNodeHost({ controller: web })
      const initial = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "document",
        requestId: "eval_web_document"
      })
      const startedWorkbench = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_start_workbench",
        input: {
          action: "start-workbench",
          fields: {
            text: "eval product app web started workbench"
          }
        }
      })
      const selected = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_select",
        input: {
          action: "select-session",
          fields: {
            sessionId: "ses_eval_product_app_web"
          }
        }
      })
      const mode = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_mode",
        input: {
          action: "set-mode",
          fields: {
            mode: "workbench"
          }
        }
      })
      const commandPreview = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_preview_command",
        input: {
          action: "preview-command",
          fields: {
            commandId: "product.agent.run",
            inputJson: "{\"text\":\"eval product app web preview\"}"
          }
        }
      })
      const commandExecution = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_execute_command",
        input: {
          action: "execute-command",
          fields: {
            commandId: "product.status"
          }
        }
      })
      await app.startWorkbench({
        text: "eval product app web tracked execution",
        sessionId: "ses_eval_product_app_web",
        jobId: "job_eval_product_app_web_execution"
      })
      const executionActivity = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_execution_activity",
        input: {
          action: "refresh-execution",
          fields: {
            kind: "job",
            id: "job_eval_product_app_web_execution"
          }
        }
      })
      const continuedWorkbench = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_continue_workbench",
        input: {
          action: "continue-workbench",
          fields: {
            text: "eval product app web workbench"
          }
        }
      })
      const invalidAction = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_invalid_action",
        input: {
          action: "set-layout",
          fields: {
            layout: "floating"
          }
        }
      })
      const invalidPoll = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "pollEvents",
        input: {
          limit: 0
        }
      })
      const cursorBeforePoll = web.snapshot().eventCursor
      const polled = await handleProductAppWebRequest(web, {
        kind: "product-app-web.request",
        operation: "pollEvents",
        requestId: "eval_web_poll",
        input: {
          limit: 5
        }
      })
      const polledDocument = responseDocument(polled)
      const html = polledDocument.html
      const nodeHtml = await fetchText(`${nodeHost.url}/`)
      const nodeScript = await fetchText(
        `${nodeHost.url}/wanex/product-app-web/client.js`
      )
      const nodeStyle = await fetchText(
        `${nodeHost.url}/wanex/product-app-web/styles.css`
      )
      const nodeMode = await postJson(`${nodeHost.url}/wanex/product-app-web/request`, {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "eval_web_node_mode",
        input: {
          action: "set-mode",
          fields: {
            mode: "diagnostics"
          }
        }
      })
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productAppWeb = entryByName(footprint, "@wanex/product-app-web")
      const productAppLocal = entryByName(footprint, "@wanex/product-app-local")
      const serialized = JSON.stringify([
        initial,
        startedWorkbench,
        selected,
        mode,
        commandPreview,
        commandExecution,
        executionActivity,
        continuedWorkbench,
        polled,
        html,
        nodeHtml,
        nodeScript,
        nodeStyle,
        nodeMode
      ])

      assert(
        initial.ok &&
          initial.document.snapshot.view.ready &&
          initial.document.snapshot.view.productCommandCount === 15 &&
          initial.document.snapshot.view.commandCatalog.rows.some(
            (command) => command.id === "product.agent.run"
          ) &&
          initial.document.html.includes(
            '<select name="commandId" required>'
          ) &&
          initial.document.html.includes(
            '<option value="product.agent.run">Run Agent (product.agent.run)</option>'
          ) &&
          initial.document.html.includes(
            'data-command-id="product.agent.run"'
          ),
        "web request document should project the typed product command catalog"
      )
      assert(
        startedWorkbench.ok &&
          startedWorkbench.operation === "submitActionInput" &&
          startedWorkbench.submitResult.ok &&
          startedWorkbench.document.snapshot.workbench.state === "ready" &&
          startedWorkbench.document.snapshot.workbench.sessionId !== undefined &&
          startedWorkbench.document.snapshot.workbench.summary.inputCount === 1 &&
          startedWorkbench.document.html.includes(
            "eval product app web started workbench"
          ) &&
          startedWorkbench.document.html.includes(
            'data-workbench-composer-kind="continue"'
          ),
        "web request should start a workbench session without a preselected session"
      )
      assert(
        selected.ok &&
          selected.operation === "submitActionInput" &&
          selected.submitResult.ok &&
          selected.document.snapshot.view.selectedSessionId ===
            "ses_eval_product_app_web",
        "web request should dispatch select-session through Product App client"
      )
      assert(
        mode.ok &&
          mode.operation === "submitActionInput" &&
          mode.submitResult.ok &&
          mode.document.snapshot.view.mode === "workbench",
        "web request should dispatch set-mode through Product App client"
      )
      assert(
        commandPreview.ok &&
          commandPreview.operation === "submitActionInput" &&
          commandPreview.submitResult.ok &&
          commandPreview.document.snapshot.view.commandPreview.state ===
            "runnable" &&
          commandPreview.document.snapshot.view.commandPreview.commandId ===
            "product.agent.run" &&
          commandPreview.document.html.includes(
            'data-command-preview-state="runnable"'
          ),
        "web request should preview command invocation through Product App client"
      )
      assert(
        commandExecution.ok &&
          commandExecution.operation === "submitActionInput" &&
          commandExecution.submitResult.ok &&
          commandExecution.document.snapshot.view.commandExecution.state ===
            "completed" &&
          commandExecution.document.snapshot.view.commandExecution.commandId ===
            "product.status" &&
          commandExecution.document.snapshot.view.commandExecution.valueKind ===
            "object" &&
          commandExecution.document.html.includes(
            'data-command-execution-state="completed"'
          ) &&
          !("value" in commandExecution.document.snapshot.commandExecution),
        "web request should execute a typed command and render only its bounded summary"
      )
      assert(
        executionActivity.ok &&
          executionActivity.operation === "submitActionInput" &&
          executionActivity.submitResult.ok &&
          executionActivity.document.snapshot.executionActivity.state ===
            "succeeded" &&
          executionActivity.document.snapshot.executionActivity.schedulerState ===
            "succeeded" &&
          executionActivity.document.html.includes(
            'data-execution-activity-state="succeeded"'
          ),
        "web request should resolve and render bounded durable execution activity"
      )
      assert(
        continuedWorkbench.ok &&
          continuedWorkbench.operation === "submitActionInput" &&
          continuedWorkbench.submitResult.ok &&
          continuedWorkbench.document.snapshot.workbench.state === "ready" &&
          continuedWorkbench.document.snapshot.workbench.sessionId ===
            "ses_eval_product_app_web" &&
          continuedWorkbench.document.snapshot.workbench.summary.rowCount > 0 &&
          continuedWorkbench.document.snapshot.view.sessionCount > 0 &&
          continuedWorkbench.document.html.includes(
            "eval product app web workbench"
          ) &&
          continuedWorkbench.document.html.includes(
            'data-session-id="ses_eval_product_app_web"'
          ),
        "web request should continue the selected workbench session through Product App client"
      )
      assert(
        invalidAction.ok &&
          invalidAction.operation === "submitActionInput" &&
          !invalidAction.submitResult.ok &&
          !invalidAction.submitResult.parse.ok &&
          invalidAction.submitResult.parse.error.code === "invalid_field" &&
          invalidAction.submitResult.parse.error.field === "layout",
        "web request should reject invalid action enum fields without dispatch"
      )
      assert(
        !invalidPoll.ok &&
          invalidPoll.operation === "pollEvents" &&
          invalidPoll.error.code === "invalid_request" &&
          invalidPoll.error.field === "input.limit",
        "web request should reject unbounded poll limits"
      )
      assert(
        polled.ok &&
          polled.operation === "pollEvents" &&
          polled.document.snapshot.eventCursor >= cursorBeforePoll &&
          polled.document.snapshot.events.ok &&
          polled.document.snapshot.events.events.length === 0,
        "web request should poll after the current cursor without replay"
      )
      assert(
        html.includes('data-wanex-product-app-web="surface"') &&
          html.includes("ses_eval_product_app_web"),
        "web surface should render a static Product App HTML projection"
      )
      assert(
        nodeHtml.includes('data-wanex-product-app-web="surface"') &&
          nodeHtml.includes("data-wanex-product-app-web-shell") &&
          nodeHtml.includes("data-wanex-product-app-web-client") &&
          nodeHtml.includes("data-wanex-product-app-web-stylesheet") &&
          nodeHtml.includes('href="/wanex/product-app-web/styles.css"') &&
          nodeHtml.includes(
            'data-request-path="/wanex/product-app-web/request"'
          ) &&
          nodeScript.includes('operation: "submitActionInput"') &&
          nodeScript.includes("replaceSurface(payload.document.html)") &&
          nodeStyle.includes('[data-wanex-product-app-web="surface"]') &&
          nodeStyle.includes('[data-region="workspace"]') &&
          isRecord(nodeMode) &&
          nodeMode.ok === true &&
          nodeMode.operation === "submitActionInput",
        "Product App Web Node host should serve an interactive styled browser shell and JSON request envelopes"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin),
        "web surface output must not leak host-only paths"
      )
      assert(
        operations.includes("descriptor") &&
          operations.includes("dispatchSurfaceCommand") &&
          operations.includes("readSurfaceEvents"),
        "web surface should use the message surface operations"
      )
      assert(
        !productAppWeb.contains.pluginRuntime &&
          !productAppWeb.contains.connectorRuntime &&
          productAppWeb.contains.concreteAdapters.length === 0 &&
          productAppWeb.contains.forbiddenPackages.length === 0,
        "web surface should keep a slim upper-app closure"
      )
      assert(
        !productAppLocal.contains.pluginRuntime &&
          !productAppLocal.contains.connectorRuntime &&
          productAppLocal.contains.concreteAdapters.length === 0 &&
          productAppLocal.contains.forbiddenPackages.length === 0,
        "local Web host should keep a slim upper-app closure"
      )

      return {
        ready: initial.ok ? initial.document.snapshot.view.ready : false,
        mode: web.snapshot().view.mode,
        selectedSessionId: web.snapshot().view.selectedSessionId ?? null,
        sessionCount: web.snapshot().view.sessionCount,
        productCommandCount: web.snapshot().view.productCommandCount,
        commandCatalogHasAgent: web.snapshot().view.commandCatalog.rows.some(
          (command) => command.id === "product.agent.run"
        ),
        commandPreviewUsesCatalogSelect: html.includes(
          '<select name="commandId" required>'
        ),
        commandCatalogRendered: html.includes(
          'data-command-id="product.agent.run"'
        ),
        commandPreviewState: web.snapshot().view.commandPreview.state,
        commandPreviewId: web.snapshot().view.commandPreview.commandId ?? null,
        commandExecutionState: web.snapshot().view.commandExecution.state,
        commandExecutionId:
          web.snapshot().view.commandExecution.commandId ?? null,
        commandExecutionValueKind:
          web.snapshot().view.commandExecution.valueKind ?? null,
        executionActivityState: web.snapshot().view.executionActivity.state,
        executionActivitySchedulerState:
          web.snapshot().view.executionActivity.schedulerState ?? null,
        workbenchState: web.snapshot().workbench.state,
        workbenchRowCount: web.snapshot().workbench.summary.rowCount,
        cursorBeforePoll,
        cursorAfterPoll: polledDocument.snapshot.eventCursor,
        polledEventCount: polledDocument.snapshot.events.ok
          ? polledDocument.snapshot.events.events.length
          : null,
        htmlRendered: html.includes('data-wanex-product-app-web="surface"'),
        nodeHostHtmlRendered: nodeHtml.includes(
          'data-wanex-product-app-web="surface"'
        ),
        nodeHostBrowserShellRendered:
          nodeHtml.includes("data-wanex-product-app-web-shell") &&
          nodeHtml.includes("data-wanex-product-app-web-client") &&
          nodeHtml.includes("data-wanex-product-app-web-stylesheet"),
        nodeHostBrowserScriptServed:
          nodeScript.includes('operation: "submitActionInput"') &&
          nodeScript.includes("replaceSurface(payload.document.html)"),
        nodeHostStylesheetServed:
          nodeStyle.includes('[data-wanex-product-app-web="surface"]') &&
          nodeStyle.includes('[data-region="workspace"]'),
        nodeHostRequestSucceeded:
          isRecord(nodeMode) &&
          nodeMode.ok === true &&
          nodeMode.operation === "submitActionInput",
        operations,
        readProductCommandsObserved: surfaceCommands.includes(
          "readProductCommands"
        ),
        invalidActionRejected:
          invalidAction.ok &&
          invalidAction.operation === "submitActionInput" &&
          !invalidAction.submitResult.ok,
        invalidPollRejected: !invalidPoll.ok,
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
        pluginRuntime: productAppWeb.contains.pluginRuntime,
        connectorRuntime: productAppWeb.contains.connectorRuntime,
        concreteAdapters: productAppWeb.contains.concreteAdapters,
        nodeHostPluginRuntime: productAppLocal.contains.pluginRuntime,
        nodeHostConnectorRuntime: productAppLocal.contains.connectorRuntime,
        nodeHostConcreteAdapters:
          productAppLocal.contains.concreteAdapters
      }
    } finally {
      await nodeHost?.close()
      await app.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

function responseDocument(response: ProductAppWebResponse) {
  assert(response.ok, "web response should be successful")
  return response.document
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  assert(response.status === 200, `GET ${url} should succeed`)
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  assert(response.status === 200, `POST ${url} should succeed`)
  return await response.json()
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
