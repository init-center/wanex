import type {
  ReactNode,
  RefObject,
} from "react"
import type { ScheduleDefinitionSummary } from "@wanex/assistant"
import { classes } from "../classes.js"
import { SettingsSubdialog, Title, Description } from "./subdialog.js"

export function ScheduleRemoveDialog({
  schedule,
  busy,
  isBusy,
  error,
  initialFocus,
  returnFocus,
  fallbackFocus,
  confirm,
  cancel,
}: {
  readonly schedule: ScheduleDefinitionSummary
  readonly busy: boolean
  readonly isBusy: () => boolean
  readonly error: string | undefined
  readonly initialFocus: RefObject<HTMLButtonElement | null>
  readonly returnFocus: RefObject<HTMLButtonElement | null>
  readonly fallbackFocus: RefObject<HTMLButtonElement | null>
  readonly confirm: () => Promise<void>
  readonly cancel: () => void
}): ReactNode {
  const title = schedule.title ?? "this schedule"
  return (
    <SettingsSubdialog busy={busy} isBusy={isBusy} initialFocus={initialFocus} returnFocus={returnFocus} fallbackFocus={fallbackFocus} cancel={cancel}>
      <section
        className={classes("schedule-remove-dialog")}
        data-ui-schedule-remove-dialog
      >
        <Title asChild><h3>Remove {title}?</h3></Title>
        <Description asChild><p>
          It will stop running and cannot be restored.
        </p></Description>
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
    </SettingsSubdialog>
  )
}
