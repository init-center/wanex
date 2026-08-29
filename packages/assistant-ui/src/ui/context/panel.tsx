import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { Action, Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import { IconButton } from "../shared/icon-button.js";
import type { DispatchAction } from "../shared/action.js";
import { TeamContext } from "../team/context.js";

export function ContextPanel({
  snapshot,
  dispatch,
  pendingActionTypes,
  onClose,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly pendingActionTypes: ReadonlySet<Action["type"]>;
  readonly onClose: () => void;
}): ReactNode {
  if (snapshot.view.selection?.kind === "team") {
    return (
      <TeamContext
        snapshot={snapshot}
        dispatch={dispatch}
        pendingActionTypes={pendingActionTypes}
        onClose={onClose}
      />
    );
  }
  return (
    <aside className={classes("context-panel")} aria-label="Context">
      <div className={classes("context-panel-header")}>
        <div><span className={classes("eyebrow")}>Context</span><h2>Active work</h2></div>
        <IconButton label="Close context panel" onClick={onClose}><X size={17} /></IconButton>
      </div>
      <ContextValue label="Operation" value={snapshot.view.operationStatus.state} />
      <ContextValue label="Plan" value={planLabel(snapshot.plan.proposal.kind)} />
      <ContextValue label="Goal" value={snapshot.goal.state} />
      <ContextValue label="Side query" value={snapshot.sideQuery.state} />
      <ContextValue label="Attachments" value={String(snapshot.view.conversationAttachments.length)} />
      <div className={classes("context-note")}>
        Execution details appear here when relevant. Runtime identities remain hidden.
      </div>
    </aside>
  );
}

function ContextValue({ label, value }: {
  readonly label: string;
  readonly value: string;
}): ReactNode {
  return (
    <div className={classes("context-value")}>
      <span>{label}</span><strong>{value}</strong>
    </div>
  );
}

function planLabel(value: string): string {
  return value.replace("assistant.plan-proposal.", "").replaceAll("-", " ");
}
