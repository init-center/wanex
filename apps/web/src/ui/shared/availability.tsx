import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { classes } from "../classes.js";

export function InitialLoading(): ReactNode {
  return (
    <main
      className={classes("loading")}
      role="status"
      aria-busy="true"
      aria-label="Loading conversation"
      data-ui-availability-state="loading"
    >
      <LoaderCircle size={17} className={classes("is-running")} aria-hidden="true" />
      <span>Loading conversation</span>
    </main>
  );
}

export function InitialUnavailable({
  message,
  retrying,
  retry,
}: {
  readonly message: string;
  readonly retrying: boolean;
  readonly retry: () => void;
}): ReactNode {
  return (
    <main
      className={classes("unavailable")}
      role="alert"
      aria-busy={retrying}
      data-ui-availability-state="unavailable"
    >
      <div className={classes("unavailable-content")}>
        <CircleAlert size={22} aria-hidden="true" />
        <h1>Conversation unavailable</h1>
        <p>{message}</p>
        <button
          type="button"
          className={classes("primary-action")}
          disabled={retrying}
          onClick={retry}
        >
          {retrying
            ? <LoaderCircle size={14} className={classes("is-running")} aria-hidden="true" />
            : <RotateCcw size={14} aria-hidden="true" />}
          {retrying ? "Trying again" : "Try again"}
        </button>
      </div>
    </main>
  );
}

export function AvailabilityNotice({
  message,
  retrying,
  retry,
}: {
  readonly message: string;
  readonly retrying: boolean;
  readonly retry: () => void;
}): ReactNode {
  return (
    <div
      className={classes("availability-notice")}
      role="alert"
      aria-busy={retrying}
      data-ui-availability-state="degraded"
    >
      <span className={classes("availability-icon")} aria-hidden="true">
        <CircleAlert size={15} />
      </span>
      <span className={classes("availability-copy")}>
        <strong>Conversation data could not refresh</strong>
        <span>{message}</span>
      </span>
      <button type="button" disabled={retrying} onClick={retry}>
        {retrying
          ? <LoaderCircle size={13} className={classes("is-running")} aria-hidden="true" />
          : <RotateCcw size={13} aria-hidden="true" />}
        {retrying ? "Retrying" : "Retry"}
      </button>
    </div>
  );
}
