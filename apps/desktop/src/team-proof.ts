import {
  WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
  WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE,
  WANEX_DESKTOP_PROOF_TEAM_MESSAGE,
  WANEX_DESKTOP_PROOF_TEAM_TITLE,
  type WanexDesktopTeamProofResult,
} from "./proof-contract.js"

interface WanexDesktopTeamProofExpected {
  readonly groupTitle: string
  readonly message: string
  readonly agentSessionTitle: string
  readonly response: string
}

export function wanexDesktopTeamProofScript(): string {
  return `(${runWanexDesktopTeamProof.toString()})(${JSON.stringify({
    groupTitle: WANEX_DESKTOP_PROOF_TEAM_TITLE,
    message: WANEX_DESKTOP_PROOF_TEAM_MESSAGE,
    agentSessionTitle: WANEX_DESKTOP_PROOF_RELAUNCH_HEADING,
    response: WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE,
  })})`
}

export async function runWanexDesktopTeamProof(
  expected: WanexDesktopTeamProofExpected,
): Promise<WanexDesktopTeamProofResult> {
  const startedAt = performance.now()
  const ready = await waitForDom(() => {
    const surface = document.querySelector("[data-ui-product-shell]")
    const newGroup = surface?.querySelector('button[aria-label="New group"]')
    const agentSession = [...(surface?.querySelectorAll(
      "[data-ui-session-select]",
    ) ?? [])].find((candidate) =>
      candidate.textContent?.includes(expected.agentSessionTitle) === true
    )
    if (
      !(surface instanceof HTMLElement) ||
      !(newGroup instanceof HTMLButtonElement) ||
      !(agentSession instanceof HTMLButtonElement) ||
      surface.querySelector('[data-ui-provider-state="ready"]') === null
    ) return undefined
    return { surface, newGroup }
  }, 10_000, "product_ready")
  const rendererInteractive = performance.now() - startedAt

  ready.newGroup.click()
  const groupForm = await waitForDom(() => {
    const input = ready.surface.querySelector('input[aria-label="Group name"]')
    const coordinatedMode = ready.surface.querySelector(
      'input[name="group-mode"][value="coordinated"]',
    )
    const discussionMode = ready.surface.querySelector(
      'input[name="group-mode"][value="discussion"]',
    )
    const form = input?.closest("form")
    const create = form?.querySelector('button[aria-label="Create group"]')
    return input instanceof HTMLInputElement &&
        coordinatedMode instanceof HTMLInputElement &&
        discussionMode instanceof HTMLInputElement &&
        form instanceof HTMLFormElement &&
        create instanceof HTMLButtonElement
      ? { create, form, input, coordinatedMode, discussionMode }
      : undefined
  }, 5_000, "group_form")
  const coordinatedModeDefault =
    groupForm.coordinatedMode.checked && !groupForm.discussionMode.checked
  setControlValue(groupForm.input, expected.groupTitle)
  const createGroup = await waitForDom(
    () => !groupForm.create.disabled ? groupForm.create : undefined,
    5_000,
    "group_create_ready",
  )
  createGroup.click()

  const groupRow = await waitForDom(() => {
    const row = [...ready.surface.querySelectorAll("[data-ui-team-row]")]
      .find((candidate) => candidate.textContent?.includes(expected.groupTitle))
    return row instanceof HTMLButtonElement && row.getAttribute("aria-current") === "page"
      ? row
      : undefined
  }, 10_000, "group_created")

  const team = await waitForDom(() => {
    const selectedGroup = [...ready.surface.querySelectorAll(
      '[data-ui-team-row][aria-current="page"]',
    )].find((candidate) => candidate.textContent?.includes(expected.groupTitle))
    const main = ready.surface.querySelector("[data-ui-team-main]")
    const timeline = main?.querySelector("[data-ui-team-timeline]")
    const composer = main?.querySelector("[data-ui-team-composer]")
    const textarea = composer?.querySelector('textarea[aria-label="Message the group"]')
    const send = composer?.querySelector('button[aria-label="Send to group"]')
    if (
      !(selectedGroup instanceof HTMLButtonElement) ||
      !(main instanceof HTMLElement) ||
      !(timeline instanceof HTMLElement) ||
      !(composer instanceof HTMLFormElement) ||
      !(textarea instanceof HTMLTextAreaElement) ||
      !(send instanceof HTMLButtonElement)
    ) return undefined
    return { main, timeline, composer, textarea, send }
  }, 10_000, "group_selected")

  const groupTitleVisible = ready.surface.textContent?.includes(expected.groupTitle) === true
  const zeroAgentStateTruthful =
    team.send.disabled &&
    team.textarea.disabled === false &&
    team.main.textContent?.includes("Add an agent before sending") === true
  const coordinatorRequired =
    team.main.textContent?.includes("Coordinator required") === true
  const sessionOnlyComposerAbsent =
    team.main.querySelector("[data-ui-composer]") === null
  const sessionOnlyControlsAbsent = [
    "[data-ui-attachment-input]",
    "[data-ui-open-commands]",
    "[data-ui-open-workflows]",
    '[data-ui-action="regenerate-conversation"]',
  ].every((selector) => team.main.querySelector(selector) === null)

  const context = await waitForDom(() => {
    const panel = ready.surface.querySelector("[data-ui-team-context]")
    const select = panel?.querySelector('select[aria-label="Agent conversation"]')
    const form = select?.closest("form")
    const add = form?.querySelector('button[type="submit"]')
    if (
      !(panel instanceof HTMLElement) ||
      !(select instanceof HTMLSelectElement) ||
      !(form instanceof HTMLFormElement) ||
      !(add instanceof HTMLButtonElement)
    ) return undefined
    const option = [...select.options].find((candidate) =>
      candidate.textContent?.includes(expected.agentSessionTitle) === true
    )
    return option === undefined ? undefined : { add, panel, select, form, option }
  }, 10_000, "team_context")
  const contextAutoOpened = context.panel.isConnected

  setControlValue(context.select, context.option.value)
  const addParticipant = await waitForDom(
    () => context.panel.isConnected && !context.add.disabled
      ? context.add
      : undefined,
    5_000,
    "participant_add_ready",
  )
  addParticipant.click()
  const participant = await waitForDom(() => {
    const rows = [...context.panel.querySelectorAll(
      '[data-ui-team-participant-state="active"]',
    )]
    const matching = rows.filter((candidate) =>
      candidate.textContent?.includes(expected.agentSessionTitle) === true
    )
    return matching.length === 0
      ? undefined
      : { row: matching[0]!, count: matching.length }
  }, 10_000, "participant_added")

  const assignCoordinator = await waitForDom(() => {
    const button = [...context.panel.querySelectorAll("button")].find((candidate) =>
      candidate.getAttribute("aria-label") ===
        `Make ${expected.agentSessionTitle} coordinator`
    )
    return button instanceof HTMLButtonElement && !button.disabled
      ? button
      : undefined
  }, 10_000, "coordinator_action")
  const coordinatorRequiredAfterAdmission =
    team.main.textContent?.includes("Choose a coordinator before sending") === true
  assignCoordinator.click()
  const coordinatorState = await waitForDom(() => {
    const status = context.panel.querySelector("[data-ui-team-coordinator]")
    const row = context.panel.querySelector(
      '[data-ui-team-participant-state="active"][data-ui-team-coordinator="true"]',
    )
    if (
      !(status instanceof HTMLElement) ||
      !(row instanceof HTMLElement) ||
      !status.textContent?.includes(expected.agentSessionTitle) ||
      !row.textContent?.includes(expected.agentSessionTitle)
    ) return undefined
    const mute = [...row.querySelectorAll("button")].find((candidate) =>
      candidate.getAttribute("aria-label") ===
        `Reassign the coordinator before muting ${expected.agentSessionTitle}`
    )
    const remove = [...row.querySelectorAll("button")].find((candidate) =>
      candidate.getAttribute("aria-label") ===
        `Reassign the coordinator before removing ${expected.agentSessionTitle}`
    )
    return mute instanceof HTMLButtonElement &&
        remove instanceof HTMLButtonElement &&
        mute.disabled &&
        remove.disabled
      ? { row, mute, remove }
      : undefined
  }, 10_000, "coordinator_assigned")
  const coordinatorAssigned =
    coordinatorState.row.getAttribute("data-ui-team-coordinator") === "true"
  const coordinatorMemberGuards =
    coordinatorState.mute.disabled && coordinatorState.remove.disabled

  const readyComposer = await waitForDom(
    () => {
      const main = ready.surface.querySelector("[data-ui-team-main]")
      const composer = main?.querySelector("[data-ui-team-composer]")
      const textarea = composer?.querySelector(
        'textarea[aria-label="Message the group"]',
      )
      const send = composer?.querySelector(
        'button[aria-label="Send to group"]',
      )
      return main instanceof HTMLElement &&
          composer instanceof HTMLFormElement &&
          textarea instanceof HTMLTextAreaElement &&
          send instanceof HTMLButtonElement &&
          !textarea.disabled &&
          teamComposerDiagnostic() === "draft_required"
        ? { main, composer, textarea, send }
        : undefined
    },
    10_000,
    "team_composer_ready",
    teamComposerDiagnostic,
  )
  let activeRoundObserved = hasActiveRound(readyComposer.main)
  const activeObserver = new MutationObserver(() => {
    if (hasActiveRound(readyComposer.main)) activeRoundObserved = true
  })
  activeObserver.observe(readyComposer.main, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "data-ui-team-round-status",
      "data-ui-team-delivery-status",
    ],
  })

  setControlValue(readyComposer.textarea, expected.message)
  await waitForDom(
    () => !readyComposer.send.disabled ? true : undefined,
    5_000,
    "team_draft",
  )
  const submittedAt = performance.now()
  readyComposer.send.click()
  let terminal
  try {
    terminal = await waitForDom(() => terminalTeamEvidence(
      readyComposer.main,
      expected.message,
      expected.agentSessionTitle,
      expected.response,
    ), 20_000, "team_terminal")
  } finally {
    activeObserver.disconnect()
  }
  const settledAt = performance.now()
  const teamTimelineVisible =
    readyComposer.main.querySelector("[data-ui-team-timeline]") !== null
  const teamComposerVisible = readyComposer.composer.isConnected

  const teamText = `${readyComposer.main.textContent ?? ""}\n${context.panel.textContent ?? ""}`
  const teamMarkup = `${readyComposer.main.outerHTML}\n${context.panel.outerHTML}`
  const internalIdentityEvidenceHidden =
    !/(agentSessionId|sessionId|operationId|participantId|roundId|deliveryId|leaseId|bindingId|secretRef)/i
      .test(teamText) &&
    !/(data-ui-(?:agent-session|operation|participant|round|delivery|lease|binding)-id)/i
      .test(teamMarkup)
  const hostPathEvidenceHidden =
    !/(system-service|(?:^|\s)\/var\/|[A-Za-z]:\\|\.sqlite\b|Bearer\s+)/i
      .test(teamText)
  const providerEvidenceRedacted =
    !document.documentElement.innerHTML.includes("secretRef") &&
    [...document.querySelectorAll('input[type="password"]')].every((input) =>
      !(input instanceof HTMLInputElement) || input.value.length === 0
    )

  const originalSession = [...ready.surface.querySelectorAll(
    "[data-ui-session-select]",
  )].find((candidate) =>
    candidate.textContent?.includes(expected.agentSessionTitle) === true
  )
  if (!(originalSession instanceof HTMLButtonElement)) {
    throw new Error("Desktop Team proof original session is unavailable")
  }
  originalSession.click()
  const originalSessionRestored = await waitForDom(() => {
    const selected = [...ready.surface.querySelectorAll(
      '[data-ui-session-select][aria-current="true"]',
    )].find((candidate) =>
      candidate.textContent?.includes(expected.agentSessionTitle) === true
    )
    return selected !== undefined &&
        ready.surface.querySelector("[data-ui-composer]") !== null
      ? true
      : undefined
  }, 10_000, "session_restore")

  const result = {
    ok: false,
    step: "relaunch-team" as const,
    providerReady: true,
    providerEvidenceRedacted,
    existingAgentSessionAvailable: true,
    groupCreated: true,
    groupSelected: true,
    groupTitleVisible,
    coordinatedModeDefault,
    zeroAgentStateTruthful,
    coordinatorRequired: coordinatorRequired && coordinatorRequiredAfterAdmission,
    coordinatorAssigned,
    coordinatorMemberGuards,
    contextAutoOpened,
    teamTimelineVisible,
    teamComposerVisible,
    contextVisible: true,
    participantAdded: true,
    participantCount: participant.count,
    participantNameVisible:
      participant.row.textContent?.includes(expected.agentSessionTitle) === true,
    roundSubmitted: terminal.userMessageVisible,
    activeRoundObserved,
    automaticTerminalRefresh: terminal.roundCompleted && terminal.deliveryReplied,
    roundCompleted: terminal.roundCompleted,
    deliveryReplied: terminal.deliveryReplied,
    singleCoordinatorDelivery: terminal.singleCoordinatorDelivery,
    publicAgentReplyVisible: terminal.publicAgentReplyVisible,
    singlePublicCoordinatorReply: terminal.singlePublicCoordinatorReply,
    sessionOnlyComposerAbsent,
    sessionOnlyControlsAbsent,
    internalIdentityEvidenceHidden,
    hostPathEvidenceHidden,
    originalSessionRestored,
    timingsMs: {
      rendererInteractive,
      conversationSettlement: settledAt - submittedAt,
      rendererPostSettlement: performance.now() - settledAt,
    },
  }
  return {
    ...result,
    ok: Object.entries(result).every(([key, value]) =>
      key === "ok" ||
      key === "step" ||
      key === "participantCount" ||
      key === "timingsMs" ||
      value === true
    ) && result.participantCount === 1,
  }

  function terminalTeamEvidence(
    main: Element,
    message: string,
    agentName: string,
    response: string,
  ): {
    readonly userMessageVisible: boolean
    readonly roundCompleted: boolean
    readonly deliveryReplied: boolean
    readonly singleCoordinatorDelivery: boolean
    readonly publicAgentReplyVisible: boolean
    readonly singlePublicCoordinatorReply: boolean
  } | undefined {
    const messages = [...main.querySelectorAll("[data-ui-team-message]")]
    const repliedDeliveries = [...main.querySelectorAll(
      '[data-ui-team-delivery-status="replied"]',
    )]
    const publicCoordinatorReplies = messages.filter((row) =>
      row.textContent?.includes(agentName) === true &&
      row.textContent?.includes(response) === true
    )
    const value = {
      userMessageVisible: messages.some((row) => row.textContent?.includes(message)),
      roundCompleted:
        main.querySelector('[data-ui-team-round-status="completed"]') !== null,
      deliveryReplied: repliedDeliveries.length > 0,
      singleCoordinatorDelivery: repliedDeliveries.length === 1,
      publicAgentReplyVisible: publicCoordinatorReplies.length > 0,
      singlePublicCoordinatorReply: publicCoordinatorReplies.length === 1,
    }
    return Object.values(value).every(Boolean) ? value : undefined
  }

  function hasActiveRound(main: Element): boolean {
    return main.querySelector('[data-ui-team-round-status="running"]') !== null ||
      main.querySelector(
        '[data-ui-team-delivery-status="waiting"], [data-ui-team-delivery-status="responding"]',
      ) !== null
  }

  function teamComposerDiagnostic(): string {
    const main = ready.surface.querySelector("[data-ui-team-main]")
    const text = main?.textContent ?? ""
    if (text.includes("Add an agent before sending")) return "zero_agents"
    if (text.includes("Choose a coordinator before sending")) {
      return "coordinator_required"
    }
    if (text.includes("Waiting for the current round to finish")) {
      return "active_round"
    }
    if (text.includes("Connect a model in Settings to send")) {
      return "provider_blocked"
    }
    if (text.includes("This group is closed")) return "group_closed"
    const textarea = main?.querySelector('textarea[aria-label="Message the group"]')
    const send = main?.querySelector('button[aria-label="Send to group"]')
    return textarea instanceof HTMLTextAreaElement &&
        send instanceof HTMLButtonElement
      ? send.disabled && !textarea.disabled && textarea.value.trim().length === 0
        ? "draft_required"
        : send.disabled ? "disabled_unknown" : "ready"
      : "composer_missing"
  }

  function setControlValue(
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    setter?.call(control, value)
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("change", { bubbles: true }))
  }

  async function waitForDom<T>(
    read: () => T | undefined,
    timeoutMs: number,
    stage: string,
    diagnostic?: () => string,
  ): Promise<T> {
    const initial = read()
    if (initial !== undefined) return initial
    return await new Promise<T>((resolve, reject) => {
      let settled = false
      const observer = new MutationObserver(() => finish(read()))
      const timeout = window.setTimeout(() => {
        finish(read())
        if (!settled) {
          settled = true
          observer.disconnect()
          reject(new Error(
            `Desktop Team proof timed out during ${stage}:${diagnostic?.() ?? "unavailable"}`,
          ))
        }
      }, timeoutMs)
      const finish = (value: T | undefined): void => {
        if (settled || value === undefined) return
        settled = true
        window.clearTimeout(timeout)
        observer.disconnect()
        resolve(value)
      }
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      })
      queueMicrotask(() => finish(read()))
    })
  }
}
