import { ShieldAlert, X } from "lucide-react";
import type {
  ReactNode,
  RefObject,
} from "react";
import type {
  LocalPluginReview,
  PluginInstalledVersionSummary,
} from "@wanex/assistant/plugin-management";
import { classes } from "../classes.js";
import { SettingsSubdialog, Title, Description } from "./subdialog.js";
import {
  capabilityLabel,
  formatBytes,
  formatExpiry,
  shortDigest,
} from "./extension-format.js";

export function ReviewDialog({
  review,
  busy,
  isBusy,
  error,
  initialFocus,
  returnFocus,
  approve,
  cancel,
}: {
  readonly review: LocalPluginReview;
  readonly busy: boolean;
  readonly isBusy: () => boolean;
  readonly error: string | undefined;
  readonly initialFocus: RefObject<HTMLButtonElement | null>;
  readonly returnFocus: RefObject<HTMLButtonElement | null>;
  readonly approve: () => Promise<void>;
  readonly cancel: () => Promise<void>;
}): ReactNode {
  return (
    <SettingsSubdialog busy={busy} isBusy={isBusy} initialFocus={initialFocus} returnFocus={returnFocus} cancel={cancel}>
      <section
        className={classes("extension-review")}
        data-ui-extension-review
      >
        <header>
          <div>
            <span className={classes("eyebrow")}>Review local code</span>
            <Title asChild><h3>{review.displayName}</h3></Title>
            <Description asChild><p>{review.pluginId} · {review.version}</p></Description>
          </div>
          <button
            type="button"
            className={classes("icon-button")}
            disabled={busy}
            onClick={() => void cancel()}
            aria-label="Cancel extension review"
          >
            <X size={16} />
          </button>
        </header>
        <div className={classes("extension-warning")}>
          <ShieldAlert size={17} />
          <div>
            <strong>Unsigned local code</strong>
            <p>This extension can run its declared capabilities after approval.</p>
          </div>
        </div>
        <dl className={classes("extension-evidence")}>
          <div>
            <dt>Digest</dt>
            <dd title={review.artifactSha256}>{shortDigest(review.artifactSha256)}</dd>
          </div>
          <div><dt>Package</dt><dd>{formatBytes(review.totalBytes)} · {review.fileCount} files</dd></div>
          <div><dt>Review expires</dt><dd>{formatExpiry(review.expiresAt)}</dd></div>
        </dl>
        <ReviewList
          label="Capabilities"
          values={review.capabilities.map(capabilityLabel)}
          empty="No capabilities declared"
        />
        <ReviewList
          label="Commands"
          values={review.commands.map((command) => command.title)}
          empty="No commands declared"
        />
        <ReviewList
          label="Dependencies"
          values={review.dependencies.map((dependency) =>
            `${dependency.name} · ${dependency.distribution} · ${dependency.loading}`
          )}
          empty="No dependencies declared"
        />
        {error === undefined ? null : <p className={classes("settings-error")} role="alert" data-ui-extension-error>{error}</p>}
        <footer>
          <button
            ref={initialFocus}
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={classes("primary-action")}
            disabled={busy}
            onClick={() => void approve()}
            data-ui-extension-approve
          >
            {busy ? "Installing..." : "Approve and install"}
          </button>
        </footer>
      </section>
    </SettingsSubdialog>
  );
}

export function RemoveDialog({
  install,
  busy,
  isBusy,
  error,
  initialFocus,
  returnFocus,
  fallbackFocus,
  confirm,
  cancel,
}: {
  readonly install: PluginInstalledVersionSummary;
  readonly busy: boolean;
  readonly isBusy: () => boolean;
  readonly error: string | undefined;
  readonly initialFocus: RefObject<HTMLButtonElement | null>;
  readonly returnFocus: RefObject<HTMLButtonElement | null>;
  readonly fallbackFocus: RefObject<HTMLButtonElement | null>;
  readonly confirm: () => Promise<void>;
  readonly cancel: () => void;
}): ReactNode {
  return (
    <SettingsSubdialog busy={busy} isBusy={isBusy} initialFocus={initialFocus} returnFocus={returnFocus} fallbackFocus={fallbackFocus} cancel={cancel}>
      <section
        className={classes("extension-remove-dialog")}
        data-ui-extension-remove-dialog
      >
        <Title asChild><h3>Remove {install.displayName}?</h3></Title>
        <Description asChild><p>
          Its commands will no longer be available. Reinstalling requires a new review.
        </p></Description>
        {error === undefined ? null : <p className={classes("settings-error")} role="alert" data-ui-extension-error>{error}</p>}
        <footer>
          <button ref={initialFocus} type="button" disabled={busy} onClick={cancel}>
            Keep extension
          </button>
          <button
            type="button"
            className={classes("danger-action")}
            disabled={busy}
            onClick={() => void confirm()}
            data-ui-extension-remove-confirm
          >
            Remove
          </button>
        </footer>
      </section>
    </SettingsSubdialog>
  );
}

function ReviewList({
  label,
  values,
  empty,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly empty: string;
}): ReactNode {
  return (
    <section className={classes("extension-review-list")}>
      <h4>{label}</h4>
      {values.length === 0 ? <p>{empty}</p> : (
        <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul>
      )}
    </section>
  );
}
