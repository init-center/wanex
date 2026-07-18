import { rm } from "node:fs/promises"
import {
  startProductAppDesktopMainHost,
  type ProductAppDesktopMainHost
} from "@wanex/product-app-local/desktop-host"
import { mktemp, expectRecord } from "../product-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

export const productAppLocalDesktopHostContractScenario = createEvalScenario({
  id: "product.app-local-desktop-host-contract",
  title: "Product App Local desktop-host subpath handles trusted IPC envelopes",
  tags: [
    "product-app",
    "product-app-local",
    "desktop-host",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-app-desktop-host-")
    let host: ProductAppDesktopMainHost | undefined

    try {
      host = await startProductAppDesktopMainHost({
        storage: {
          kind: "store-dir",
          storeDir
        },
        serviceBin: context.serviceBin,
        providerProfiles: {
          profiles: [
            {
              id: "eval-product-app-desktop-host",
              modelId: "eval-product-app-desktop-host-model"
            }
          ]
        },
        web: {
          hostname: "127.0.0.1",
          pollIntervalMs: 0
        }
      })

      const firstSnapshotResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "snapshot",
        requestId: "eval_desktop_host_snapshot"
      })
      const trustedSetup = await host.providerSetup.configureProviderProfile({
        id: "eval-desktop-host-setup-provider",
        kind: "fake",
        providerId: "fake",
        modelId: "eval-desktop-host-setup-model",
        apiKey: "eval-desktop-host-setup-secret",
        makeActive: true
      })
      const documentResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "webRequest",
        requestId: "eval_desktop_host_document_envelope",
        request: {
          kind: "product-app-web.request",
          operation: "refresh",
          requestId: "eval_desktop_host_document"
        }
      })
      const workbenchResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "webRequest",
        requestId: "eval_desktop_host_workbench_envelope",
        request: {
          kind: "product-app-web.request",
          operation: "submitActionInput",
          requestId: "eval_desktop_host_start_workbench",
          input: {
            action: "start-workbench",
            fields: {
              text: "hello from Product App desktop host eval"
            }
          },
          options: {
            pollAfterAction: false
          }
        }
      })
      const rejectedProviderMutationResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "upsertProviderProfile",
        requestId: "eval_desktop_host_reject_provider_upsert",
        input: {
          profile: {
            id: "eval-desktop-host-rejected-provider",
            kind: "openai-compatible",
            providerId: "openai-compatible",
            modelId: "eval-desktop-host-rejected-model",
            apiKey: "eval-desktop-host-rejected-secret"
          },
          makeActive: true
        }
      })
      const rejectedProviderSetupResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "configureProviderProfile",
        requestId: "eval_desktop_host_reject_provider_setup",
        input: {
          id: "eval-desktop-host-rejected-setup",
          kind: "fake",
          providerId: "fake",
          modelId: "eval-desktop-host-rejected-setup-model",
          apiKey: "eval-desktop-host-rejected-setup-secret",
          makeActive: true
        }
      })
      const finalSnapshotResponse = await host.handleRequest({
        kind: "product-app-desktop-main.request",
        operation: "snapshot",
        requestId: "eval_desktop_host_final_snapshot"
      })

      const firstSnapshotRecord = expectRecord(firstSnapshotResponse)
      const firstSnapshot = expectRecord(firstSnapshotRecord.snapshot)
      const firstLocal = expectRecord(firstSnapshot.local)
      const firstPrivacy = expectRecord(firstSnapshot.privacy)
      const documentEnvelope = expectRecord(documentResponse)
      const documentRecord = expectRecord(documentEnvelope.webResponse)
      const document = expectRecord(documentRecord.document)
      const documentSnapshot = expectRecord(document.snapshot)
      const documentView = expectRecord(documentSnapshot.view)
      const documentProviderRunGate = expectRecord(
        documentView.providerRunGate
      )
      const setupProfile = expectRecord(trustedSetup.profile)
      const setupReadiness = expectRecord(trustedSetup.readiness)
      const workbenchEnvelope = expectRecord(workbenchResponse)
      const workbenchRecord = expectRecord(workbenchEnvelope.webResponse)
      const submitResult = expectRecord(workbenchRecord.submitResult)
      const actionResult = expectRecord(submitResult.actionResult)
      const workbenchDocument = expectRecord(workbenchRecord.document)
      const workbenchSnapshot = expectRecord(workbenchDocument.snapshot)
      const workbench = expectRecord(workbenchSnapshot.workbench)
      const workbenchView = expectRecord(workbenchSnapshot.view)
      const rejectedProviderMutation = expectRecord(
        rejectedProviderMutationResponse
      )
      const rejectedProviderMutationError = expectRecord(
        rejectedProviderMutation.error
      )
      const rejectedProviderSetup = expectRecord(
        rejectedProviderSetupResponse
      )
      const rejectedProviderSetupError = expectRecord(
        rejectedProviderSetup.error
      )
      const finalSnapshotRecord = expectRecord(finalSnapshotResponse)
      const finalSnapshot = expectRecord(finalSnapshotRecord.snapshot)
      const finalLocal = expectRecord(finalSnapshot.local)
      const finalWeb = expectRecord(finalLocal.web)
      const finalWorkbench = expectRecord(finalWeb.workbench)
      const finalView = expectRecord(finalWeb.view)
      const serialized = JSON.stringify([
        firstSnapshotResponse,
        trustedSetup,
        documentResponse,
        workbenchResponse,
        rejectedProviderMutationResponse,
        rejectedProviderSetupResponse,
        finalSnapshotResponse
      ])

      assert(
        firstSnapshotRecord.kind === "product-app-desktop-main.response" &&
          firstSnapshotRecord.ok === true &&
          firstSnapshotRecord.operation === "snapshot" &&
          firstSnapshotRecord.requestId === "eval_desktop_host_snapshot" &&
          firstSnapshot.kind === "product-app-desktop-main.snapshot" &&
          firstLocal.kind === "product-app-local.snapshot" &&
          firstSnapshot.url === host.url,
        "desktop host should expose a safe startup snapshot"
      )
      assert(
        firstPrivacy.exposesStorePath === false &&
          firstPrivacy.exposesServiceBinaryPath === false &&
          firstPrivacy.exposesSecrets === false &&
          firstPrivacy.exposesRawStorageClient === false &&
          firstPrivacy.exposesRendererMutationApi === false,
        "desktop host snapshot privacy flags should be safe"
      )
      assert(
        documentEnvelope.kind === "product-app-desktop-main.response" &&
          documentEnvelope.ok === true &&
          documentEnvelope.operation === "webRequest" &&
          documentEnvelope.requestId === "eval_desktop_host_document_envelope" &&
          documentRecord.kind === "product-app-web.response" &&
          documentRecord.ok === true &&
          documentRecord.operation === "refresh" &&
          documentRecord.requestId === "eval_desktop_host_document" &&
          documentView.ready === true,
        "desktop host should handle Product App Web document envelopes"
      )
      assert(
        trustedSetup.kind === "product-app-local.provider-setup.configured" &&
          setupProfile.id === "eval-desktop-host-setup-provider" &&
          setupProfile.active === true &&
          setupProfile.hasApiKey === true &&
          setupProfile.apiKeyRedacted === "***" &&
          setupReadiness.status === "ready" &&
          setupReadiness.activeProfileId ===
            "eval-desktop-host-setup-provider",
        "desktop host trusted setup should return redacted active provider readiness"
      )
      assert(
        documentProviderRunGate.state === "ready" &&
          documentProviderRunGate.canSubmitWorkbench === true &&
          documentProviderRunGate.activeProfileId ===
            "eval-desktop-host-setup-provider",
        "desktop host Web document should project provider setup readiness"
      )
      assert(
        workbenchEnvelope.kind === "product-app-desktop-main.response" &&
          workbenchEnvelope.ok === true &&
          workbenchEnvelope.operation === "webRequest" &&
          workbenchEnvelope.requestId === "eval_desktop_host_workbench_envelope" &&
          workbenchRecord.kind === "product-app-web.response" &&
          workbenchRecord.ok === true &&
          workbenchRecord.operation === "submitActionInput" &&
          workbenchRecord.requestId === "eval_desktop_host_start_workbench" &&
          submitResult.ok === true &&
          actionResult.ok === true &&
          actionResult.action === "start-workbench" &&
          workbench.state === "ready" &&
          workbenchView.latestUserText === "hello from Product App desktop host eval",
        "desktop host should start workbench through the Web request envelope"
      )
      assert(
        rejectedProviderMutation.kind === "product-app-desktop-main.response" &&
          rejectedProviderMutation.ok === false &&
          rejectedProviderMutation.operation === "upsertProviderProfile" &&
          rejectedProviderMutation.requestId ===
            "eval_desktop_host_reject_provider_upsert" &&
          rejectedProviderMutationError.code === "unknown_operation",
        "desktop host request envelopes should reject provider secret mutation"
      )
      assert(
        rejectedProviderSetup.kind === "product-app-desktop-main.response" &&
          rejectedProviderSetup.ok === false &&
          rejectedProviderSetup.operation === "configureProviderProfile" &&
          rejectedProviderSetup.requestId ===
            "eval_desktop_host_reject_provider_setup" &&
          rejectedProviderSetupError.code === "unknown_operation",
        "desktop host request envelopes should reject provider setup mutation"
      )
      assert(
        finalSnapshotRecord.kind === "product-app-desktop-main.response" &&
          finalSnapshotRecord.ok === true &&
          finalSnapshotRecord.operation === "snapshot" &&
          finalWorkbench.state === "ready" &&
          finalWorkbench.canContinue === true &&
          finalView.latestUserText ===
            "hello from Product App desktop host eval",
        "desktop host snapshot should reflect envelope mutations"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin) &&
          !serialized.includes("eval-desktop-host-setup-secret") &&
          !serialized.includes("eval-desktop-host-rejected-secret") &&
          !serialized.includes("eval-desktop-host-rejected-setup-secret"),
        "desktop host outputs must not leak host-only paths or provider secrets"
      )

      return {
        entry: "@wanex/product-app-local/desktop-host",
        urlStarted: typeof firstSnapshot.url === "string" &&
          firstSnapshot.url.startsWith("http://127.0.0.1:"),
        documentReady: documentView.ready,
        workbenchState: finalWorkbench.state,
        workbenchCanContinue: finalWorkbench.canContinue,
        latestUserText: finalView.latestUserText,
        trustedProviderSetupRedacted:
          setupProfile.apiKeyRedacted === "***" &&
          !serialized.includes("eval-desktop-host-setup-secret"),
        providerRunGateState: documentProviderRunGate.state,
        providerMutationRejected:
          rejectedProviderMutation.ok === false &&
          rejectedProviderMutationError.code === "unknown_operation",
        providerSetupRequestRejected:
          rejectedProviderSetup.ok === false &&
          rejectedProviderSetupError.code === "unknown_operation",
        leakedStoreDir: serialized.includes(storeDir),
        leakedServiceBin: serialized.includes(context.serviceBin),
        leakedRejectedSecret: serialized.includes(
          "eval-desktop-host-rejected-secret"
        ),
        leakedSetupSecret: serialized.includes(
          "eval-desktop-host-setup-secret"
        ),
        leakedRejectedSetupSecret: serialized.includes(
          "eval-desktop-host-rejected-setup-secret"
        )
      }
    } finally {
      await host?.close()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
