import {
  PackagePlus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  LocalPluginReview,
  PluginInstalledVersionSummary,
  PluginManagementMutationResult,
} from "@wanex/assistant/plugin-management";
import type {
  ActionResult,
  PluginSettingsViewModel,
} from "../../application/model.js";
import type { DispatchActionResult } from "../shared/action.js";
import { classes } from "../classes.js";
import { ReviewDialog, RemoveDialog } from "./extension-dialogs.js";
import { ExtensionRow } from "./extension-row.js";
import { useSettingsOperation } from "./use-operation.js";

export function ExtensionsSection({
  plugins,
  dispatch,
}: {
  readonly plugins: PluginSettingsViewModel;
  readonly dispatch: DispatchActionResult;
}): ReactNode {
  const [review, setReview] = useState<LocalPluginReview>();
  const [removeTarget, setRemoveTarget] = useState<PluginInstalledVersionSummary>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const addButton = useRef<HTMLButtonElement | null>(null);
  const reviewFocus = useRef<HTMLButtonElement | null>(null);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const removeFocus = useRef<HTMLButtonElement | null>(null);

  const { busy, isBusy, run } = useSettingsOperation(clearFeedback, setError);

  if (plugins.state === "unavailable") return null;

  async function requestReview(): Promise<void> {
    await run(() => dispatch({ type: "request-local-plugin-review" }), (result) => {
      const value = pluginOutput(result, "request-local-plugin-review");
      if (value?.kind === "plugin.management.review-ready") {
        setReview(value.review);
        return;
      }
      if (value?.kind === "plugin.management.review-cancelled") {
        setStatus("No extension selected");
        addButton.current?.focus();
        return;
      }
      setError(resultMessage(result, value, "Extension review could not be prepared"));
    });
  }

  async function retryRead(): Promise<void> {
    await run(() => dispatch({ type: "read-plugin-management" }), (result) => {
      const value = pluginOutput(result, "read-plugin-management");
      if (result?.ok === true && value !== undefined) {
        setStatus("Extensions refreshed");
        return;
      }
      setError(resultMessage(result, value, "Extensions could not be refreshed"));
    });
  }

  async function approveReview(): Promise<void> {
    if (review === undefined) return;
    await run(() => dispatch({
      type: "approve-local-plugin-review",
      input: {
        reviewId: review.reviewId,
        reason: "Approved after local extension review",
      },
    }), (result) => {
      const value = pluginOutput(result, "approve-local-plugin-review");
      if (applied(value)) {
        closeReview();
        setStatus(value.kind === "plugin.management.attention-required"
          ? "Extension installed, but loading needs attention"
          : "Extension installed");
        if (value.kind === "plugin.management.attention-required") {
          setError(value.diagnostic.message);
        }
        return;
      }
      setError(resultMessage(result, value, "Extension could not be installed"));
      if (value?.kind === "plugin.management.rejected" &&
        (value.reason === "review_expired" ||
          value.reason === "review_stale" ||
          value.reason === "review_not_found")) {
        closeReview();
      }
    });
  }

  async function cancelReview(): Promise<void> {
    if (review === undefined) return;
    await run(() => dispatch({
      type: "cancel-local-plugin-review",
      input: { reviewId: review.reviewId },
    }), (result) => {
      const value = pluginOutput(result, "cancel-local-plugin-review");
      if (value?.kind === "plugin.management.review-cancelled") {
        closeReview();
        setStatus("Extension review cancelled");
        return;
      }
      setError(resultMessage(result, value, "Extension review could not be cancelled"));
    });
  }

  async function setState(
    install: PluginInstalledVersionSummary,
    state: "installed" | "disabled" | "removed",
  ): Promise<void> {
    if (install.state === "removed") return;
    await run(() => dispatch({
      type: "set-plugin-install-state",
      input: {
        pluginId: install.pluginId,
        version: install.version,
        expectedState: install.state,
        state,
      },
    }), (result) => {
      const value = pluginOutput(result, "set-plugin-install-state");
      if (applied(value)) {
        setRemoveTarget(undefined);
        setStatus(state === "installed"
          ? "Extension enabled"
          : state === "disabled"
            ? "Extension disabled"
            : "Extension removed");
        if (value.kind === "plugin.management.attention-required") {
          setError(value.diagnostic.message);
        }
        return;
      }
      setError(resultMessage(result, value, "Extension state could not be changed"));
    });
  }

  async function retryRefresh(): Promise<void> {
    await run(() => dispatch({ type: "retry-plugin-refresh" }), (result) => {
      const value = pluginOutput(result, "retry-plugin-refresh");
      if (value?.kind === "plugin.management.applied") {
        setStatus("Extension catalog refreshed");
        return;
      }
      if (value?.kind === "plugin.management.attention-required") {
        setError(value.diagnostic.message);
        return;
      }
      setError(resultMessage(result, value, "Extension catalog could not be refreshed"));
    });
  }

  function beginRemove(
    install: PluginInstalledVersionSummary,
    trigger: HTMLButtonElement,
  ): void {
    if (isBusy()) return;
    removeTrigger.current = trigger;
    setRemoveTarget(install);
    clearFeedback();
  }

  function cancelRemove(): void {
    if (isBusy()) return;
    setRemoveTarget(undefined);
  }

  function closeReview(): void {
    setReview(undefined);
  }

  function clearFeedback(): void {
    setError(undefined);
    setStatus(undefined);
  }

  return (
    <section
      className={classes("settings-section extensions-section")}
      data-ui-extension-settings
    >
      <div className={classes("settings-heading")}>
        <div>
          <PackagePlus size={15} />
          <strong>Extensions</strong>
        </div>
        {plugins.state === "failed" ? (
          <button
            type="button"
            className={classes("extension-add")}
            disabled={busy}
            onClick={() => void retryRead()}
            data-ui-extension-read-retry
          >
            <RefreshCw size={14} />
            Retry
          </button>
        ) : (
          <button
            ref={addButton}
            type="button"
            className={classes("extension-add")}
            disabled={busy}
            onClick={() => void requestReview()}
            data-ui-extension-add
          >
            <PackagePlus size={14} />
            Add extension
          </button>
        )}
      </div>

      {plugins.state === "failed" ? (
        <div className={classes("extension-attention")} role="alert">
          <ShieldAlert size={15} />
          <span>{plugins.message ?? "Extensions could not be loaded"}</span>
        </div>
      ) : plugins.installs.length === 0 ? (
        <p className={classes("muted extension-empty")} data-ui-extension-empty>
          Add trusted local extensions when you need more commands.
        </p>
      ) : (
        <ul className={classes("extension-list")} aria-label="Installed extensions">
          {plugins.installs.map((install) => (
            <ExtensionRow
              key={`${install.pluginId}@${install.version}`}
              install={install}
              busy={busy}
              setState={setState}
              retry={retryRefresh}
              beginRemove={beginRemove}
            />
          ))}
        </ul>
      )}

      {error === undefined || review !== undefined || removeTarget !== undefined ? null : (
        <p className={classes("settings-error")} role="alert" data-ui-extension-error>
          {error}
        </p>
      )}
      {status === undefined ? null : (
        <p className={classes("success")} role="status" data-ui-extension-status>
          {status}
        </p>
      )}

      {review === undefined ? null : (
        <ReviewDialog
          review={review}
          busy={busy}
          isBusy={isBusy}
          error={error}
          initialFocus={reviewFocus}
          returnFocus={addButton}
          approve={approveReview}
          cancel={cancelReview}
        />
      )}
      {removeTarget === undefined ? null : (
        <RemoveDialog
          install={removeTarget}
          busy={busy}
          isBusy={isBusy}
          error={error}
          initialFocus={removeFocus}
          returnFocus={removeTrigger}
          fallbackFocus={addButton}
          confirm={() => setState(removeTarget, "removed")}
          cancel={cancelRemove}
        />
      )}
    </section>
  );
}

function pluginOutput(
  result: ActionResult | undefined,
  action: NonNullable<ActionResult["output"]>["action"],
): NonNullable<ActionResult["output"]>["result"] | undefined {
  return result?.output?.kind === "web.plugin-management-action" &&
    result.output.action === action
    ? result.output.result
    : undefined;
}

function applied(
  value: NonNullable<ActionResult["output"]>["result"] | undefined,
): value is PluginManagementMutationResult & {
  readonly kind:
  | "plugin.management.applied"
  | "plugin.management.attention-required";
} {
  return value?.kind === "plugin.management.applied" ||
    value?.kind === "plugin.management.attention-required";
}

function resultMessage(
  result: ActionResult | undefined,
  value: NonNullable<ActionResult["output"]>["result"] | undefined,
  fallback: string,
): string {
  if (value?.kind === "plugin.management.rejected") return value.message;
  return result?.ok === false ? result.message : fallback;
}
