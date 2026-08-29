import {
  CircleAlert,
  LoaderCircle,
  PanelLeft,
  PanelRight,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import { IconButton } from "../shared/icon-button.js";

export function Topbar({
  snapshot,
  streamAvailable,
  streamReconnecting,
  sessionsOpen,
  inactive,
  openSessions,
  reconnectStream,
  toggleContext,
  openSettings,
}: {
  readonly snapshot: Snapshot;
  readonly streamAvailable: boolean;
  readonly streamReconnecting: boolean;
  readonly sessionsOpen: boolean;
  readonly inactive: boolean;
  readonly openSessions: () => void;
  readonly reconnectStream: () => void;
  readonly toggleContext: () => void;
  readonly openSettings: () => void;
}): ReactNode {
  const state = snapshot.view;
  return (
    <header className={classes("topbar")} data-ui-topbar inert={inactive ? true : undefined}>
      <div className={classes("topbar-title")}>
        <button
          type="button"
          className={classes("icon-button mobile-nav-button")}
          data-ui-action="open-conversations"
          aria-label="Open conversations"
          aria-controls="conversation-navigation"
          aria-expanded={sessionsOpen}
          onClick={openSessions}
        >
          <PanelLeft size={17} />
        </button>
        <h1 data-ui-selected-session-title>
          {state.title}
        </h1>
      </div>
      <div className={classes("top-actions")}>
        <IconButton label="Toggle context panel" onClick={toggleContext}>
          <PanelRight size={17} />
        </IconButton>
        <IconButton label="Open settings" qa="open-settings" onClick={openSettings}>
          <SlidersHorizontal size={17} />
        </IconButton>
        <span
          className={classes(`readiness readiness-${state.providerRunGate.state}`)}
          data-ui-provider-state={state.providerRunGate.state}
          title={state.providerRunGate.message}
        >
          <span className={classes("status-dot")} aria-hidden="true" />
          <span>{statusLabel(state.providerRunGate.state)}</span>
        </span>
        {streamAvailable ? null : (
          <button
            type="button"
            className={classes("stream-state")}
            data-ui-action="reconnect-live-updates"
            disabled={streamReconnecting}
            onClick={reconnectStream}
            aria-label="Reconnect live updates"
            title="Reconnect live updates"
          >
            {streamReconnecting
              ? <LoaderCircle size={13} className={classes("is-running")} />
              : <CircleAlert size={13} />}
            <span>{streamReconnecting ? "Reconnecting" : "Paused"}</span>
            <span className={classes("sr-only")}>Live updates paused</span>
          </button>
        )}
      </div>
    </header>
  );
}

function statusLabel(value: string): string {
  if (value === "ready") return "Ready";
  if (value === "blocked" || value === "unconfigured") return "Setup needed";
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
