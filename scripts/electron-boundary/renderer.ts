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

const CONVERSATION_COMPLETION_TIMEOUT_MS = 15_000
const CONVERSATION_REFRESH_INTERVAL_MS = 50
const CONVERSATION_TEXT = "electron production boundary"

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
        fields: { text: CONVERSATION_TEXT }
      },
      options: { pollAfterAction: { limit: 64 } }
    }
  })
  const actionOk = await completedConversationAction(action)
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
    actionOk,
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

async function completedConversationAction(value: unknown): Promise<boolean> {
  const sessionId = submittedConversationSession(value)
  if (sessionId === undefined) return false

  const deadline = Date.now() + CONVERSATION_COMPLETION_TIMEOUT_MS
  let current = value
  let refreshIndex = 0
  while (true) {
    const completion = conversationCompletion(current, sessionId)
    if (completion === "completed") return true
    if (completion === "failed" || Date.now() >= deadline) return false

    await wait(CONVERSATION_REFRESH_INTERVAL_MS)
    refreshIndex += 1
    current = await window.wanexDesktop.invoke({
      ...desktopRequest(
        "webRequest",
        `electron_refresh_conversation_${refreshIndex}`
      ),
      request: {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: `electron_refresh_conversation_${refreshIndex}`,
        input: {
          action: "refresh-conversation",
          fields: { sessionId }
        },
        options: { pollAfterAction: false }
      }
    })
  }
}

function submittedConversationSession(value: unknown): string | undefined {
  if (!responseOk(value)) return undefined
  const webResponse = readRecord(readRecord(value).webResponse)
  const submitResult = readRecord(webResponse.submitResult)
  const actionResult = readRecord(submitResult.actionResult)
  const document = readRecord(webResponse.document)
  const snapshot = readRecord(document.snapshot)
  const conversation = readRecord(snapshot.conversation)
  return webResponse.ok === true &&
    submitResult.ok === true &&
    actionResult.ok === true &&
    actionResult.action === "submit-conversation" &&
    typeof conversation.sessionId === "string"
    ? conversation.sessionId
    : undefined
}

function conversationCompletion(
  value: unknown,
  sessionId: string
): "pending" | "completed" | "failed" {
  if (!responseOk(value)) return "failed"
  const webResponse = readRecord(readRecord(value).webResponse)
  const submitResult = readRecord(webResponse.submitResult)
  const actionResult = readRecord(submitResult.actionResult)
  const document = readRecord(webResponse.document)
  const snapshot = readRecord(document.snapshot)
  const conversation = readRecord(snapshot.conversation)
  const operation = readRecord(conversation.operation)
  const capabilities = readRecord(operation.capabilities)
  if (
    webResponse.ok !== true ||
    submitResult.ok !== true ||
    actionResult.ok !== true ||
    conversation.sessionId !== sessionId ||
    operation.kind !== "product-app.conversation-operation" ||
    typeof operation.operationId !== "string" ||
    operation.sessionId !== sessionId ||
    typeof operation.state !== "string"
  ) {
    return "failed"
  }
  if (capabilities.terminal === false) {
    return ["queued", "running", "cancel_requested"].includes(operation.state)
      ? "pending"
      : "failed"
  }
  if (capabilities.terminal !== true) return "failed"
  if (operation.state !== "succeeded") return "failed"

  const transcript = readRecord(operation.transcript)
  const rows = Array.isArray(transcript.rows) ? transcript.rows : []
  const hasUserInput = rows.some((row) => {
    const record = readRecord(row)
    return record.role === "user" && record.text === CONVERSATION_TEXT
  })
  const hasAssistantOutput = rows.some((row) => {
    const record = readRecord(row)
    return record.role === "assistant" &&
      typeof record.text === "string" &&
      record.text.trim().length > 0
  })
  return hasUserInput && hasAssistantOutput ? "completed" : "failed"
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
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
