import type {
  EditorTheme,
  OverlayHandle,
  SelectListTheme,
  TUI
} from "@earendil-works/pi-tui"
import type {
  GoalReadModel,
  ReadGoalResult,
  StartGoalRequest
} from "@wanex/product"
import type { SurfaceEvent } from "@wanex/product/surface"
import { TuiConfirmationOverlay } from "./components.js"
import {
  TuiGoalReviewOverlay,
  type TuiGoalAction
} from "./goal-components.js"
import {
  TuiStructuredFormOverlay,
  type TuiStructuredFormField
} from "./structured-form.js"
import type { TuiGoalClient } from "./types.js"

const TERMINAL_GOAL_STATES = new Set([
  "limit_reached",
  "succeeded",
  "failed",
  "cancelled"
])
const MAX_GOAL_TEXT_BYTES = 32_768
const MAX_GOAL_ITEM_BYTES = 4_096
const MAX_GOAL_ATTEMPT_LIMIT = 100

type GoalFieldName =
  | "objective"
  | "successCriteria"
  | "boundaries"
  | "constraints"
  | "maxAttempts"
  | "maxBlockedAttempts"

export interface TuiGoal {
  open(): void
  close(): void
  isOpen(): boolean
  handleInvalidation(event: SurfaceEvent): void
  reconcileActive(): Promise<void>
  resetSession(sessionId: string | undefined): void
}

export function createTuiGoal(options: {
  readonly tui: TUI
  readonly terminalRows: () => number
  readonly editorTheme: EditorTheme
  readonly selectTheme: SelectListTheme
  readonly client: TuiGoalClient
  readonly canOpen: () => boolean
  readonly sessionId: () => string | undefined
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiGoal {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let goal: GoalReadModel | undefined
  let goalId: string | undefined
  let currentSession = options.sessionId()
  let sessionAtOpen: string | undefined
  let form: TuiStructuredFormOverlay<GoalFieldName> | undefined
  let reconcileTail = Promise.resolve()

  return {
    open() {
      if (!options.canOpen() || active) return
      active = true
      sessionAtOpen = options.sessionId()
      const token = ++workflow
      showReview(token, { loading: true })
      void reconcile(token).catch((error) =>
        rejectAndClose(token, safeErrorMessage(error))
      )
    },
    close,
    isOpen: () => active,
    handleInvalidation(event) {
      if (
        event.type !== "product.surface.goal.invalidated" ||
        event.goal === undefined
      ) {
        return
      }
      if (event.goal.sessionId !== currentSession) return
      goalId = event.goal.goalId
      if (active) enqueueReconcile()
    },
    async reconcileActive() {
      if (!active) return
      enqueueReconcile()
      await reconcileTail
    },
    resetSession(sessionId) {
      if (currentSession === sessionId) return
      currentSession = sessionId
      goal = undefined
      goalId = undefined
      form = undefined
      if (active) close()
    }
  }

  function enqueueReconcile(): void {
    reconcileTail = reconcileTail
      .then(async () => await reconcile(workflow))
      .catch((error) => {
        if (active) rejectAndClose(workflow, safeErrorMessage(error))
      })
  }

  async function reconcile(token: number): Promise<void> {
    if (!isCurrent(token)) return
    if (sessionAtOpen !== options.sessionId()) {
      close()
      return
    }
    const result = await options.client.readGoal(
      goalId !== undefined
        ? { goalId }
        : sessionAtOpen === undefined
          ? undefined
          : { sessionId: sessionAtOpen }
    )
    if (!isCurrent(token)) return
    if (!result.ok) throw new Error(result.error.message)
    applyGoal(result.value)
    if (result.value.kind === "product.goal.no-session") {
      rejectAndClose(token, result.value.message)
      return
    }
    if (goal === undefined) {
      showCreationForm(token, false)
      return
    }
    showReview(token, { goal })
  }

  function showCreationForm(token: number, reset: boolean): void {
    if (reset || form === undefined) {
      form = new TuiStructuredFormOverlay({
        tui: options.tui,
        theme: options.editorTheme,
        title: "Create Goal",
        fields: goalFields(),
        terminalRows: options.terminalRows,
        onCancel: close,
        onComplete: (values) => showStartConfirmation(values, token)
      })
    }
    showOverlay(form, token)
  }

  function showStartConfirmation(
    values: Readonly<Record<GoalFieldName, string>>,
    token: number
  ): void {
    let request: StartGoalRequest
    try {
      request = goalRequest(values, sessionAtOpen)
    } catch (error) {
      options.rejected(safeErrorMessage(error))
      showCreationForm(token, false)
      return
    }
    showOverlay(
      new TuiConfirmationOverlay({
        title: "Start Goal?",
        details: [
          request.objective,
          `${request.successCriteria.length} success criteria`,
          `Stop after ${request.stopPolicy?.maxAttempts ?? 8} attempts or ${request.stopPolicy?.maxConsecutiveBlockedAttempts ?? 2} blocked attempts in a row`
        ],
        theme: options.selectTheme,
        confirmLabel: "Start Goal",
        onCancel: () => showCreationForm(token, false),
        onConfirm: () => void startGoal(request, token)
      }),
      token
    )
  }

  async function startGoal(
    request: StartGoalRequest,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.startGoal(request)
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(result.error.message)
          showCreationForm(token, false)
          return
        }
        goal = result.value
        goalId = result.value.goalId
        form = undefined
        options.accepted("Goal started")
        showReview(token, { goal })
        await options.refreshCanonical()
      } catch (error) {
        options.rejected(safeErrorMessage(error))
        if (isCurrent(token)) showCreationForm(token, false)
      }
    })
  }

  function handleAction(action: TuiGoalAction, token: number): void {
    if (!isCurrent(token)) return
    if (action === "close") {
      close()
      return
    }
    if (action === "start-new") {
      goal = undefined
      goalId = undefined
      showCreationForm(token, true)
      return
    }
    showControlConfirmation(action, token)
  }

  function showControlConfirmation(
    action: "pause" | "resume" | "cancel",
    token: number
  ): void {
    const current = goal
    if (current === undefined) return
    const label =
      action === "pause" ? "Pause" : action === "resume" ? "Resume" : "Cancel"
    showOverlay(
      new TuiConfirmationOverlay({
        title: `${label} Goal?`,
        details: [
          current.objective,
          `Revision ${current.revision}`,
          action === "cancel"
            ? "Cancellation stops future Goal attempts."
            : `${label} changes the current Goal state.`
        ],
        theme: options.selectTheme,
        confirmLabel: `${label} Goal`,
        onCancel: () => showReview(token, { goal: current }),
        onConfirm: () => void controlGoal(action, current, token)
      }),
      token
    )
  }

  async function controlGoal(
    action: "pause" | "resume" | "cancel",
    current: GoalReadModel,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      const request = {
        goalId: current.goalId,
        expectedRevision: current.revision
      }
      const result =
        action === "pause"
          ? await options.client.pauseGoal({
              ...request,
              reason: "paused by user in TUI"
            })
          : action === "resume"
            ? await options.client.resumeGoal({
                ...request,
                reason: "resumed by user in TUI"
              })
            : await options.client.cancelGoal({
                ...request,
                reason: "cancelled by user in TUI"
              })
      if (!isCurrent(token)) return
      if (!result.ok) {
        options.rejected(result.error.message)
        await reconcile(token)
        return
      }
      goal = result.value
      goalId = result.value.goalId
      options.accepted(
        `Goal ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "cancellation requested"}`
      )
      showReview(token, { goal })
      await options.refreshCanonical()
    })
  }

  function showReview(
    token: number,
    view: { readonly loading?: boolean; readonly goal?: GoalReadModel }
  ): void {
    showOverlay(
      new TuiGoalReviewOverlay({
        ...(view.loading === undefined ? {} : { loading: view.loading }),
        ...(view.goal === undefined ? {} : { goal: view.goal }),
        actions: goalActions(view.goal),
        terminalRows: options.terminalRows,
        theme: options.selectTheme,
        onAction: (action) => handleAction(action, token),
        onCancel: close
      }),
      token
    )
  }

  function showOverlay(
    component: Parameters<TUI["showOverlay"]>[0],
    token: number
  ): void {
    if (!isCurrent(token)) return
    hideOverlay()
    overlay = options.tui.showOverlay(component, {
      width: "88%",
      minWidth: 40,
      maxHeight: "82%",
      margin: 1
    })
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }

  function close(): void {
    hideOverlay()
    active = false
    workflow += 1
    form = undefined
  }

  function rejectAndClose(token: number, message: string): void {
    if (!isCurrent(token)) return
    close()
    options.rejected(message)
  }

  function isCurrent(token: number): boolean {
    return active && workflow === token
  }

  function applyGoal(result: ReadGoalResult): void {
    if (result.kind === "product.goal.found") {
      goal = result.goal
      goalId = result.goal.goalId
      return
    }
    goal = undefined
    goalId = undefined
  }
}

function goalFields(): readonly TuiStructuredFormField<GoalFieldName>[] {
  return [
    {
      name: "objective",
      label: "Objective",
      description: "Describe the durable outcome this Goal should achieve.",
      validate: requiredText("objective", MAX_GOAL_TEXT_BYTES)
    },
    {
      name: "successCriteria",
      label: "Success criteria",
      description: "Enter one independently verifiable criterion per line.",
      validate(value) {
        const items = textList(value)
        if (items.length === 0) return "at least one success criterion is required"
        return oversizedItem(items, "success criterion")
      }
    },
    {
      name: "boundaries",
      label: "Boundaries",
      description: "Optional scope boundaries, one per line.",
      validate: optionalList("boundary")
    },
    {
      name: "constraints",
      label: "Constraints",
      description: "Optional non-negotiable constraints, one per line.",
      validate: optionalList("constraint")
    },
    {
      name: "maxAttempts",
      label: "Maximum attempts",
      initialValue: "8",
      validate: positiveAttemptLimit("maximum attempts")
    },
    {
      name: "maxBlockedAttempts",
      label: "Blocked-attempt limit",
      initialValue: "2",
      validate(value, values) {
        const error = positiveAttemptLimit("blocked-attempt limit")(value, values)
        if (error !== undefined) return error
        if (Number(value) > Number(values.maxAttempts)) {
          return "blocked-attempt limit cannot exceed maximum attempts"
        }
        return undefined
      }
    }
  ]
}

function goalRequest(
  values: Readonly<Record<GoalFieldName, string>>,
  sessionId: string | undefined
): StartGoalRequest {
  const objective = values.objective.trim()
  const successCriteria = textList(values.successCriteria)
  const boundaries = textList(values.boundaries)
  const constraints = textList(values.constraints)
  const maxAttempts = attemptLimit(values.maxAttempts, "maximum attempts")
  const maxConsecutiveBlockedAttempts = attemptLimit(
    values.maxBlockedAttempts,
    "blocked-attempt limit"
  )
  if (utf8Bytes(objective) === 0) throw new Error("objective is required")
  if (utf8Bytes(objective) > MAX_GOAL_TEXT_BYTES) throw new Error("objective is too long")
  if (successCriteria.length === 0) {
    throw new Error("at least one success criterion is required")
  }
  const itemError =
    oversizedItem(successCriteria, "success criterion") ??
    oversizedItem(boundaries, "boundary") ??
    oversizedItem(constraints, "constraint")
  if (itemError !== undefined) throw new Error(itemError)
  if (maxConsecutiveBlockedAttempts > maxAttempts) {
    throw new Error("blocked-attempt limit cannot exceed maximum attempts")
  }
  return {
    ...(sessionId === undefined ? {} : { sessionId }),
    objective,
    successCriteria,
    boundaries,
    constraints,
    stopPolicy: { maxAttempts, maxConsecutiveBlockedAttempts }
  }
}

function goalActions(
  goal: GoalReadModel | undefined
): readonly { readonly value: TuiGoalAction; readonly label: string }[] {
  if (goal === undefined) return [{ value: "close", label: "Close" }]
  const actions: { value: TuiGoalAction; label: string }[] = []
  if (goal.canPause) actions.push({ value: "pause", label: "Pause Goal" })
  if (goal.canResume) actions.push({ value: "resume", label: "Resume Goal" })
  if (goal.canCancel) actions.push({ value: "cancel", label: "Cancel Goal" })
  if (TERMINAL_GOAL_STATES.has(goal.state)) {
    actions.push({ value: "start-new", label: "Start new Goal" })
  }
  actions.push({ value: "close", label: "Close" })
  return actions
}

function requiredText(
  label: string,
  maxBytes: number
): (value: string) => string | undefined {
  return (value) => {
    const normalized = value.trim()
    if (normalized.length === 0) return `${label} is required`
    return utf8Bytes(normalized) > maxBytes ? `${label} is too long` : undefined
  }
}

function optionalList(label: string): (value: string) => string | undefined {
  return (value) => oversizedItem(textList(value), label)
}

function oversizedItem(items: readonly string[], label: string): string | undefined {
  return items.some((item) => utf8Bytes(item) > MAX_GOAL_ITEM_BYTES)
    ? `${label} exceeds ${MAX_GOAL_ITEM_BYTES} bytes`
    : undefined
}

function textList(value: string): readonly string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function positiveAttemptLimit(
  label: string
): (
  value: string,
  values: Readonly<Record<GoalFieldName, string>>
) => string | undefined {
  return (value) => {
    try {
      attemptLimit(value, label)
      return undefined
    } catch (error) {
      return safeErrorMessage(error)
    }
  }
}

function attemptLimit(value: string, label: string): number {
  const normalized = value.trim()
  if (!/^[1-9]\d*$/u.test(normalized)) {
    throw new Error(`${label} must be a positive integer`)
  }
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed > MAX_GOAL_ATTEMPT_LIMIT) {
    throw new Error(`${label} must not exceed ${MAX_GOAL_ATTEMPT_LIMIT}`)
  }
  return parsed
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
