import { rm } from "node:fs/promises"
import {
  startProductAppLocalWebApp,
  type ProductAppLocalWebApp
} from "@wanex/product-app-local"
import {
  entryByName,
  runJsonAudit,
  type FootprintReport
} from "../distribution-audit.js"
import { mktemp, expectRecord } from "../product-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

export const productAppLocalHostContractScenario = createEvalScenario({
  id: "product.app-local-host-contract",
  title: "Product App Local starts the trusted local Web host lifecycle",
  tags: [
    "product-app",
    "product-app-local",
    "product-app-web",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-local-")
    let app: ProductAppLocalWebApp | undefined

    try {
      app = await startProductAppLocalWebApp({
        storage: {
          kind: "store-dir",
          storeDir
        },
        serviceBin: context.serviceBin,
        providerProfiles: {
          profiles: [
            {
              id: "eval-product-app-local",
              modelId: "eval-product-app-local-model"
            }
          ]
        },
        initialState: {
          mode: "diagnostics"
        },
        web: {
          hostname: "127.0.0.1",
          pollIntervalMs: 0
        }
      })

      const providerSecretRef = "env://EVAL_LOCAL_PROVIDER_API_KEY"
      await app.providerProfiles.upsertProviderProfile({
        profile: {
          id: "eval-product-app-local-secret-provider",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "eval-product-app-local-secret-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: providerSecretRef
        }
      })
      await app.readSnapshot()
      const html = await fetchText(`${app.url}/`)
      const submitted = await postJson(
        `${app.url}/wanex/product-app-web/request`,
        {
          kind: "product-app-web.request",
          operation: "submitActionInput",
          requestId: "eval_product_app_local_layout",
          input: {
            action: "set-layout",
            fields: {
              layout: "split"
            }
          },
          options: {
            pollAfterAction: false
          }
        }
      )
      const started = await postJson(
        `${app.url}/wanex/product-app-web/request`,
        {
          kind: "product-app-web.request",
          operation: "submitActionInput",
          requestId: "eval_product_app_local_submit_conversation",
          input: {
            action: "submit-conversation",
            fields: {
              text: "hello from Product App Local eval"
            }
          },
          options: {
            pollAfterAction: false
          }
        }
      )
      const snapshotModel = await app.readSnapshot()
      const settings = snapshotModel.settings
      const footprint = await runJsonAudit<FootprintReport>(
        "audit-distribution-footprint.mjs",
        ["--json"]
      )
      const productAppLocal = entryByName(footprint, "@wanex/product-app-local")
      const submittedRecord = expectRecord(submitted)
      const document = expectRecord(submittedRecord.document)
      const snapshot = expectRecord(document.snapshot)
      const view = expectRecord(snapshot.view)
      const submitResult = expectRecord(submittedRecord.submitResult)
      const actionResult = expectRecord(submitResult.actionResult)
      const startedRecord = expectRecord(started)
      const startedSubmitResult = expectRecord(startedRecord.submitResult)
      const startedActionResult = expectRecord(
        startedSubmitResult.actionResult
      )
      const startedDocument = expectRecord(startedRecord.document)
      const startedSnapshot = expectRecord(startedDocument.snapshot)
      const startedConversation = expectRecord(startedSnapshot.conversation)
      const startedView = expectRecord(startedSnapshot.view)
      const secretProvider = snapshotModel.providerProfiles.profiles.find(
        (profile) => profile.id === "eval-product-app-local-secret-provider"
      )
      const webSecretProvider =
        snapshotModel.web.view.settings.profile.profiles.find(
          (profile) => profile.id === "eval-product-app-local-secret-provider"
        )
      const serialized = JSON.stringify([
        html,
        submitted,
        started,
        snapshotModel
      ])

      assert(
          html.includes("<h1>Wanex Product App</h1>") &&
          html.includes('data-wanex-product-app-web="surface"') &&
          html.includes('data-poll-interval-ms="0"'),
        "local host should serve Product App Web HTML"
      )
      assert(
        html.includes(
          'data-provider-profile-id="eval-product-app-local-secret-provider"'
        ) &&
          html.includes('data-provider-credential-status="configured"') &&
          !html.includes(providerSecretRef),
        "local host HTML should render redacted provider rows without leaking secrets"
      )
      assert(
        submittedRecord.kind === "product-app-web.response" &&
          submittedRecord.ok === true &&
          submittedRecord.operation === "submitActionInput" &&
          submittedRecord.requestId === "eval_product_app_local_layout" &&
          submitResult.ok === true &&
          actionResult.ok === true &&
          actionResult.action === "set-layout" &&
          view.layout === "split",
        "local host should dispatch Product App Web envelopes"
      )
      assert(
        snapshotModel.settings.state.layout === "split" &&
          snapshotModel.web.view.layout === "split",
        "local host should keep Product App and Web controller state in sync"
      )
      assert(
        startedRecord.kind === "product-app-web.response" &&
          startedRecord.ok === true &&
          startedRecord.operation === "submitActionInput" &&
          startedRecord.requestId === "eval_product_app_local_submit_conversation" &&
          startedSubmitResult.ok === true &&
          startedActionResult.ok === true &&
          startedActionResult.action === "submit-conversation" &&
          typeof startedConversation.sessionId === "string" &&
          typeof startedView.conversationState === "string",
        "local host should submit a conversation through the Web request envelope"
      )
      assert(
        snapshotModel.web.conversation.sessionId !== undefined &&
          snapshotModel.web.view.conversationState !== "idle",
        "local snapshot should reflect the submitted conversation"
      )
      assert(
        settings.profile.activeProviderProfileId === "eval-product-app-local" &&
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        "local host should expose safe Product App settings"
      )
      assert(
        secretProvider?.credentialConfigured === true &&
          webSecretProvider?.credentialConfigured === true,
        "trusted provider profile writes should project only redacted read models"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin) &&
          !serialized.includes(providerSecretRef),
        "local host output must not leak host-only paths"
      )
      assert(
        productAppLocal.missing.length === 0 &&
          !productAppLocal.contains.pluginRuntime &&
          !productAppLocal.contains.connectorRuntime &&
          productAppLocal.contains.concreteAdapters.length === 0 &&
          productAppLocal.contains.forbiddenPackages.length === 0,
        "product-app-local closure should stay slim"
      )

      return {
        entry: "@wanex/product-app-local",
        urlStarted: app.url.startsWith("http://127.0.0.1:"),
        layout: snapshotModel.settings.state.layout,
        mode: snapshotModel.settings.state.mode,
        webLayout: snapshotModel.web.view.layout,
        conversationState: snapshotModel.web.conversation.state,
        conversationCanSubmit: snapshotModel.web.view.conversationCanSubmit,
        profileId: settings.profile.activeProviderProfileId,
        providerSecretRedacted:
          secretProvider?.credentialConfigured === true &&
          webSecretProvider?.credentialConfigured === true,
        settingsPrivacySafe:
          !settings.privacy.exposesStorePath &&
          !settings.privacy.exposesServiceBinaryPath &&
          !settings.privacy.exposesSecrets,
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
        leakedProviderSecret: serialized.includes(providerSecretRef),
        pluginRuntime: productAppLocal.contains.pluginRuntime,
        connectorRuntime: productAppLocal.contains.connectorRuntime,
        concreteAdapters: productAppLocal.contains.concreteAdapters,
        forbiddenPackages: productAppLocal.contains.forbiddenPackages
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
