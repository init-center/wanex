import type {
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react"
import type { ScheduleDefinitionSummary } from "@wanex/product"
import { classes } from "../classes.js"

export function ScheduleRemoveDialog({
  schedule,
  busy,
  error,
  initialFocus,
  confirm,
  cancel,
}: {
  readonly schedule: ScheduleDefinitionSummary
  readonly busy: boolean
  readonly error: string | undefined
  readonly initialFocus: RefObject<HTMLButtonElement | null>
  readonly confirm: () => Promise<void>
  readonly cancel: () => void
}): ReactNode {
  const title = schedule.title ?? "this schedule"
  return (
    <div
      className={classes("settings-subdialog-layer")}
      data-ui-settings-subdialog
      onKeyDown={(event) => handleEscape(event, busy, cancel)}
    >
      <section
        className={classes("schedule-remove-dialog")}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="schedule-remove-title"
        aria-describedby="schedule-remove-description"
        data-ui-schedule-remove-dialog
      >
        <h3 id="schedule-remove-title">Remove {title}?</h3>
        <p id="schedule-remove-description">
          It will stop running and cannot be restored.
        </p>
        {error === undefined ? null : (
          <p className={classes("settings-error")} role="alert" data-ui-schedule-remove-error>
            {error}
          </p>
        )}
        <footer>
          <button ref={initialFocus} type="button" disabled={busy} onClick={cancel}>
            Keep schedule
          </button>
          <button
            type="button"
            className={classes("danger-action")}
            disabled={busy}
            onClick={() => void confirm()}
            data-ui-schedule-remove-confirm
          >
            Remove schedule
          </button>
        </footer>
      </section>
    </div>
  )
}

function handleEscape(
  event: KeyboardEvent<HTMLDivElement>,
  busy: boolean,
  cancel: () => void,
): void {
  if (event.key !== "Escape" || busy) return
  event.preventDefault()
  event.stopPropagation()
  cancel()
}
