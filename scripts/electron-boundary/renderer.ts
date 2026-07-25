import type {
  WanexDesktopBridge,
  WanexElectronBoundaryRendererSmokeResult
} from "./contract.js"

declare global {
  interface Window {
    readonly wanexDesktop: WanexDesktopBridge
    wanexBoundarySmoke(): Promise<WanexElectronBoundaryRendererSmokeResult>
  }
}

const CONVERSATION_COMPLETION_TIMEOUT_MS = 15_000
const CONVERSATION_REFRESH_INITIAL_INTERVAL_MS = 100
const CONVERSATION_REFRESH_MAX_INTERVAL_MS = 500
const CONVERSATION_TEXT = "electron production boundary"

window.wanexBoundarySmoke = async () => {
  const rendererStartedAt = performance.now()
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
      options: { pollAfterAction: false }
    }
  })
  const conversationAdmittedAt = performance.now()
  const conversation = await completedConversationAction(action)
  const conversationSettledAt = performance.now()
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
  const completedAt = performance.now()
  const checks = {
    snapshotOk: responseOk(snapshot),
    profilesOk: responseOk(profiles),
    hotConfigOk: responseOk(selected) &&
      readRecord(finalProfiles).activeProfileId === "electron-secondary",
    actionOk: conversation.ok,
    isolatedResponse: privacyFlagsAreSafe(finalPrivacy),
    privacyOk
  }
  document.body.dataset.smoke = Object.values(checks).every(Boolean)
    ? "passed"
    : "failed"
  return {
    checks,
    timingsMs: {
      rendererInteractive: elapsed(rendererStartedAt, conversationAdmittedAt),
      conversationSettlement: elapsed(
        conversationAdmittedAt,
        conversationSettledAt
      ),
      rendererPostSettlement: elapsed(conversationSettledAt, completedAt)
    },
    conversation: {
      sessionId: conversation.sessionId,
      refreshCount: conversation.refreshCount
    }
  }
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

async function completedConversationAction(value: unknown): Promise<{
  readonly ok: boolean
  readonly sessionId: string
  readonly refreshCount: number
}> {
  const sessionId = submittedConversationSession(value)
  if (sessionId === undefined) {
    return { ok: false, sessionId: "", refreshCount: 0 }
  }

  const deadline = Date.now() + CONVERSATION_COMPLETION_TIMEOUT_MS
  let current = value
  let refreshIndex = 0
  while (true) {
    const completion = conversationCompletion(current, sessionId)
    if (completion === "completed") {
      return { ok: true, sessionId, refreshCount: refreshIndex }
    }
    if (completion === "failed" || Date.now() >= deadline) {
      return { ok: false, sessionId, refreshCount: refreshIndex }
    }

    await wait(conversationRefreshInterval(refreshIndex))
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

function conversationRefreshInterval(refreshIndex: number): number {
  return Math.min(
    CONVERSATION_REFRESH_INITIAL_INTERVAL_MS * 2 ** Math.min(refreshIndex, 3),
    CONVERSATION_REFRESH_MAX_INTERVAL_MS
  )
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

function elapsed(start: number, end: number): number {
  return Math.round((end - start) * 100) / 100
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
