import {
  CircleAlert,
  LoaderCircle,
  PanelLeft,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";

export function Topbar({
  snapshot,
  streamAvailable,
  streamReconnecting,
  sessionsOpen,
  sidebarCollapsed,
  inactive,
  openSessions,
  toggleSidebar,
  reconnectStream,
  groupDetailsOpen,
  toggleGroupDetails,
  actions,
}: {
  readonly snapshot: Snapshot;
  readonly streamAvailable: boolean;
  readonly streamReconnecting: boolean;
  readonly sessionsOpen: boolean;
  readonly sidebarCollapsed: boolean;
  readonly inactive: boolean;
  readonly openSessions: () => void;
  readonly toggleSidebar: () => void;
  readonly reconnectStream: () => void;
  readonly groupDetailsOpen?: boolean;
  /** Present only for group conversations: their members and coordinator live in a drawer. */
  readonly toggleGroupDetails?: () => void;
  readonly actions?: ReactNode;
}): ReactNode {
  const state = snapshot.view;
  // Model readiness is shown where it is fixed (the composer's model control);
  // the header only exposes it as a machine-readable state.
  return (
    <header
      className={classes("topbar")}
      data-ui-topbar
      data-ui-provider-state={state.providerRunGate.state}
      inert={inactive ? true : undefined}
    >
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
        <button
          type="button"
          className={classes("icon-button desktop-sidebar-toggle")}
          data-ui-action="toggle-sidebar"
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-controls="conversation-navigation"
          aria-expanded={!sidebarCollapsed}
          onClick={toggleSidebar}
        >
          <PanelLeft size={17} />
        </button>
        <h1 data-ui-selected-session-title>
          {state.title}
        </h1>
      </div>
      <div className={classes("top-actions")}>
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
        {actions}
        {toggleGroupDetails === undefined ? null : (
          <button
            type="button"
            className={classes(`icon-button ${groupDetailsOpen === true ? "is-active" : ""}`)}
            data-ui-action="toggle-group-details"
            aria-label="Group details"
            title="Group details"
            aria-pressed={groupDetailsOpen === true}
            onClick={toggleGroupDetails}
          >
            <Users size={17} />
          </button>
        )}
      </div>
    </header>
  );
}
