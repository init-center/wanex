import { rm } from "node:fs/promises"
import {
  startDesktopMainHost,
  type DesktopMainHost
} from "@wanex/local-host/desktop-host"
import { mktemp, expectRecord } from "../product-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalFakeModelEndpoint } from "../scenario-utils.js"

export const localDesktopHostContractScenario = createEvalScenario({
  id: "product.app-local-desktop-host-contract",
  title: "local host desktop-host subpath handles trusted IPC envelopes",
  tags: [
    "product",
    "local-host",
    "desktop-host",
    "upper-app",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-desktop-host-")
    let host: DesktopMainHost | undefined

    try {
      host = await startDesktopMainHost({
        storage: {
          kind: "store-dir",
          storeDir
        },
        serviceBin: context.serviceBin,
        modelEndpoints: {
          endpoints: [
            evalFakeModelEndpoint(
              "eval-desktop-host",
              "eval-desktop-host-model"
            )
          ]
        },
        web: {
          hostname: "127.0.0.1"
        }
      })

      const firstSnapshotResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "snapshot",
        requestId: "eval_desktop_host_snapshot"
      })
      const trustedSetup = await host.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: evalFakeModelEndpoint(
          "eval-desktop-host-setup-provider",
          "eval-desktop-host-setup-model",
          "fake",
          { secretRef: "env://EVAL_DESKTOP_HOST_SETUP_SECRET" }
        ),
        makeActive: true
      })
      const refreshResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "webRequest",
        requestId: "eval_desktop_host_refresh_envelope",
        request: {
          kind: "web.request",
          operation: "refresh",
          requestId: "eval_desktop_host_refresh"
        }
      })
      const workbenchResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "webRequest",
        requestId: "eval_desktop_host_workbench_envelope",
        request: {
          kind: "web.request",
          operation: "dispatchAction",
          requestId: "eval_desktop_host_submit_conversation",
          action: {
            type: "submit-conversation",
            input: {
              text: "hello from product desktop host eval"
            }
          }
        }
      })
      const rejectedProviderMutationResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "upsertModelEndpoint",
        requestId: "eval_desktop_host_reject_provider_upsert",
        input: {
          modelEndpoint: evalFakeModelEndpoint(
            "eval-desktop-host-rejected-provider",
            "eval-desktop-host-rejected-model",
            "fake",
            { secretRef: "env://EVAL_DESKTOP_HOST_REJECTED_SECRET" }
          ),
          makeActive: true
        }
      })
      const rejectedProviderSetupResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "configureModelEndpoint",
        requestId: "eval_desktop_host_reject_provider_setup",
        input: {
          ...evalFakeModelEndpoint(
            "eval-desktop-host-rejected-setup",
            "eval-desktop-host-rejected-setup-model",
            "fake",
            { secretRef: "env://EVAL_DESKTOP_HOST_REJECTED_SETUP_SECRET" }
          ),
          makeActive: true
        }
      })
      const finalSnapshotResponse = await host.handleRequest({
        kind: "desktop.request",
        operation: "snapshot",
        requestId: "eval_desktop_host_final_snapshot"
      })

      const firstSnapshotRecord = expectRecord(firstSnapshotResponse)
      const firstSnapshot = expectRecord(firstSnapshotRecord.snapshot)
      const firstLocal = expectRecord(firstSnapshot.local)
      const firstPrivacy = expectRecord(firstSnapshot.privacy)
      const refreshEnvelope = expectRecord(refreshResponse)
      const refreshRecord = expectRecord(refreshEnvelope.webResponse)
      const refreshSnapshot = expectRecord(refreshRecord.snapshot)
      const refreshView = expectRecord(refreshSnapshot.view)
      const refreshProviderRunGate = expectRecord(
        refreshView.providerRunGate
      )
      const setupEndpoint = expectRecord(trustedSetup)
      const workbenchEnvelope = expectRecord(workbenchResponse)
      const workbenchRecord = expectRecord(workbenchEnvelope.webResponse)
      const actionResult = expectRecord(workbenchRecord.actionResult)
      const workbenchSnapshot = expectRecord(actionResult.snapshot)
      const conversation = expectRecord(workbenchSnapshot.conversation)
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
      const finalConversation = expectRecord(finalWeb.conversation)
      const finalView = expectRecord(finalWeb.view)
      const serialized = JSON.stringify([
        firstSnapshotResponse,
        trustedSetup,
        refreshResponse,
        workbenchResponse,
        rejectedProviderMutationResponse,
        rejectedProviderSetupResponse,
        finalSnapshotResponse
      ])

      assert(
        firstSnapshotRecord.kind === "desktop.response" &&
          firstSnapshotRecord.ok === true &&
          firstSnapshotRecord.operation === "snapshot" &&
          firstSnapshotRecord.requestId === "eval_desktop_host_snapshot" &&
          firstSnapshot.kind === "desktop.snapshot" &&
          firstLocal.kind === "local-host.snapshot" &&
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
        refreshEnvelope.kind === "desktop.response" &&
          refreshEnvelope.ok === true &&
          refreshEnvelope.operation === "webRequest" &&
          refreshEnvelope.requestId === "eval_desktop_host_refresh_envelope" &&
          refreshRecord.kind === "web.response" &&
          refreshRecord.ok === true &&
          refreshRecord.operation === "refresh" &&
          refreshRecord.requestId === "eval_desktop_host_refresh" &&
          refreshView.ready === true,
        "desktop host should handle web application snapshot envelopes"
      )
      assert(
        setupEndpoint.id === "eval-desktop-host-setup-provider" &&
          setupEndpoint.active === true &&
          setupEndpoint.credentialConfigured === true &&
          refreshProviderRunGate.state === "ready",
        "desktop host trusted setup should return redacted active provider readiness"
      )
      assert(
        refreshProviderRunGate.state === "ready" &&
          refreshProviderRunGate.canSubmitConversation === true &&
          refreshProviderRunGate.activeEndpointId ===
            "eval-desktop-host-setup-provider",
        "desktop host Web document should project provider setup readiness"
      )
      assert(
        workbenchEnvelope.kind === "desktop.response" &&
          workbenchEnvelope.ok === true &&
          workbenchEnvelope.operation === "webRequest" &&
          workbenchEnvelope.requestId === "eval_desktop_host_workbench_envelope" &&
          workbenchRecord.kind === "web.response" &&
          workbenchRecord.ok === true &&
          workbenchRecord.operation === "dispatchAction" &&
          workbenchRecord.requestId === "eval_desktop_host_submit_conversation" &&
          actionResult.ok === true &&
          actionResult.action === "submit-conversation" &&
          typeof conversation.sessionId === "string" &&
          typeof workbenchView.conversationState === "string",
        "desktop host should submit conversation through the Web request envelope"
      )
      assert(
        rejectedProviderMutation.kind === "desktop.response" &&
          rejectedProviderMutation.ok === false &&
          rejectedProviderMutation.operation === "upsertModelEndpoint" &&
          rejectedProviderMutation.requestId ===
            "eval_desktop_host_reject_provider_upsert" &&
          rejectedProviderMutationError.code === "unknown_operation",
        "desktop host request envelopes should reject provider secret mutation"
      )
      assert(
        rejectedProviderSetup.kind === "desktop.response" &&
          rejectedProviderSetup.ok === false &&
          rejectedProviderSetup.operation === "configureModelEndpoint" &&
          rejectedProviderSetup.requestId ===
            "eval_desktop_host_reject_provider_setup" &&
          rejectedProviderSetupError.code === "unknown_operation",
        "desktop host request envelopes should reject provider setup mutation"
      )
      assert(
        finalSnapshotRecord.kind === "desktop.response" &&
          finalSnapshotRecord.ok === true &&
          finalSnapshotRecord.operation === "snapshot" &&
          typeof finalConversation.state === "string" &&
          typeof finalView.conversationCanSubmit === "boolean",
        "desktop host snapshot should reflect envelope mutations"
      )
      assert(
        !serialized.includes(storeDir) &&
          !serialized.includes(context.serviceBin) &&
          !serialized.includes("EVAL_DESKTOP_HOST_SETUP_SECRET") &&
          !serialized.includes("eval-desktop-host-rejected-secret") &&
          !serialized.includes("eval-desktop-host-rejected-setup-secret"),
        "desktop host outputs must not leak host-only paths or provider secrets"
      )

      return {
        entry: "@wanex/local-host/desktop-host",
        urlStarted: typeof firstSnapshot.url === "string" &&
          firstSnapshot.url.startsWith("http://127.0.0.1:"),
        snapshotReady: refreshView.ready,
        conversationState: finalConversation.state,
        conversationCanSubmit: finalView.conversationCanSubmit,
        trustedProviderSetupRedacted:
          setupEndpoint.credentialConfigured === true &&
          !serialized.includes("EVAL_DESKTOP_HOST_SETUP_SECRET"),
        providerRunGateState: refreshProviderRunGate.state,
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
          "EVAL_DESKTOP_HOST_SETUP_SECRET"
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
