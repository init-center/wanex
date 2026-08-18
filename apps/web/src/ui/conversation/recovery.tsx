import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ConversationRecoveryDecision, ConversationRecoveryItem } from "@wanex/product";
import type { ConversationViewModel } from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";

export function RecoveryPanel({
  conversation,
  dispatch,
}: {
  readonly conversation: ConversationViewModel;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const recovery = conversation.operation?.recovery;
  if (conversation.state !== "recovery_required" || recovery === undefined) return null;
  return (
    <section className={classes("recovery-panel")} data-ui-recovery>
      <div className={classes("card-heading")}>
        <div><span className={classes("eyebrow")}>Needs your review</span><h2>This tool needs a quick review</h2></div>
        <AlertTriangle size={17} />
      </div>
      <p className={classes("recovery-intro")}>The tool stopped before its result could be verified. Review what happened before the conversation continues.</p>
      {recovery.items.map((item) => (
        <RecoveryItem
          key={item.recoveryId}
          item={item}
          {...(conversation.sessionId === undefined ? {} : { sessionId: conversation.sessionId })}
          dispatch={dispatch}
        />
      ))}
    </section>
  );
}

function RecoveryItem({ item, sessionId, dispatch }: {
  readonly item: ConversationRecoveryItem;
  readonly sessionId?: string;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const [decision, setDecision] = useState<ConversationRecoveryDecision | undefined>(item.availableDecisions[0]);
  const [reason, setReason] = useState("Reviewed the interrupted step");
  const [observation, setObservation] = useState(() => defaultObservation(item.availableDecisions[0]));
  const [busy, setBusy] = useState(false);
  const confirms = decision === "confirm_succeeded" || decision === "confirm_failed";
  const observationRequired = confirms;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (decision === undefined || busy || (observationRequired && observation.trim().length === 0)) return;
    setBusy(true);
    void resolve();
  }

  async function resolve(): Promise<void> {
    if (decision === undefined) return;
    const succeeded = await dispatch({
      type: "resolve-conversation-recovery",
      input: {
        recoveryId: item.recoveryId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision,
        reason,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(confirms ? { content: [{ type: "text", text: observation.trim() }] } : {}),
      },
    });
    if (!succeeded) setBusy(false);
  }

  function changeDecision(next: ConversationRecoveryDecision): void {
    setDecision(next);
    if (observation.trim().length === 0 || observation === defaultObservation(decision)) {
      setObservation(defaultObservation(next));
    }
  }

  return (
    <article className={classes("recovery-item")} data-ui-recovery-item={item.recoveryId}>
      <h3>{item.tool.title}</h3>
      <div className={classes("recovery-meta")}>
        <span>{riskLabel(item.tool.risk)}</span>
        <span>{item.tool.idempotent ? "Safe to retry" : "Retry needs review"}</span>
      </div>
      <p className={classes("recovery-evidence")}>{item.evidence.message}</p>
      {item.attempts.length === 0 ? null : (
        <details className={classes("recovery-attempts")} data-ui-recovery-attempts>
          <summary>Previous attempts</summary>
          <ol>
            {item.attempts.map((attempt) => (
              <li key={attempt.attemptNumber}>
                <span>Attempt {attempt.attemptNumber}</span>
                <strong>{attemptStateLabel(attempt.state)}</strong>
              </li>
            ))}
          </ol>
        </details>
      )}
      {decision === undefined ? (
        <p className={classes("recovery-unavailable")}>No review action is available for this step.</p>
      ) : (
        <form className={classes("workflow-form recovery-form")} onSubmit={submit} aria-busy={busy}>
          <label><span>What should happen next?</span><select value={decision} disabled={busy} onChange={(event) => changeDecision(event.target.value as ConversationRecoveryDecision)}>{item.availableDecisions.map((value) => <option key={value} value={value}>{decisionLabel(value)}</option>)}</select></label>
          <label><span>Why are you choosing this?</span><input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} maxLength={1024} required /></label>
          {confirms ? <label><span>What happened?</span><textarea value={observation} disabled={busy} onChange={(event) => setObservation(event.target.value)} placeholder="Describe what you observed" required /></label> : null}
          <button type="submit" disabled={busy || reason.trim().length === 0 || (observationRequired && observation.trim().length === 0)}><RotateCcw size={14} /> {decisionLabel(decision)}</button>
        </form>
      )}
    </article>
  );
}

function decisionLabel(value: ConversationRecoveryDecision): string {
  switch (value) {
    case "confirm_succeeded": return "I saw it finish";
    case "confirm_failed": return "It did not finish";
    case "retry": return "Retry this step";
    case "abandon_turn": return "End this turn";
  }
}

function defaultObservation(value: ConversationRecoveryDecision | undefined): string {
  if (value === "confirm_succeeded") return "I verified that the tool finished successfully.";
  if (value === "confirm_failed") return "The tool did not finish successfully.";
  return "";
}

function riskLabel(value: ConversationRecoveryItem["tool"]["risk"]): string {
  if (value === "read_only") return "Read-only";
  if (value === "mutating") return "Changed data";
  return "External effect";
}

function attemptStateLabel(value: ConversationRecoveryItem["attempts"][number]["state"]): string {
  return value === "recovery_required"
    ? "Needs review"
    : value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
