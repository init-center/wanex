import type {
  EditorTheme,
  OverlayHandle,
  SelectListTheme,
  TUI
} from "@earendil-works/pi-tui"
import type {
  ReadSideQueryResult,
  SideQueryReadModel
} from "@wanex/assistant"
import type { SurfaceEvent } from "@wanex/assistant/surface"
import {
  TuiStructuredFormOverlay,
  type TuiStructuredFormField
} from "./structured-form.js"
import {
  TuiSideQueryReviewOverlay,
  type TuiSideQueryAction
} from "./side-query-components.js"
import type { TuiSideQueryClient } from "./types.js"

const MAX_SIDE_QUERY_QUESTION_CHARACTERS = 16_384

export interface TuiSideQuery {
  open(): void
  close(): void
  isOpen(): boolean
  handleInvalidation(event: SurfaceEvent): void
  reconcileActive(): Promise<void>
  resetSession(sessionId: string | undefined): void
}

export function createTuiSideQuery(options: {
  readonly tui: TUI
  readonly terminalRows: () => number
  readonly editorTheme: EditorTheme
  readonly selectTheme: SelectListTheme
  readonly client: TuiSideQueryClient
  readonly canOpen: () => boolean
  readonly sessionId: () => string | undefined
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiSideQuery {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let query: SideQueryReadModel | undefined
  let queryId: string | undefined
  let currentSession = options.sessionId()
  let form: TuiStructuredFormOverlay<"question"> | undefined
  let reconcileTail = Promise.resolve()

  return {
    open() {
      if (!options.canOpen() || active) return
      active = true
      const token = ++workflow
      if (queryId === undefined) {
        showQuestionForm(token, false)
        return
      }
      showReview(token, { loading: true })
      void reconcile(token).catch(() =>
        rejectAndClose(token, sideQueryFailureMessage("read"))
      )
    },
    close,
    isOpen: () => active,
    handleInvalidation(event) {
      if (
        event.type !== "assistant.surface.side-query.invalidated" ||
        event.sideQuery === undefined ||
        event.sideQuery.queryId !== queryId
      ) {
        return
      }
      if (active) enqueueReconcile()
    },
    async reconcileActive() {
      if (!active || queryId === undefined) return
      enqueueReconcile()
      await reconcileTail
    },
    resetSession(sessionId) {
      if (currentSession === sessionId) return
      currentSession = sessionId
      if (active) close()
    }
  }

  function enqueueReconcile(): void {
    const token = workflow
    reconcileTail = reconcileTail
      .then(async () => await reconcile(token))
      .catch(() => {
        if (isCurrent(token)) {
          rejectAndClose(token, sideQueryFailureMessage("read"))
        }
      })
  }

  async function reconcile(token: number): Promise<void> {
    if (!isCurrent(token) || queryId === undefined) return
    const result = await options.client.readSideQuery({ queryId })
    if (!isCurrent(token)) return
    if (!result.ok) throw new Error(sideQueryFailureMessage("read"))
    applyQuery(result.value)
    if (query === undefined) {
      showQuestionForm(token, true)
      return
    }
    showReview(token, { query })
  }

  function showQuestionForm(token: number, reset: boolean): void {
    if (reset || form === undefined) {
      form = new TuiStructuredFormOverlay({
        tui: options.tui,
        theme: options.editorTheme,
        title: "Side Query",
        fields: questionFields(),
        terminalRows: options.terminalRows,
        onCancel: close,
        onComplete: (values) => void startQuery(values.question, token)
      })
    }
    showOverlay(form, token)
  }

  async function startQuery(question: string, token: number): Promise<void> {
    const retained = query
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.startSideQuery({
          question: question.trim()
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(sideQueryFailureMessage("start"))
          if (retained === undefined) showQuestionForm(token, false)
          else {
            query = retained
            queryId = retained.queryId
            showReview(token, { query: retained })
          }
          return
        }
        query = result.value
        queryId = result.value.queryId
        form = undefined
        options.accepted("Side Query started")
        showReview(token, { query: result.value })
      } catch {
        options.rejected(sideQueryFailureMessage("start"))
        if (isCurrent(token)) {
          if (retained === undefined) showQuestionForm(token, false)
          else showReview(token, { query: retained })
        }
      }
    })
  }

  function handleAction(action: TuiSideQueryAction, token: number): void {
    if (!isCurrent(token)) return
    if (action === "close") {
      close()
      return
    }
    if (action === "ask-another") {
      showQuestionForm(token, true)
      return
    }
    if (action === "cancel") {
      void cancelQuery(token)
      return
    }
    void dismissQuery(token)
  }

  async function cancelQuery(token: number): Promise<void> {
    const current = query
    if (current === undefined || current.state !== "running") return
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.cancelSideQuery({
          queryId: current.queryId
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(sideQueryFailureMessage("cancel"))
          await reconcile(token)
          return
        }
        query = result.value
        queryId = result.value.queryId
        options.accepted("Side Query cancelled")
        showReview(token, { query: result.value })
      } catch {
        if (!isCurrent(token)) return
        options.rejected(sideQueryFailureMessage("cancel"))
        showReview(token, { query: current })
      }
    })
  }

  async function dismissQuery(token: number): Promise<void> {
    const current = query
    if (current === undefined || current.state === "running") return
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.dismissSideQuery({
          queryId: current.queryId
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(sideQueryFailureMessage("dismiss"))
          showReview(token, { query: current })
          return
        }
        query = undefined
        queryId = undefined
        form = undefined
        options.accepted("Side Query dismissed")
        close()
      } catch {
        if (!isCurrent(token)) return
        options.rejected(sideQueryFailureMessage("dismiss"))
        showReview(token, { query: current })
      }
    })
  }

  function showReview(
    token: number,
    view: { readonly loading?: boolean; readonly query?: SideQueryReadModel }
  ): void {
    showOverlay(
      new TuiSideQueryReviewOverlay({
        ...(view.loading === undefined ? {} : { loading: view.loading }),
        ...(view.query === undefined ? {} : { query: view.query }),
        ...(view.query === undefined
          ? {}
          : { contextChanged: view.query.sessionId !== options.sessionId() }),
        terminalRows: options.terminalRows,
        actions: sideQueryActions(view.query),
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

  function applyQuery(result: ReadSideQueryResult): void {
    if (result.kind === "assistant.side-query.found") {
      query = result.query
      queryId = result.query.queryId
      return
    }
    if (result.queryId === queryId) {
      query = undefined
      queryId = undefined
    }
  }
}

function questionFields(): readonly TuiStructuredFormField<"question">[] {
  return [
    {
      name: "question",
      label: "Question",
      description: "Ask a temporary question about the selected conversation.",
      validate(value) {
        const question = value.trim()
        if (question.length === 0) return "question is required"
        if (question.length > MAX_SIDE_QUERY_QUESTION_CHARACTERS) {
          return `question must not exceed ${MAX_SIDE_QUERY_QUESTION_CHARACTERS} characters`
        }
        return undefined
      }
    }
  ]
}

function sideQueryFailureMessage(
  action: "start" | "read" | "cancel" | "dismiss"
): string {
  switch (action) {
    case "start":
      return "Unable to start Side Query"
    case "read":
      return "Unable to read Side Query state"
    case "cancel":
      return "Unable to cancel Side Query"
    case "dismiss":
      return "Unable to dismiss Side Query"
  }
}

function sideQueryActions(
  query: SideQueryReadModel | undefined
): readonly {
  readonly value: TuiSideQueryAction
  readonly label: string
}[] {
  if (query === undefined) return [{ value: "close", label: "Close" }]
  if (query.state === "running") {
    return [
      { value: "cancel", label: "Cancel Side Query" },
      { value: "close", label: "Close" }
    ]
  }
  return [
    { value: "ask-another", label: "Ask another" },
    { value: "dismiss", label: "Dismiss" },
    { value: "close", label: "Close" }
  ]
}
