import { Check, ShieldAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ConversationApprovalDecision, ConversationApprovalItem } from "@wanex/product";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";

export function ApprovalPanel({
  snapshot,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const items = snapshot.conversation.operation?.approvals?.items ?? [];
  return (
    <section className={classes("context-card approval-card")} data-ui-approval>
      <div className={classes("card-heading")}>
        <div><span className={classes("eyebrow")}>Approval</span><h2>Review tool access</h2></div>
        <ShieldAlert size={17} aria-hidden="true" />
      </div>
      {items.map((item) => (
        <ApprovalItemView
          key={item.approvalId}
          item={item}
          dispatch={dispatch}
          {...(snapshot.conversation.sessionId === undefined
            ? {}
            : { sessionId: snapshot.conversation.sessionId })}
        />
      ))}
    </section>
  );
}

function ApprovalItemView({
  item,
  sessionId,
  dispatch,
}: {
  readonly item: ConversationApprovalItem;
  readonly sessionId?: string;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const [busy, setBusy] = useState(false);

  async function decide(decision: ConversationApprovalDecision): Promise<void> {
    if (busy) return;
    setBusy(true);
    const succeeded = await dispatch({
      type: "resolve-conversation-approval",
      input: {
        ...(sessionId === undefined ? {} : { sessionId }),
        approvalId: item.approvalId,
        expectedApprovalRevision: item.approvalRevision,
        decision,
        reason: decision === "approve_once"
          ? "User allowed this request once"
          : "User denied this request",
      },
    });
    if (!succeeded) setBusy(false);
  }

  return (
    <div className={classes("approval-item")} key={item.approvalId} data-ui-approval-item={item.approvalId} aria-busy={busy}>
      <strong>{item.tool.title}</strong>
      <p>{item.presentation.summary}</p>
      {item.presentation.details.length === 0 ? null : (
        <details className={classes("approval-details")} data-ui-approval-details>
          <summary>Details</summary>
          <dl>
            {item.presentation.details.map((detail) => (
              <div key={`${detail.label}:${detail.value}`}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <div className={classes("inline-actions")}>
        {item.availableDecisions.map((decision) => (
          <button
            key={decision}
            type="button"
            data-ui-approval-decision={decision}
            disabled={busy}
            onClick={() => void decide(decision)}
          >
            {decision === "approve_once" ? <Check size={14} /> : <X size={14} />}
            {decisionLabel(decision)}
          </button>
        ))}
      </div>
    </div>
  );
}

function decisionLabel(value: ConversationApprovalDecision): string {
  return value === "approve_once" ? "Allow once" : "Deny";
}
