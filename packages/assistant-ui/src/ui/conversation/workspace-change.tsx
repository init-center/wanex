import { AlertTriangle, ChevronDown, FileDiff, FilePlus2, FileX2, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type {
  WorkspaceChangeConflict,
  WorkspaceChangeReadModel,
  WorkspaceChangeSummary,
} from "@wanex/assistant";
import type { Action, Snapshot } from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { classes } from "../classes.js";
import { requestKey } from "../shared/request-key.js";
import { lineDiff } from "./line-diff.js";

type ChangeAction = Extract<Action, {
  readonly type:
    | "read-workspace-change"
    | "decide-workspace-change"
    | "apply-workspace-change"
    | "undo-workspace-change"
    | "reapply-workspace-change";
}>;

const STATUS_LABEL: Readonly<Record<WorkspaceChangeSummary["status"], string>> = {
  applied: "Applied",
  undone: "Undone",
  conflicted: "Conflict",
  proposed: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  needs_attention: "Needs attention",
};

type Tone = "ok" | "warn" | "danger" | "neutral";

function statusTone(status: WorkspaceChangeSummary["status"]): Tone {
  if (status === "applied") return "ok";
  if (status === "conflicted" || status === "failed") return "danger";
  if (status === "proposed" || status === "needs_attention") return "warn";
  return "neutral";
}

/** What the assistant changed, with review and apply controls when it is a proposal. */
export function WorkspaceChangeCard({
  change,
  sessionId,
  client,
  onSnapshot,
  onError,
}: {
  readonly change: WorkspaceChangeSummary;
  readonly sessionId?: string;
  readonly client: Client;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string) => void;
}): ReactNode {
  const [detail, setDetail] = useState<WorkspaceChangeReadModel>();
  const [conflicts, setConflicts] = useState<readonly WorkspaceChangeConflict[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ChangeAction["type"]>();
  const [readError, setReadError] = useState<string>();
  const detailsId = useId();
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const owner = useRef({ active: false, pending: false });
  const busy = pending !== undefined;
  // A result from this card wins only until the transcript delivers a newer summary.
  const [local, setLocal] = useState<{ readonly base: WorkspaceChangeSummary; readonly value: WorkspaceChangeSummary }>();
  const summary = local?.base === change ? local.value : change;

  useEffect(() => {
    const current = { active: true, pending: false };
    owner.current = current;
    setDetail(undefined);
    setConflicts([]);
    setOpen(false);
    setPending(undefined);
    setReadError(undefined);
    setLocal(undefined);
    return () => { current.active = false; };
  }, [client, sessionId, change.changeRef, change.available]);

  async function run(action: ChangeAction): Promise<void> {
    const current = owner.current;
    if (!current.active || current.pending || !ready) return;
    current.pending = true;
    setPending(action.type);
    const reading = action.type === "read-workspace-change";
    if (reading) setReadError(undefined);
    const reportError = (message: string): void => {
      if (reading) setReadError(message);
      else onError(message);
    };
    try {
      const result = await client.dispatchAction(action, { requestId: requestKey("workspace-change") });
      if (!current.active) return;
      onSnapshot(result.snapshot);
      if (!result.ok) {
        reportError(result.message);
        return;
      }
      const output = result.output;
      if (output?.kind !== "web.workspace-change-action") {
        if (reading) reportError("The change preview was not returned. Try again.");
        return;
      }
      const outcome = output.result;
      if (reading && (outcome.kind !== "assistant.workspace-change" || outcome.changeRef !== change.changeRef)) {
        reportError("The change preview did not match this request. Try again.");
        return;
      }
      if (outcome.kind === "assistant.workspace-change") {
        if (reading) setDetail(outcome);
        setLocal({ base: change, value: { ...outcome, files: outcome.files.map(({ path, kind }) => ({ path, kind })) } });
      } else if (outcome.kind === "assistant.workspace-change-mutation") {
        setConflicts(outcome.conflicts);
        setLocal({ base: change, value: outcome.change });
      }
    } catch (reason) {
      if (current.active) reportError(reason instanceof Error ? reason.message : "The change request failed");
    } finally {
      current.pending = false;
      if (current.active) setPending(undefined);
    }
  }

  const ready = sessionId !== undefined && summary.available;
  const input = (): { sessionId: string; changeRef: string } => ({ sessionId: sessionId ?? "", changeRef: summary.changeRef });
  const toggleReview = (): void => {
    const next = !open;
    setOpen(next);
    if (next && detail === undefined && readError === undefined) void read();
  };
  const read = (): Promise<void> => run({ type: "read-workspace-change", input: input() });
  const decide = (decision: "approve" | "reject"): void => void run({
    type: "decide-workspace-change",
    input: { ...input(), decision, idempotencyKey: requestKey("change-decision") },
  });
  const mutate = (type: "apply-workspace-change" | "undo-workspace-change" | "reapply-workspace-change"): void =>
    void run({ type, input: { ...input(), idempotencyKey: requestKey("change-mutation") } });

  const tone = statusTone(summary.status);
  const fileCount = summary.totalFileCount;
  return (
    <section className={classes("workspace-change")} data-ui-workspace-change={summary.changeKind} data-tone={tone}>
      <header className={classes("workspace-change-header")}>
        <span className={classes("workspace-change-icon")} aria-hidden="true"><FileDiff size={16} /></span>
        <div className={classes("workspace-change-title")}>
          <strong>{summary.title ?? (summary.changeKind === "proposal" ? "Proposed changes" : "Changed files")}</strong>
          <span>{summary.folder} · {fileCount} file{fileCount === 1 ? "" : "s"}</span>
        </div>
        <span className={classes("workspace-change-status")} data-tone={tone}>{STATUS_LABEL[summary.status]}</span>
      </header>

      {!summary.available ? (
        <p className={classes("workspace-change-note")} role="status">This folder is no longer available, so the change cannot be reviewed or applied.</p>
      ) : null}

      {conflicts.length === 0 ? null : (
        <div className={classes("workspace-change-conflicts")} role="alert" data-ui-workspace-conflicts>
          <strong><AlertTriangle size={14} aria-hidden="true" /> Some files changed since this was prepared</strong>
          <ul>
            {conflicts.map((conflict) => <li key={conflict.path}><code>{conflict.path}</code><span>{conflict.reason.replaceAll("_", " ")}</span></li>)}
          </ul>
        </div>
      )}

      {open && ready && detail !== undefined ? null : (
      <ul className={classes("workspace-change-files")} aria-label="Files in this change">
        {summary.files.map((file) => (
          <li key={file.path}>
            {file.kind === "create" ? <FilePlus2 size={13} aria-hidden="true" /> : file.kind === "delete" ? <FileX2 size={13} aria-hidden="true" /> : <FileDiff size={13} aria-hidden="true" />}
            <code>{file.path}</code>
          </li>
        ))}
        {fileCount > summary.files.length ? <li className={classes("workspace-change-more")}>+{fileCount - summary.files.length} more</li> : null}
      </ul>
      )}

      {open && ready ? (
        <div ref={detailsRef} id={detailsId} tabIndex={-1} role="region" aria-label="Change preview" className={classes("workspace-change-detail")} data-ui-workspace-review-state={pending === "read-workspace-change" ? "loading" : readError !== undefined ? "error" : detail === undefined ? "idle" : "ready"}>
          {pending === "read-workspace-change" ? (
            <p className={classes("workspace-review-loading")} role="status"><LoaderCircle size={14} aria-hidden="true" /> Loading changes...</p>
          ) : null}
          {readError === undefined ? null : (
            <div className={classes("workspace-review-error")} role="alert">
              <span>{readError}</span>
              <button type="button" disabled={busy} onClick={(event) => {
                if (document.activeElement === event.currentTarget) detailsRef.current?.focus();
                void read();
              }}>Try again</button>
            </div>
          )}
          {detail?.files.map((file) => (
            <FileDiffView key={file.path} path={file.path} before={file.before} after={file.after} />
          ))}
        </div>
      ) : null}

      <footer className={classes("workspace-change-actions")}>
        <button type="button" data-variant="quiet" aria-expanded={open && ready} aria-controls={open && ready ? detailsId : undefined} disabled={(busy && pending !== "read-workspace-change") || !ready} onClick={toggleReview}>
          {open ? "Hide changes" : "Review changes"}
          <ChevronDown size={14} aria-hidden="true" data-open={open} />
        </button>
        <span className={classes("workspace-change-spacer")} />
        {summary.actions.includes("reject") ? <button type="button" data-variant="quiet" disabled={busy || !ready} onClick={() => decide("reject")}>Reject</button> : null}
        {summary.actions.includes("undo") ? <button type="button" data-variant="quiet" disabled={busy || !ready} onClick={() => mutate("undo-workspace-change")}>Undo</button> : null}
        {summary.actions.includes("approve") ? <button type="button" data-variant="primary" disabled={busy || !ready} onClick={() => decide("approve")}>Approve</button> : null}
        {summary.actions.includes("apply") ? <button type="button" data-variant="primary" disabled={busy || !ready} onClick={() => mutate("apply-workspace-change")}>Apply changes</button> : null}
        {summary.actions.includes("reapply") ? <button type="button" data-variant="primary" disabled={busy || !ready} onClick={() => mutate("reapply-workspace-change")}>Reapply</button> : null}
      </footer>
    </section>
  );
}

function FileDiffView({ path, before, after }: {
  readonly path: string;
  readonly before: WorkspaceChangeReadModel["files"][number]["before"];
  readonly after: WorkspaceChangeReadModel["files"][number]["after"];
}): ReactNode {
  const rows = lineDiff(before?.text, after?.text);
  const truncated = before?.truncated === true || after?.truncated === true;
  return (
    <figure className={classes("diff")} data-ui-diff-file={path}>
      <figcaption><code>{path}</code></figcaption>
      <div className={classes("diff-body")} role="table" tabIndex={0} aria-label={`Changes in ${path}`}>
        {rows.length === 0 ? <div role="row"><p className={classes("diff-empty")} role="cell">No text changes to show.</p></div> : null}
        {rows.map((row, index) => row.kind === "gap" ? (
          <div key={index} className={classes("diff-gap")} role="row"><span role="cell">{row.hidden} unchanged line{row.hidden === 1 ? "" : "s"}</span></div>
        ) : (
          <div key={index} className={classes(`diff-row is-${row.kind}`)} role="row">
            <span className={classes("diff-no")} aria-hidden="true">{row.kind === "add" ? row.newNo : row.oldNo}</span>
            <span className={classes("diff-sign")} aria-hidden="true">{row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""}</span>
            <span className={classes("diff-text")} role="cell">{row.text}</span>
          </div>
        ))}
      </div>
      {truncated ? <p className={classes("diff-empty")}>Preview is shortened for large files.</p> : null}
    </figure>
  );
}
