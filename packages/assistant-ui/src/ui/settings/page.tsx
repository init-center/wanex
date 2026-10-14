import { ArrowLeft, CalendarClock, Palette, Puzzle, PlugZap, Settings2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { classes } from "../classes.js";
import type { DispatchAction, DispatchActionResult } from "../shared/action.js";
import { AvailabilityNotice } from "../shared/availability.js";
import { AppearanceSection } from "./appearance.js";
import { ExtensionsSection } from "./extensions.js";
import { McpSection } from "./mcp.js";
import { ImageUnderstandingSetting } from "./image-understanding.js";
import { ModelsSection } from "./models.js";
import { SchedulesSection } from "./schedules.js";

export type SettingsSectionId = "models" | "appearance" | "schedules" | "extensions" | "tool-servers";

const sectionIcons = {
  models: Settings2,
  appearance: Palette,
  schedules: CalendarClock,
  extensions: Puzzle,
  "tool-servers": PlugZap,
} as const;

const sectionLabels: Readonly<Record<SettingsSectionId, string>> = {
  models: "Models",
  appearance: "Appearance",
  schedules: "Schedules",
  extensions: "Extensions",
  "tool-servers": "Tool servers",
};

/**
 * Settings is a page, not a dialog: it takes over the window with its own
 * section navigation, and "Back to app" returns to the untouched conversation.
 * First run shows only the model step, so the person is not handed every
 * section before they can send a message.
 */
export function SettingsPage({
  pageRef,
  client,
  snapshot,
  dispatch,
  dispatchResult,
  refreshError,
  refreshing,
  retryRefresh,
  onboarding,
  onSnapshot,
  onError,
  onClose,
  onKeyDown,
}: {
  readonly pageRef: Ref<HTMLElement>;
  readonly client: Client;
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly dispatchResult: DispatchActionResult;
  readonly refreshError: string | undefined;
  readonly refreshing: boolean;
  readonly retryRefresh: () => void;
  readonly onboarding: boolean;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string | undefined) => void;
  readonly onClose: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}): ReactNode {
  const [chosen, setChosen] = useState<SettingsSectionId>("models");
  const sections = availableSections(snapshot, client);
  const section = onboarding || !sections.includes(chosen) ? "models" : chosen;
  const notice = refreshError === undefined
    ? null
    : <AvailabilityNotice message={refreshError} retrying={refreshing} retry={retryRefresh} />;

  // One tree for both modes, so finishing first run keeps the Models form (and
  // its "saved" status) in place while the rest of Settings appears around it.
  return (
    <section
      ref={pageRef}
      className={classes(`settings-page ${onboarding ? "is-onboarding" : ""}`)}
      {...(onboarding
        ? { "aria-labelledby": "settings-onboarding-title" }
        : { "aria-label": "Settings" })}
      data-ui-settings-panel
      data-ui-settings-section={section}
      onKeyDown={onKeyDown}
    >
      {onboarding ? null : (
        <nav className={classes("settings-nav")} aria-label="Settings sections">
          <button
            type="button"
            className={classes("settings-back")}
            data-ui-action="close-settings"
            onClick={onClose}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back to app
          </button>
          <h1 className={classes("settings-nav-title")}>Settings</h1>
          <ul>
            {sections.map((id) => {
              const Icon = sectionIcons[id];
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={classes("settings-nav-item")}
                    aria-current={id === section ? "page" : undefined}
                    data-ui-settings-nav={id}
                    data-ui-initial-focus={id === section ? "true" : undefined}
                    onClick={() => setChosen(id)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{sectionLabels[id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className={classes("settings-content")}>
        <div className={classes("settings-content-inner")}>
          {onboarding ? (
            <div className={classes("settings-onboarding-header")}>
              <div>
                <h1 id="settings-onboarding-title">Connect a model</h1>
                <p>Add an API key from your provider to start chatting.</p>
              </div>
              <button
                type="button"
                className={classes("icon-button")}
                data-ui-action="close-settings"
                aria-label="Not now"
                title="Not now"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </div>
          ) : null}
          {notice}
          {section === "models" ? (
            <>
              <ModelsSection client={client} onboarding={onboarding} onSnapshot={onSnapshot} onError={onError} />
              {onboarding ? null : <ImageUnderstandingSetting snapshot={snapshot} dispatch={dispatch} />}
            </>
          ) : section === "appearance" ? (
            <AppearanceSection snapshot={snapshot} dispatch={dispatch} />
          ) : section === "schedules" ? (
            <SchedulesSection scheduleSettings={snapshot.view.settings.schedules} snapshot={snapshot} dispatch={dispatchResult} />
          ) : section === "extensions" ? (
            <ExtensionsSection plugins={snapshot.view.settings.plugins} dispatch={dispatchResult} />
          ) : (
            <McpSection settings={client.mcpSettings} />
          )}
        </div>
      </div>
    </section>
  );
}

function availableSections(snapshot: Snapshot, client: Client): readonly SettingsSectionId[] {
  return [
    "models",
    "appearance",
    // A capability this host does not offer gets no page, rather than a page saying so.
    ...(snapshot.view.settings.schedules.state === "unavailable" ? [] : ["schedules" as const]),
    ...(snapshot.view.settings.plugins.state === "unavailable" ? [] : ["extensions" as const]),
    ...(client.mcpSettings === undefined ? [] : ["tool-servers" as const]),
  ];
}
