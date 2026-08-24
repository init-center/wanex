import { describe, expect, it } from "vitest"
import { createWanexDesktopOwnedLifecycle } from "../src/lifecycle.js"
import { wanexDesktopRendererProofScript } from "../src/proof.js"
import {
  wanexDesktopProviderGuidedFollowUpAdmissionProofScript,
  wanexDesktopProviderGuidedFollowUpSettlementProofScript,
  wanexDesktopProviderRelaunchProofScript,
  wanexDesktopProviderSideQueryAdmissionProofScript,
  wanexDesktopProviderSideQuerySettlementProofScript
} from "../src/provider-relaunch-proof-script.js"
import {
  createWanexDesktopProviderRelaunchProofResult
} from "../src/provider-relaunch-proof-result.js"
import {
  requiredWanexDesktopPackagedProofStep,
} from "../src/packaged-renderer-proof.js"
import {
  wanexDesktopScheduleCreateAdmissionProofScript,
  wanexDesktopScheduleCreateSettlementProofScript,
  wanexDesktopScheduleDisableBeforeReleaseProofScript,
  wanexDesktopScheduleRestoreProofScript,
} from "../src/schedule-proof-script.js"
import { wanexDesktopTeamProofScript } from "../src/team-proof.js"
import {
  wanexDesktopPluginInstallProofScript,
  wanexDesktopPluginRestoreProofScript,
} from "../src/plugin-management-proof.js"
import {
  isWanexDesktopOwnedNavigation,
  resolveWanexDesktopWindowChrome,
} from "../src/window-policy.js"

describe("Product Desktop lifecycle and navigation", () => {
  it("closes owned resources exactly once", async () => {
    let closes = 0
    const lifecycle = createWanexDesktopOwnedLifecycle(async () => {
      closes += 1
    })

    expect(lifecycle.state).toBe("open")
    await Promise.all([lifecycle.close(), lifecycle.close(), lifecycle.close()])
    expect(lifecycle.state).toBe("closed")
    expect(closes).toBe(1)
  })

  it("allows only the exact app-owned Product origin", () => {
    const origin = "http://127.0.0.1:41235/"
    expect(isWanexDesktopOwnedNavigation(
      "http://127.0.0.1:41235/wanex/web/request",
      origin
    )).toBe(true)
    expect(isWanexDesktopOwnedNavigation(
      "http://127.0.0.1:41236/",
      origin
    )).toBe(false)
    expect(isWanexDesktopOwnedNavigation("https://example.com/", origin)).toBe(false)
    expect(isWanexDesktopOwnedNavigation("file:///tmp/escape", origin)).toBe(false)
  })

  it("integrates the macOS traffic lights into the Product topbar", () => {
    expect(resolveWanexDesktopWindowChrome("darwin")).toEqual({
      documentChrome: "integrated-macos",
      title: "",
      titleBarStyle: "hiddenInset",
    })
    expect(resolveWanexDesktopWindowChrome("win32")).toEqual({
      documentChrome: "standard",
      title: "Wanex",
    })
  })

  it("proves first-viewport readiness and natural keyboard submission", () => {
    const script = wanexDesktopRendererProofScript({
      providerBaseUrl: "http://127.0.0.1:41236/v1",
      credential: "desktop-proof-test-credential"
    })

    expect(script).toContain("captureInitialLayout")
    expect(script).toContain("shellStartsAtViewportTop")
    expect(script).toContain("shellFitsViewport")
    expect(script).toContain("noHorizontalOverflow")
    expect(script).toContain("settingsTriggerFullyVisible")
    expect(script).toContain("settingsPanelInitiallyClosed")
    expect(script).toContain("sidebarVisible")
    expect(script).toContain("composerFullyVisible")
    expect(script).toContain("initialScrollPolicyValid")
    expect(script).toContain("conversationSpaceAllocation")
    expect(script).toContain("composerControlsComplete")
    expect(script).toContain("[data-ui-composer]")
    expect(script).toContain("[data-ui-conversation-timeline]")
    expect(script).toContain("workflowsContextual")
    expect(script).toContain("conversationIdentityIntegrity")
    expect(script).toContain("soleProductRenderer")
    expect(script).toContain("unknownRouteRejected")
    expect(script).toContain("sessionNavigationTruth")
    expect(script).toContain("canonicalTranscriptIntegrity")
    expect(script).toContain("conversationTimelineSemantics")
    expect(script).toContain("[data-ui-transient-assistant]")
    expect(script).toContain("chatFirstInformationArchitecture")
    expect(script).toContain("[data-ui-selected-session-title]")
    expect(script).toContain("[data-ui-session-title]")
    expect(script).toContain("[data-ui-open-workflows]")
    expect(script).toContain('new Event("change"')
    expect(script).toContain('new KeyboardEvent("keydown"')
    expect(script).toContain("createWanexDesktopProviderLifecycleProof")
    expect(script).toContain("providerEditedWithoutCredential")
    expect(script).toContain("removeSelectedAndRunFallback")
    expect(script).toContain("!candidate.disabled")
    expect(script).toContain("submit instanceof HTMLButtonElement")
    expect(script).toContain("!submit.disabled")
    expect(script).toContain("desktop-proof-selected-model")
    expect(script).toContain("conversationTimelineSemantics")
    expect(script).toContain("message-header")
    expect(script).not.toContain('querySelector("header strong")')
    expect(script).not.toContain("scrollIntoView")
  })

  it("proves Schedule mutations through canonical state and action settlement", () => {
    const admission = wanexDesktopScheduleCreateAdmissionProofScript()
    const schedule = {
      ok: true,
      scheduleId: "schedule-proof",
      sessionId: "session-proof",
      rendererInteractive: 1,
      visibleFormCreated: true,
      isolatedSessionSelected: true,
      activeModelSelected: true,
      skipMisfireSelected: true,
      enabledAtCreation: true,
      scheduleCreated: true,
      scheduleSessionVisible: true,
      firstUserVisible: true,
      firstPartialResponseVisible: true,
    } as const
    const preRelease = wanexDesktopScheduleDisableBeforeReleaseProofScript(schedule)
    const settlement = wanexDesktopScheduleCreateSettlementProofScript(schedule, {
      disabledBeforeRelease: true,
      userCountAtDisable: 1,
    })
    const restore = wanexDesktopScheduleRestoreProofScript()

    for (const script of [admission, preRelease, settlement, restore]) {
      expect(script).toContain("settledScheduleRow")
      expect(script).toContain(
        'toggle.title === (enabled ? "Disable schedule" : "Enable schedule")',
      )
      expect(script).not.toContain("data-ui-schedule-status")
    }
    expect(preRelease).toContain("observed an overlapping execution")
    expect(settlement).toContain("userCountAtDisable")
  })

  it("uses explicit secret-free scripts after Provider configuration", () => {
    const credential = "desktop-relaunch-proof-credential"
    const configure = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-configure",
      providerBaseUrl: "http://127.0.0.1:41236/v1",
      credential
    })
    const chat = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-chat"
    })
    const cancelRegenerate = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-cancel-regenerate"
    })
    const guidedAdmission =
      wanexDesktopProviderGuidedFollowUpAdmissionProofScript()
    const guidedSettlement =
      wanexDesktopProviderGuidedFollowUpSettlementProofScript({
        ok: true,
        sessionId: "session-proof",
        parentOperationId: "operation-parent",
        childOperationId: "operation-child",
        initialUserRowIds: ["message-user-before"],
        initialAssistantRowIds: ["message-assistant-before"],
        submittedAt: 10,
        rendererInteractive: 5,
        parentPartialVisible: true,
        composerModeVisible: true,
        followUpSubmitted: true,
        draftClearedAfterAcceptance: true,
        pendingVisible: true,
        parentOperationPreserved: true
      })
    const sideQueryAdmission =
      wanexDesktopProviderSideQueryAdmissionProofScript()
    const sideQuerySettlement =
      wanexDesktopProviderSideQuerySettlementProofScript({
        ok: true,
        sessionId: "session-proof",
        parentOperationId: "operation-side-parent",
        initialUserRowIds: ["message-user-before"],
        initialAssistantRowIds: ["message-assistant-before"],
        submittedAt: 10,
        rendererInteractive: 5,
        parentPartialVisible: true,
        disclosureVisible: true,
        querySubmitted: true,
        answerVisible: true,
        parentOperationPreserved: true,
        transcriptUnchanged: true,
        dismissed: true
      })
    const cleanup = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-cleanup"
    })
    const multimodal = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-multimodal"
    })
    const unconfigured = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-unconfigured"
    })
    const team = wanexDesktopTeamProofScript()
    const pluginExpected = {
      pluginId: "wanex.proof.extension",
      commandId: "wanex.proof.extension.echo",
      v1Version: "1.0.0",
      v2Version: "2.0.0",
    }
    const pluginInstall = wanexDesktopPluginInstallProofScript(pluginExpected)
    const pluginRestore = wanexDesktopPluginRestoreProofScript(pluginExpected)

    expect(configure).toContain(credential)
    expect(configure).toContain("desktop-proof-relaunch-model")
    expect(configure).toContain("Wanex relaunch continuity proof")
    expect(configure).toContain("canonical transcript")
    expect(configure).toContain("appearanceConfigured")
    expect(configure).toContain('data-ui-preference-value=\\"dark\\"')
    expect(configure).toContain('data-ui-preference-value=\\"compact\\"')
    expect(chat).toContain("Continue the existing conversation after reopening")
    expect(chat).toContain("desktop-proof-relaunch-model")
    expect(chat).toContain("appearanceRestored")
    expect(cancelRegenerate).toContain("WANEX_CANCEL_REGENERATE_V1")
    expect(cancelRegenerate).toContain('data-ui-action=\\"cancel-conversation\\"')
    expect(cancelRegenerate).toContain('data-ui-action=\\"regenerate-conversation\\"')
    expect(cancelRegenerate).toContain("regenerationFreshOperation")
    expect(guidedAdmission).toContain("WANEX_GUIDED_PARENT_V1")
    expect(guidedAdmission).toContain("WANEX_GUIDED_CHILD_V1")
    expect(guidedAdmission).toContain('data-ui-composer-mode=\\"queue\\"')
    expect(guidedAdmission).toContain("guided_queue_mode")
    expect(guidedAdmission).toContain("data-ui-pending-operation-id")
    expect(guidedSettlement).toContain("operation-parent")
    expect(guidedSettlement).toContain("operation-child")
    expect(guidedSettlement).toContain("guidedChildPromoted")
    expect(sideQueryAdmission).toContain("WANEX_SIDE_QUERY_PARENT_V1")
    expect(sideQueryAdmission).toContain("WANEX_SIDE_QUERY_V1")
    expect(sideQueryAdmission).toContain('data-ui-workflow-tab=\\"aside\\"')
    expect(sideQueryAdmission).toContain("side_query_workflows_open")
    expect(sideQueryAdmission).toContain("dismiss-side-query")
    expect(sideQuerySettlement).toContain("operation-side-parent")
    expect(sideQuerySettlement).toContain("sideQueryTranscriptUnchanged")
    expect(multimodal).toContain("wanex-proof-image.png")
    expect(multimodal).toContain("unsupported-proof.pdf")
    expect(multimodal).toContain("new DataTransfer")
    expect(multimodal).toContain('transferEvent("paste", "clipboardData"')
    expect(multimodal).toContain('transferEvent("drop", "dataTransfer"')
    const imageGeneration = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-image-generation"
    })
    const plan = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-plan"
    })
    const goal = wanexDesktopProviderRelaunchProofScript({
      step: "relaunch-goal"
    })
    expect(imageGeneration).toContain("desktop-proof-image-model")
    expect(imageGeneration).toContain("image_generate")
    expect(imageGeneration).toContain('data-ui-tool=\\"image_generate\\"')
    expect(imageGeneration).toContain("image_generation_settlement")
    expect(plan).toContain("Plan the next safe Wanex proof step")
    expect(plan).toContain("data-ui-plan-proposal-state")
    expect(plan).toContain("decide-plan-proposal")
    expect(plan).toContain("execute-plan-proposal")
    expect(plan).toContain("plan_approval_ready")
    expect(plan).toContain("plan_execution_ready")
    expect(plan).toContain("button.disabled ? undefined : button")
    expect(plan).toContain("planExecutionAbsentBeforeApproval")
    expect(goal).toContain("Complete the installed Wanex proof goal")
    expect(goal).toContain("data-ui-goal-attempt")
    expect(goal).toContain("goalAutonomousContinuation")
    expect(goal).toContain("failed,passed")
    expect(team).toContain("Installed team acceptance")
    expect(team).toContain("Prove the installed team delivery path")
    expect(team).toContain('button[aria-label=\\"New group\\"]')
    expect(team).toContain('input[aria-label=\\"Group name\\"]')
    expect(team).toContain('input[name=\\"group-mode\\"][value=\\"coordinated\\"]')
    expect(team).toContain('select[aria-label=\\"Agent conversation\\"]')
    expect(team).toContain("Make ${expected.agentSessionTitle} coordinator")
    expect(team).toContain("coordinatorMemberGuards")
    expect(team).toContain("contextAutoOpened")
    expect(team).toContain('textarea[aria-label=\\"Message the group\\"]')
    expect(team).toContain('data-ui-team-round-status=\\"completed\\"')
    expect(team).toContain('data-ui-team-delivery-status=\\"replied\\"')
    expect(team).toContain("MutationObserver")
    expect(team).toContain("activeRoundObserved")
    expect(team).toContain("automaticTerminalRefresh")
    expect(team).toContain("singleCoordinatorDelivery")
    expect(team).toContain("singlePublicCoordinatorReply")
    expect(team).toContain("originalSessionRestored")
    expect(team).not.toContain("setInterval")
    expect(cleanup).toContain("data-ui-provider-remove")
    expect(cleanup).toContain("data-ui-team-composer")
    expect(unconfigured).toContain("chatBlocked")
    expect(chat).not.toContain(credential)
    expect(cancelRegenerate).not.toContain(credential)
    expect(guidedAdmission).not.toContain(credential)
    expect(guidedSettlement).not.toContain(credential)
    expect(sideQueryAdmission).not.toContain(credential)
    expect(sideQuerySettlement).not.toContain(credential)
    expect(multimodal).not.toContain(credential)
    expect(imageGeneration).not.toContain(credential)
    expect(plan).not.toContain(credential)
    expect(goal).not.toContain(credential)
    expect(team).not.toContain(credential)
    expect(pluginInstall).toContain('data-ui-extension-add')
    expect(pluginInstall).toContain('data-ui-extension-approve')
    expect(pluginInstall).toContain('data-ui-command-preview=\\"runnable\\"')
    expect(pluginInstall).toContain("v1DisabledAfterReplacement")
    expect(pluginInstall).toContain("MutationObserver")
    expect(pluginInstall).not.toContain("setInterval")
    expect(pluginInstall).not.toContain(credential)
    expect(pluginRestore).toContain("reviewTransientAbsent")
    expect(pluginRestore).toContain("data-ui-extension-remove-confirm")
    expect(pluginRestore).toContain("commandAbsentAfterRemoval")
    expect(pluginRestore).toContain("MutationObserver")
    expect(pluginRestore).not.toContain("setInterval")
    expect(pluginRestore).not.toContain(credential)
    expect(cleanup).not.toContain(credential)
    expect(unconfigured).not.toContain(credential)
  })

  it("recognizes the dedicated packaged Team and Plugin proof steps", () => {
    expect(requiredWanexDesktopPackagedProofStep("relaunch-team"))
      .toBe("relaunch-team")
    expect(requiredWanexDesktopPackagedProofStep("relaunch-plugin-install"))
      .toBe("relaunch-plugin-install")
    expect(requiredWanexDesktopPackagedProofStep("relaunch-plugin-restore"))
      .toBe("relaunch-plugin-restore")
    expect(() => requiredWanexDesktopPackagedProofStep("team"))
      .toThrow("must be recognized")
  })

  it("defaults guided follow-up receipt evidence closed", () => {
    expect(createWanexDesktopProviderRelaunchProofResult(
      "relaunch-guided-follow-up",
      {}
    )).toMatchObject({
      ok: false,
      guidedParentSubmitted: false,
      guidedParentPartialVisible: false,
      guidedComposerModeVisible: false,
      guidedFollowUpSubmitted: false,
      guidedDraftClearedAfterAcceptance: false,
      guidedPendingVisible: false,
      guidedParentOperationPreserved: false,
      guidedParentResponseVisible: false,
      guidedChildFreshOperation: false,
      guidedChildPromoted: false,
      guidedChildResponseVisible: false,
      guidedFollowUpSessionPreserved: false,
      guidedParentCompletedWithoutCancellation: false
    })
  })

  it("defaults Side Query receipt evidence closed", () => {
    expect(createWanexDesktopProviderRelaunchProofResult(
      "relaunch-side-query",
      {}
    )).toMatchObject({
      ok: false,
      sideQueryParentSubmitted: false,
      sideQueryParentPartialVisible: false,
      sideQueryDisclosureVisible: false,
      sideQuerySubmitted: false,
      sideQueryAnswerVisible: false,
      sideQueryParentOperationPreserved: false,
      sideQueryTranscriptUnchanged: false,
      sideQueryDismissed: false,
      sideQueryParentResponseVisible: false,
      sideQuerySessionPreserved: false,
      sideQueryParentCompletedWithoutCancellation: false
    })
  })
})
