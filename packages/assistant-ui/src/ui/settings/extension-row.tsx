import { RefreshCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { PluginInstalledVersionSummary } from "@wanex/assistant/plugin-management";
import { classes } from "../classes.js";
import {
  capabilitySummary,
  runtimeLabel,
  signatureLabel,
} from "./extension-format.js";

export function ExtensionRow({
  install,
  busy,
  setState,
  retry,
  beginRemove,
}: {
  readonly install: PluginInstalledVersionSummary;
  readonly busy: boolean;
  readonly setState: (
    install: PluginInstalledVersionSummary,
    state: "installed" | "disabled" | "removed",
  ) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly beginRemove: (
    install: PluginInstalledVersionSummary,
    trigger: HTMLButtonElement,
  ) => void;
}): ReactNode {
  const active = install.state === "installed";
  const removed = install.state === "removed";
  return (
    <li
      className={classes("extension-row")}
      data-ui-extension={`${install.pluginId}@${install.version}`}
      data-ui-extension-state={install.state}
    >
      <div className={classes("extension-summary")}>
        <div>
          <strong>{install.displayName}</strong>
          <span>{install.version}</span>
          <em data-state={install.runtimeState}>{runtimeLabel(install)}</em>
        </div>
        <p>{capabilitySummary(install.capabilities)}</p>
        <small>
          {install.signatureStatus === "unsigned"
            ? "Unsigned local code"
            : signatureLabel(install.signatureStatus)}
          {install.commandCount > 0
            ? ` · ${install.commandCount} command${install.commandCount === 1 ? "" : "s"}`
            : ""}
        </small>
      </div>
      <div className={classes("extension-controls")}>
        {removed ? <span className={classes("extension-removed")}>Removed</span> : (
          <label className={classes("extension-toggle")}>
            <input
              type="checkbox"
              checked={active}
              disabled={busy}
              onChange={() => void setState(
                install,
                active ? "disabled" : "installed",
              )}
              aria-label={`${active ? "Disable" : "Enable"} ${install.displayName}`}
              data-ui-extension-toggle
            />
            <span aria-hidden="true" />
          </label>
        )}
        {install.runtimeState === "attention_required" ? (
          <button
            type="button"
            className={classes("icon-button")}
            disabled={busy}
            onClick={() => void retry()}
            aria-label={`Retry loading ${install.displayName}`}
            title="Retry loading"
            data-ui-extension-retry
          >
            <RefreshCw size={14} />
          </button>
        ) : null}
        {removed ? null : (
          <button
            type="button"
            className={classes("icon-button danger-icon")}
            disabled={busy}
            onClick={(event) => beginRemove(install, event.currentTarget)}
            aria-label={`Remove ${install.displayName}`}
            title="Remove extension"
            data-ui-extension-remove
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {install.diagnostic === undefined ? null : (
        <p className={classes("extension-diagnostic")} role="status">
          {install.diagnostic.message}
        </p>
      )}
    </li>
  );
}
