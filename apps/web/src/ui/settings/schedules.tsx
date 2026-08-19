import {
  CalendarClock,
  Check,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react"
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import type {
  ActionResult,
  ScheduleSettingsViewModel,
  Snapshot,
} from "../../application/model.js"
import {
  formatScheduleNextRun,
  formatScheduleOutcome,
  formatScheduleTrigger,
} from "../../application/schedule/projection.js"
import type {
  ScheduleDefinitionInput,
  ScheduleMutationResult,
  ScheduleDefinition,
  ScheduleDefinitionSummary,
  ScheduleSessionPolicy,
  ScheduleTrigger,
} from "@wanex/product"
import type { DispatchActionResult } from "../shared/action.js"
import { classes } from "../classes.js"
import { ScheduleRemoveDialog } from "./schedule-dialogs.js"

type TriggerKind = ScheduleTrigger["kind"]
type IntervalUnit = "seconds" | "minutes" | "hours" | "days"
type SessionMode = ScheduleSessionPolicy["kind"]
type ModelMode = "active" | "pinned"

interface ScheduleFormState {
  readonly scheduleId?: string
  readonly revision?: number
  readonly createIdempotencyKey?: string
  readonly title: string
  readonly prompt: string
  readonly triggerKind: TriggerKind
  readonly onceAt: string
  readonly intervalAnchorAt: string
  readonly intervalValue: string
  readonly intervalUnit: IntervalUnit
  readonly cronExpression: string
  readonly timeZone: string
  readonly sessionMode: SessionMode
  readonly reuseSessionId: string
  readonly modelMode: ModelMode
  readonly pinnedEndpointId: string
  readonly misfirePolicy: "fire_once" | "skip"
  readonly enabled: boolean
}

export function SchedulesSection({
  scheduleSettings,
  snapshot,
  dispatch,
}: {
  readonly scheduleSettings: ScheduleSettingsViewModel
  readonly snapshot: Snapshot
  readonly dispatch: DispatchActionResult
}): ReactNode {
  const [form, setForm] = useState<ScheduleFormState>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [removeTarget, setRemoveTarget] = useState<ScheduleDefinitionSummary>()
  const removeTrigger = useRef<HTMLButtonElement | null>(null)
  const removeFocus = useRef<HTMLButtonElement | null>(null)
  const endpoints = useMemo(
    () => snapshot.view.settings.profile.endpoints.filter(
      (endpoint) => endpoint.model.operations.includes("conversation"),
    ),
    [snapshot.view.settings.profile.endpoints],
  )
  const currentSessionId = snapshot.conversation.sessionId

  useEffect(() => {
    if (removeTarget === undefined) return
    const frame = requestAnimationFrame(() => removeFocus.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [removeTarget])

  function beginCreate(): void {
    clearFeedback()
    setForm(createForm({
      currentSessionId,
      activeEndpointId: snapshot.view.settings.profile.activeModelEndpointId,
    }))
  }

  async function beginEdit(scheduleId: string): Promise<void> {
    if (busy) return
    setBusy(true)
    clearFeedback()
    const result = await dispatch({
      type: "read-schedule",
      input: { scheduleId },
    })
    setBusy(false)
    const value = scheduleOutput(result, "read-schedule")
    if (value?.kind === "product.schedule.found") {
      setForm(formFromDefinition(value.definition))
      return
    }
    setError(result?.ok === false ? result.message : scheduleReadMessage(value))
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (form === undefined || busy) return
    setBusy(true)
    clearFeedback()
    try {
      const definition = definitionFromForm(form)
      const result = form.scheduleId === undefined
        ? await dispatch({
            type: "create-schedule",
            input: {
              definition,
              idempotencyKey: requiredCreateIdempotencyKey(form),
            },
          })
        : await dispatch({
            type: "replace-schedule",
            input: {
              scheduleId: form.scheduleId,
              expectedRevision: requiredRevision(form),
              definition: {
                ...definition,
                enabled: form.enabled,
              },
            },
          })
      if (result?.ok !== true) {
        setError(result?.message ?? "Schedule could not be saved")
        return
      }
      setForm(undefined)
      setStatus(form.scheduleId === undefined ? "Schedule created" : "Schedule updated")
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function setEnabled(
    scheduleId: string,
    revision: number,
    enabled: boolean,
  ): Promise<void> {
    if (busy) return
    setBusy(true)
    clearFeedback()
    const result = await dispatch({
      type: "set-schedule-enabled",
      input: { scheduleId, expectedRevision: revision, enabled },
    })
    setBusy(false)
    if (result?.ok === true) {
      setStatus(enabled ? "Schedule enabled" : "Schedule disabled")
    } else {
      setError(result?.message ?? "Schedule state could not be changed")
    }
  }

  async function remove(
    scheduleId: string,
    revision: number,
  ): Promise<void> {
    if (busy) return
    setBusy(true)
    clearFeedback()
    const result = await dispatch({
      type: "remove-schedule",
      input: { scheduleId, expectedRevision: revision },
    })
    setBusy(false)
    if (result?.ok === true) {
      if (form?.scheduleId === scheduleId) setForm(undefined)
      setRemoveTarget(undefined)
      setStatus("Schedule removed")
    } else {
      setError(result?.message ?? "Schedule could not be removed")
    }
  }

  function beginRemove(
    schedule: ScheduleDefinitionSummary,
    trigger: HTMLButtonElement,
  ): void {
    removeTrigger.current = trigger
    setRemoveTarget(schedule)
    clearFeedback()
  }

  function cancelRemove(): void {
    setRemoveTarget(undefined)
    requestAnimationFrame(() => removeTrigger.current?.focus())
  }

  function clearFeedback(): void {
    setError(undefined)
    setStatus(undefined)
  }

  return (
    <section className={classes("settings-section schedule-section")} data-ui-schedule-settings>
      <div className={classes("settings-heading schedule-heading")}>
        <div><CalendarClock size={15} /><strong>Schedules</strong></div>
        {scheduleSettings.state === "ready" &&
        scheduleSettings.availability?.capabilities.canCreate ? (
          <button
            type="button"
            className={classes("schedule-add")}
            disabled={busy || form !== undefined}
            onClick={beginCreate}
            data-ui-schedule-create
          >
            <Plus size={14} /> Add schedule
          </button>
        ) : null}
      </div>

      {scheduleSettings.state === "failed" ? (
        <p className={classes("settings-error")} role="alert" data-ui-schedule-error>
          {scheduleSettings.message ?? "Schedules could not be loaded"}
        </p>
      ) : scheduleSettings.state === "unavailable" ? (
        <p className={classes("muted")} data-ui-schedule-unavailable>
          {scheduleSettings.message ?? "Schedules are unavailable"}
        </p>
      ) : scheduleSettings.schedules.length === 0 && form === undefined ? (
        <p className={classes("muted schedule-empty")} data-ui-schedule-empty>
          Add a schedule to run a prompt automatically.
        </p>
      ) : null}

      {scheduleSettings.state === "ready" && scheduleSettings.schedules.length > 0 ? (
        <ul className={classes("schedule-list")} aria-label="Schedules" data-ui-schedule-list>
          {scheduleSettings.schedules.map((schedule) => (
            <li key={schedule.scheduleId} className={classes("schedule-row")} data-ui-schedule={schedule.scheduleId}>
              <div className={classes("schedule-summary")}>
                <div className={classes("schedule-title-line")}>
                  <strong>{schedule.title ?? "Untitled schedule"}</strong>
                  <span className={classes(`schedule-state schedule-state-${schedule.status.state}`)}>{scheduleStatusLabel(schedule.status.state)}</span>
                </div>
                <span>{formatScheduleTrigger(schedule.trigger)}</span>
                <small>{formatScheduleNextRun(schedule.status)} · {formatScheduleOutcome(schedule)}</small>
              </div>
              <div className={classes("schedule-controls")}>
                {scheduleSettings.availability?.capabilities.canSetEnabled ? (
                  <button
                    type="button"
                    className={classes("icon-button")}
                    disabled={busy}
                    onClick={() => void setEnabled(schedule.scheduleId, schedule.revision, !schedule.enabled)}
                    aria-label={schedule.enabled ? `Disable ${schedule.title ?? "schedule"}` : `Enable ${schedule.title ?? "schedule"}`}
                    title={schedule.enabled ? "Disable schedule" : "Enable schedule"}
                    data-ui-schedule-toggle={schedule.scheduleId}
                  >
                    <Power size={14} />
                  </button>
                ) : null}
                {scheduleSettings.availability?.capabilities.canEdit ? (
                  <button
                    type="button"
                    className={classes("icon-button")}
                    disabled={busy}
                    onClick={() => void beginEdit(schedule.scheduleId)}
                    aria-label={`Edit ${schedule.title ?? "schedule"}`}
                    title="Edit schedule"
                    data-ui-schedule-edit={schedule.scheduleId}
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
                {scheduleSettings.availability?.capabilities.canRemove ? (
                  <button
                    type="button"
                    className={classes("icon-button danger-icon")}
                    disabled={busy}
                    onClick={(event) => beginRemove(schedule, event.currentTarget)}
                    aria-label={`Remove ${schedule.title ?? "schedule"}`}
                    title="Remove schedule"
                    data-ui-schedule-remove={schedule.scheduleId}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {form === undefined ? null : (
        <ScheduleForm
          form={form}
          endpoints={endpoints}
          currentSessionId={currentSessionId}
          busy={busy}
          save={save}
          setForm={setForm}
          cancel={() => {
            setForm(undefined)
            clearFeedback()
          }}
        />
      )}

      {error === undefined || removeTarget !== undefined ? null : <p className={classes("settings-error")} role="alert" data-ui-schedule-feedback>{error}</p>}
      {status === undefined ? null : <p className={classes("success")} role="status" data-ui-schedule-status>{status}</p>}
      {removeTarget === undefined ? null : (
        <ScheduleRemoveDialog
          schedule={removeTarget}
          busy={busy}
          error={error}
          initialFocus={removeFocus}
          confirm={() => remove(removeTarget.scheduleId, removeTarget.revision)}
          cancel={cancelRemove}
        />
      )}
    </section>
  )
}

function ScheduleForm({
  form,
  endpoints,
  currentSessionId,
  busy,
  save,
  setForm,
  cancel,
}: {
  readonly form: ScheduleFormState
  readonly endpoints: Snapshot["view"]["settings"]["profile"]["endpoints"]
  readonly currentSessionId: string | undefined
  readonly busy: boolean
  readonly save: (event: FormEvent<HTMLFormElement>) => Promise<void>
  readonly setForm: (form: ScheduleFormState) => void
  readonly cancel: () => void
}): ReactNode {
  const update = <K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ): void => setForm({ ...form, [key]: value })
  return (
    <form className={classes("schedule-form")} data-ui-schedule-form onSubmit={(event) => void save(event)}>
      <div className={classes("schedule-form-heading")}>
        <strong>{form.scheduleId === undefined ? "New schedule" : "Edit schedule"}</strong>
        <button type="button" className={classes("icon-button")} onClick={cancel} aria-label="Close schedule form" title="Close schedule form">
          <X size={15} />
        </button>
      </div>
      <label>
        <span>Name</span>
        <input name="title" value={form.title} maxLength={200} onChange={(event) => update("title", event.target.value)} placeholder="Optional" />
      </label>
      <label className={classes("schedule-form-wide")}>
        <span>Prompt</span>
        <textarea name="prompt" value={form.prompt} required maxLength={65_536} rows={3} onChange={(event) => update("prompt", event.target.value)} placeholder="What should run?" />
      </label>
      <label>
        <span>Trigger</span>
        <select name="triggerKind" value={form.triggerKind} onChange={(event) => update("triggerKind", event.target.value as TriggerKind)}>
          <option value="once">Once</option>
          <option value="interval">Interval</option>
          <option value="cron">Cron</option>
        </select>
      </label>
      {form.triggerKind === "once" ? (
        <label><span>Run at</span><input name="onceAt" type="datetime-local" required value={form.onceAt} onChange={(event) => update("onceAt", event.target.value)} /></label>
      ) : form.triggerKind === "interval" ? (
        <>
          <label><span>Start at</span><input name="intervalAnchorAt" type="datetime-local" required value={form.intervalAnchorAt} onChange={(event) => update("intervalAnchorAt", event.target.value)} /></label>
          <label><span>Repeat</span><span className={classes("schedule-inline-field")}><input name="intervalValue" type="number" min={1} required value={form.intervalValue} onChange={(event) => update("intervalValue", event.target.value)} /><select name="intervalUnit" value={form.intervalUnit} onChange={(event) => update("intervalUnit", event.target.value as IntervalUnit)}><option value="seconds">seconds</option><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></span></label>
        </>
      ) : (
        <>
          <label><span>Cron expression</span><input name="cronExpression" required maxLength={256} value={form.cronExpression} onChange={(event) => update("cronExpression", event.target.value)} placeholder="0 9 * * 1-5" /></label>
          <label><span>Time zone</span><input name="timeZone" required maxLength={128} value={form.timeZone} onChange={(event) => update("timeZone", event.target.value)} /></label>
        </>
      )}
      <label>
        <span>Session</span>
        <select name="sessionMode" value={form.sessionMode} onChange={(event) => {
          const mode = event.target.value as SessionMode
          setForm({
            ...form,
            sessionMode: mode,
            ...(mode === "reuse" && form.reuseSessionId.length === 0 && currentSessionId !== undefined
              ? { reuseSessionId: currentSessionId }
              : {}),
          })
        }}>
          <option value="isolated">New session</option>
          {currentSessionId !== undefined || form.reuseSessionId.length > 0 ? (
            <option value="reuse">
              {form.scheduleId === undefined ? "Current conversation" : "Linked conversation"}
            </option>
          ) : null}
        </select>
      </label>
      <div />
      <label>
        <span>Model</span>
        <select name="modelMode" value={form.modelMode === "active" ? "active" : `pinned:${form.pinnedEndpointId}`} onChange={(event) => {
          const value = event.target.value
          if (value === "active") setForm({ ...form, modelMode: "active" })
          else setForm({ ...form, modelMode: "pinned", pinnedEndpointId: value.slice("pinned:".length) })
        }}>
          <option value="active">Active model</option>
          {form.modelMode === "pinned" && !endpoints.some(
            (endpoint) => endpoint.id === form.pinnedEndpointId,
          ) ? <option value={`pinned:${form.pinnedEndpointId}`}>Configured model (unavailable)</option> : null}
          {endpoints.map((endpoint) => <option key={endpoint.id} value={`pinned:${endpoint.id}`}>{endpoint.model.id}</option>)}
        </select>
      </label>
      <label>
        <span>If missed</span>
        <select name="misfirePolicy" value={form.misfirePolicy} onChange={(event) => update("misfirePolicy", event.target.value as ScheduleFormState["misfirePolicy"])}>
          <option value="fire_once">Run once after reconnect</option>
          <option value="skip">Skip missed run</option>
        </select>
      </label>
      <label className={classes("checkbox schedule-form-wide")}><input name="enabled" type="checkbox" checked={form.enabled} onChange={(event) => update("enabled", event.target.checked)} /><span>Enabled</span></label>
      <div className={classes("inline-actions schedule-form-wide")}>
        <button type="submit" disabled={busy}><Check size={14} /> {form.scheduleId === undefined ? "Create schedule" : "Save changes"}</button>
        <button type="button" disabled={busy} onClick={cancel}>Cancel</button>
      </div>
    </form>
  )
}

function createForm(request: {
  readonly currentSessionId: string | undefined
  readonly activeEndpointId: string | undefined
}): ScheduleFormState {
  const now = Date.now() + 5 * 60_000
  return {
    createIdempotencyKey: createRequestId(),
    title: "",
    prompt: "",
    triggerKind: "interval",
    onceAt: timestampToInput(now),
    intervalAnchorAt: timestampToInput(now),
    intervalValue: "1",
    intervalUnit: "hours",
    cronExpression: "0 9 * * 1-5",
    timeZone: localTimeZone(),
    sessionMode: "isolated",
    reuseSessionId: request.currentSessionId ?? "",
    modelMode: "active",
    pinnedEndpointId: request.activeEndpointId ?? "",
    misfirePolicy: "skip",
    enabled: true,
  }
}

function formFromDefinition(definition: ScheduleDefinition): ScheduleFormState {
  const trigger = definition.trigger
  const interval = trigger.kind === "interval" ? intervalFields(trigger.intervalMs) : undefined
  return {
    scheduleId: definition.scheduleId,
    revision: definition.revision,
    title: definition.title ?? "",
    prompt: definition.prompt,
    triggerKind: trigger.kind,
    onceAt: trigger.kind === "once" ? timestampToInput(trigger.at) : timestampToInput(Date.now() + 300_000),
    intervalAnchorAt: trigger.kind === "interval" ? timestampToInput(trigger.anchorAt) : timestampToInput(Date.now() + 300_000),
    intervalValue: interval?.value ?? "1",
    intervalUnit: interval?.unit ?? "hours",
    cronExpression: trigger.kind === "cron" ? trigger.expression : "0 9 * * 1-5",
    timeZone: trigger.kind === "cron" ? trigger.timeZone : localTimeZone(),
    sessionMode: definition.sessionPolicy.kind,
    reuseSessionId: definition.sessionPolicy.kind === "reuse" ? definition.sessionPolicy.sessionId : "",
    modelMode: definition.modelPolicy.kind,
    pinnedEndpointId: definition.modelPolicy.kind === "pinned" ? definition.modelPolicy.endpointId : "",
    misfirePolicy: definition.misfirePolicy,
    enabled: definition.enabled,
  }
}

function definitionFromForm(form: ScheduleFormState): ScheduleDefinitionInput {
  const trigger = form.triggerKind === "once"
    ? { kind: "once" as const, at: inputToTimestamp(form.onceAt) }
    : form.triggerKind === "interval"
      ? { kind: "interval" as const, anchorAt: inputToTimestamp(form.intervalAnchorAt), intervalMs: intervalMilliseconds(form.intervalValue, form.intervalUnit) }
      : { kind: "cron" as const, expression: form.cronExpression.trim(), timeZone: form.timeZone.trim() }
  return {
    ...(form.title.trim().length === 0 ? {} : { title: form.title.trim() }),
    prompt: form.prompt.trim(),
    enabled: form.enabled,
    trigger,
    sessionPolicy: form.sessionMode === "reuse"
      ? { kind: "reuse", sessionId: form.reuseSessionId }
      : { kind: "isolated" },
    modelPolicy: form.modelMode === "pinned"
      ? { kind: "pinned", endpointId: form.pinnedEndpointId }
      : { kind: "active" },
    misfirePolicy: form.misfirePolicy,
  }
}

function intervalFields(intervalMs: number): { readonly value: string; readonly unit: IntervalUnit } {
  if (intervalMs % 86_400_000 === 0) return { value: String(intervalMs / 86_400_000), unit: "days" }
  if (intervalMs % 3_600_000 === 0) return { value: String(intervalMs / 3_600_000), unit: "hours" }
  if (intervalMs % 60_000 === 0) return { value: String(intervalMs / 60_000), unit: "minutes" }
  return { value: String(Math.max(1, Math.round(intervalMs / 1_000))), unit: "seconds" }
}

function intervalMilliseconds(value: string, unit: IntervalUnit): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("Repeat interval must be a positive whole number")
  const multiplier: Record<IntervalUnit, number> = {
    seconds: 1_000,
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  }
  const milliseconds = amount * multiplier[unit]
  if (!Number.isSafeInteger(milliseconds)) throw new Error("Repeat interval is too large")
  return milliseconds
}

function requiredRevision(form: ScheduleFormState): number {
  if (form.revision === undefined) throw new Error("Schedule revision is missing; reload the schedule")
  return form.revision
}

function requiredCreateIdempotencyKey(form: ScheduleFormState): string {
  if (form.createIdempotencyKey === undefined) {
    throw new Error("Schedule create identity is missing; reopen the form")
  }
  return form.createIdempotencyKey
}

function scheduleOutput(
  result: ActionResult | undefined,
  action: ActionResult["action"],
): ScheduleMutationResult | Extract<NonNullable<ActionResult["output"]>, { readonly kind: "web.schedule-action" }>["result"] | undefined {
  return result?.output?.kind === "web.schedule-action" && result.output.action === action
    ? result.output.result
    : undefined
}

function scheduleReadMessage(value: ReturnType<typeof scheduleOutput>): string {
  if (value?.kind === "product.schedule.missing") return "Schedule no longer exists"
  if (value?.kind === "product.schedule.unavailable") return "Schedules are unavailable"
  return "Schedule could not be loaded"
}

function scheduleStatusLabel(state: string): string {
  return state === "scheduled" ? "Next" : state.charAt(0).toUpperCase() + state.slice(1)
}

function timestampToInput(value: number): string {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function inputToTimestamp(value: string): number {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) throw new Error("Choose a valid date and time")
  return timestamp
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

function createRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID
  if (randomUuid === undefined) throw new Error("The browser client requires crypto.randomUUID")
  return randomUuid.call(globalThis.crypto)
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Schedule request failed"
}
