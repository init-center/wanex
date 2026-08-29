import { rm } from "node:fs/promises"
import {
  startAssistantWebApp,
  type AssistantWebApp
} from "@wanex/assistant-host"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { mktemp, expectRecord } from "../assistant-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import {
  assert,
  evalFakeModelEndpoint,
  evalOpenAICompatibleModelEndpoint
} from "../scenario-utils.js"

export const assistantHostContractScenario = createEvalScenario({
  id: "assistant.app-assistant-host-contract",
  title: "Assistant Host starts the trusted local Web host lifecycle",
  tags: [
    "assistant",
    "assistant-host",
    "web",
    "upper-app",
    "assistant-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-assistant-host-")
    let app: AssistantWebApp | undefined

    try {
      app = await startAssistantWebApp({
        storage: {
          kind: "store-dir",
          storeDir
        },
        serviceBin: context.serviceBin,
        modelEndpoints: {
          endpoints: [
            evalFakeModelEndpoint(
              "eval-assistant-host",
              "eval-assistant-host-model"
            )
          ]
        },
        initialState: {
          mode: "diagnostics"
        },
        web: {
          hostname: "127.0.0.1"
        }
      })

      const providerSecretRef = "env://EVAL_LOCAL_PROVIDER_API_KEY"
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: evalOpenAICompatibleModelEndpoint({
          id: "eval-assistant-host-secret-provider",
          modelId: "eval-assistant-host-secret-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: providerSecretRef
        })
      })
      await app.readSnapshot()
      const html = await fetchText(`${app.url}/`)
      const submitted = await postJson(
        `${app.url}/wanex/assistant/request`,
        {
          kind: "web.request",
          operation: "dispatchAction",
          requestId: "eval_assistant_app_local_layout",
          action: {
            type: "set-layout",
            input: {
              layout: "split"
            }
          }
        }
      )
      const started = await postJson(
        `${app.url}/wanex/assistant/request`,
        {
          kind: "web.request",
          operation: "dispatchAction",
          requestId: "eval_assistant_app_local_submit_conversation",
          action: {
            type: "submit-conversation",
            input: {
              text: "hello from Assistant Host eval"
            }
          }
        }
      )
      const snapshotModel = await app.readSnapshot()
      const settings = snapshotModel.settings
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const local = entryByName(footprint, "@wanex/assistant-host")
      const submittedRecord = expectRecord(submitted)
      const actionResult = expectRecord(submittedRecord.actionResult)
      const snapshot = expectRecord(actionResult.snapshot)
      const view = expectRecord(snapshot.view)
      const startedRecord = expectRecord(started)
      const startedActionResult = expectRecord(startedRecord.actionResult)
      const startedSnapshot = expectRecord(startedActionResult.snapshot)
      const startedConversation = expectRecord(startedSnapshot.conversation)
      const startedView = expectRecord(startedSnapshot.view)
      const secretProvider = snapshotModel.modelEndpoints.endpoints.find(
        (endpoint) => endpoint.id === "eval-assistant-host-secret-provider"
      )
      const webSecretProvider =
        snapshotModel.web.view.settings.profile.endpoints.find(
          (endpoint) => endpoint.id === "eval-assistant-host-secret-provider"
        )
      const serialized = JSON.stringify([
        html,
        submitted,
        started,
        snapshotModel
      ])

      assert(
          html.includes("data-app-root") &&
          html.includes('src="/assets/app.js"') &&
          html.includes('href="/assets/app.css"') &&
          html.includes(
            'data-event-stream-path="/wanex/assistant/events"'
          ) &&
          html.includes(
            'data-model-catalog-refresh-path="/wanex/assistant/model-catalog-refresh"'
          ),
        "Assistant Host should serve the sole browser application shell"
      )
      assert(
        secretProvider?.credentialConfigured === true &&
          webSecretProvider?.credentialConfigured === true &&
          !html.includes(providerSecretRef),
        "local snapshots should project redacted provider rows without leaking secrets"
      )
      assert(
          submittedRecord.kind === "web.response" &&
          submittedRecord.ok === true &&
          submittedRecord.operation === "dispatchAction" &&
          submittedRecord.requestId === "eval_assistant_app_local_layout" &&
          actionResult.ok === true &&
          actionResult.action === "set-layout" &&
          view.layout === "split",
        "Assistant Host should dispatch web application envelopes"
      )
      assert(
        snapshotModel.settings.state.layout === "split" &&
          snapshotModel.web.view.layout === "split",
        "Assistant Host should keep assistant and Web controller state in sync"
      )
      assert(
        startedRecord.kind === "web.response" &&
          startedRecord.ok === true &&
          startedRecord.operation === "dispatchAction" &&
          startedRecord.requestId === "eval_assistant_app_local_submit_conversation" &&
          startedActionResult.ok === true &&
          startedActionResult.action === "submit-conversation" &&
          typeof startedConversation.sessionId === "string" &&
          typeof startedView.conversationState === "string",
        "Assistant Host should submit a conversation through the Web request envelope"
      )
      assert(
        snapshotModel.web.conversation.sessionId !== undefined &&
          snapshotModel.web.view.conversationState !== "idle",
        "local snapshot should reflect the submitted conversation"
      )
      assert(
        settings.profile.activeModelEndpointId === "eval-assistant-host" &&
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        "Assistant Host should expose safe assistant settings"
      )
      assert(
        secretProvider?.credentialConfigured === true &&
          webSecretProvider?.credentialConfigured === true,
        "trusted model endpoint writes should project only redacted read models"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin) &&
          !serialized.includes(providerSecretRef),
        "Assistant Host output must not leak host-only paths"
      )
      assert(
        local.missing.length === 0 &&
          !local.contains.pluginRuntime &&
          !local.contains.connectorRuntime &&
          local.contains.concreteAdapters.length === 0 &&
          local.contains.forbiddenPackages.length === 0,
        "assistant-host closure should stay slim"
      )

      return {
        entry: "@wanex/assistant-host",
        urlStarted: app.url.startsWith("http://127.0.0.1:"),
        layout: snapshotModel.settings.state.layout,
        mode: snapshotModel.settings.state.mode,
        webLayout: snapshotModel.web.view.layout,
        conversationState: snapshotModel.web.conversation.state,
        conversationCanSubmit: snapshotModel.web.view.conversationCanSubmit,
        endpointId: settings.profile.activeModelEndpointId,
        providerSecretRedacted:
          secretProvider?.credentialConfigured === true &&
          webSecretProvider?.credentialConfigured === true,
        modelCatalogRefreshBounded:
          html.includes(
            'data-model-catalog-refresh-path="/wanex/assistant/model-catalog-refresh"'
          ) &&
          !html.includes("models.dev/api.json"),
        settingsPrivacySafe:
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
        leakedProviderSecret: serialized.includes(providerSecretRef),
        pluginRuntime: local.contains.pluginRuntime,
        connectorRuntime: local.contains.connectorRuntime,
        concreteAdapters: local.contains.concreteAdapters,
        forbiddenPackages: local.contains.forbiddenPackages
      }
    } finally {
      await app?.close()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  assert(response.status === 200, `GET ${url} should succeed`)
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const hostSessionToken = await readHostSessionToken(url)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken
    },
    body: JSON.stringify(body)
  })
  assert(response.status === 200, `POST ${url} should succeed`)
  return await response.json()
}

async function readHostSessionToken(url: string): Promise<string> {
  const html = await fetchText(new URL("/", url).toString())
  const match = /data-host-session-token="([A-Za-z0-9_-]{43})"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("browser application shell did not include a session token")
  }
  return match[1]
}
