import type { WanexDesktopBridge } from "./contract.js"

declare global {
  interface Window {
    readonly wanexDesktop: WanexDesktopBridge
    wanexBoundarySmoke(): Promise<WanexRendererSmokeResult>
  }
}

interface WanexRendererSmokeResult {
  readonly snapshotOk: boolean
  readonly profilesOk: boolean
  readonly hotConfigOk: boolean
  readonly actionOk: boolean
  readonly isolatedResponse: boolean
  readonly privacyOk: boolean
}

window.wanexBoundarySmoke = async () => {
  const snapshot = await window.wanexDesktop.invoke(desktopRequest(
    "snapshot",
    "electron_snapshot"
  ))
  const profiles = await window.wanexDesktop.invoke(desktopRequest(
    "listProviderProfiles",
    "electron_profiles"
  ))
  const selected = await window.wanexDesktop.invoke({
    ...desktopRequest("setActiveProviderProfile", "electron_select_profile"),
    input: { profileId: "electron-secondary" }
  })
  const action = await window.wanexDesktop.invoke({
    ...desktopRequest("webRequest", "electron_action"),
    request: {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "electron_submit_conversation",
      input: {
        action: "submit-conversation",
        fields: { text: "electron production boundary" }
      },
      options: { pollAfterAction: { limit: 64 } }
    }
  })
  const privacy = readRecord(readRecord(snapshot).snapshot).privacy
  const privacyOk = privacyFlagsAreSafe(privacy)
  const mutablePrivacy = privacy as Record<string, unknown>
  mutablePrivacy.exposesStorePath = true
  const finalSnapshot = await window.wanexDesktop.invoke(desktopRequest(
    "snapshot",
    "electron_final_snapshot"
  ))
  const finalLocal = readRecord(readRecord(finalSnapshot).snapshot).local
  const finalProfiles = readRecord(finalLocal).providerProfiles
  const finalPrivacy = readRecord(readRecord(finalSnapshot).snapshot).privacy
  const result = {
    snapshotOk: responseOk(snapshot),
    profilesOk: responseOk(profiles),
    hotConfigOk: responseOk(selected) &&
      readRecord(finalProfiles).activeProfileId === "electron-secondary",
    actionOk: completedConversationAction(action),
    isolatedResponse: privacyFlagsAreSafe(finalPrivacy),
    privacyOk
  }
  document.body.dataset.smoke = Object.values(result).every(Boolean)
    ? "passed"
    : "failed"
  return result
}

void window.wanexDesktop.invoke(desktopRequest("snapshot", "electron_initial"))
  .then((response) => {
    document.querySelector("pre")!.textContent = JSON.stringify(response, null, 2)
    document.body.dataset.ready = "true"
  })

function desktopRequest(operation: string, requestId: string): object {
  return {
    kind: "product-app-desktop-main.request",
    operation,
    requestId
  }
}

function responseOk(value: unknown): boolean {
  const response = readRecord(value)
  return response.kind === "product-app-desktop-main.response" &&
    response.ok === true
}

function completedConversationAction(value: unknown): boolean {
  if (!responseOk(value)) return false
  const webResponse = readRecord(readRecord(value).webResponse)
  const submitResult = readRecord(webResponse.submitResult)
  const actionResult = readRecord(submitResult.actionResult)
  const document = readRecord(webResponse.document)
  const snapshot = readRecord(document.snapshot)
  const conversation = readRecord(snapshot.conversation)
  const operation = readRecord(conversation.operation)
  const transcript = readRecord(operation.transcript)
  const rows = Array.isArray(transcript.rows) ? transcript.rows : []
  return webResponse.ok === true &&
    submitResult.ok === true &&
    actionResult.ok === true &&
    actionResult.action === "submit-conversation" &&
    typeof conversation.sessionId === "string" &&
    rows.some((row) =>
      readRecord(row).text === "electron production boundary"
    )
}

function privacyFlagsAreSafe(value: unknown): boolean {
  const privacy = readRecord(value)
  return privacy.exposesStorePath === false &&
    privacy.exposesServiceBinaryPath === false &&
    privacy.exposesSecrets === false &&
    privacy.exposesRawStorageClient === false &&
    privacy.exposesRendererMutationApi === false
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {}
}
