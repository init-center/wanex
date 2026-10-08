import { Bot, Folder, Paperclip, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Action, Snapshot } from "../../application/model.js";
import {
  conversationModelEndpoints,
  conversationModelLabels,
} from "../../application/conversation/endpoints.js";
import { classes } from "../classes.js";
import { IconButton } from "../shared/icon-button.js";
import type { DispatchAction } from "../shared/action.js";
import { humanState } from "../shared/state-label.js";
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
  const folders = snapshot.view.workspaceFolders;
  const model = activeModel(snapshot);
  return (
    <aside className={classes("context-panel")} aria-label="Context" data-ui-context-panel>
      <div className={classes("context-panel-header")}>
        <div><span className={classes("eyebrow")}>Context</span><h2>This conversation</h2></div>
        <IconButton label="Close context panel" onClick={onClose}><X size={17} /></IconButton>
      </div>
      {folders.available ? (
        <ContextSection
          icon={<Folder size={15} />}
          title="Folders"
          empty="No folders yet. Add one from the composer."
          items={folders.folders.map((folder) => ({
            key: folder.grantId,
            label: folder.name,
            detail: folder.access === "read" ? "Read only" : "Can edit",
          }))}
        />
      ) : null}
      <ContextSection
        icon={<Bot size={15} />}
        title="Model"
        empty="No model connected"
        items={model === undefined ? [] : [{ key: "model", label: model }]}
      />
      <ContextSection
        icon={<Paperclip size={15} />}
        title="Attachments"
        empty="No attachments"
        items={snapshot.view.conversationAttachments.map((attachment) => ({
          key: attachment.resourceId,
          label: attachment.label ?? "Attachment",
          detail: formatBytes(attachment.sizeBytes),
        }))}
      />
      <ContextSection
        icon={<Sparkles size={15} />}
        title="Workflows"
        empty="Nothing running"
        items={activeWorkflows(snapshot)}
      />
    </aside>
  );
}

interface ContextEntry {
  readonly key: string;
  readonly label: string;
  readonly detail?: string;
}

function ContextSection({ icon, title, empty, items }: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly empty: string;
  readonly items: readonly ContextEntry[];
}): ReactNode {
  return (
    <section className={classes("context-section")}>
      <h3>{icon}{title}</h3>
      {items.length === 0 ? <p className={classes("context-empty")}>{empty}</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.key} className={classes("context-item")}>
              <span>{item.label}</span>
              {item.detail === undefined ? null : <small>{item.detail}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function activeModel(snapshot: Snapshot): string | undefined {
  const activeId = snapshot.view.settings.profile.activeModelEndpointId;
  const endpoints = conversationModelEndpoints(snapshot, false);
  const endpoint = endpoints.find((candidate) => candidate.id === activeId);
  return endpoint === undefined ? undefined : conversationModelLabels(endpoints).get(endpoint.id);
}

function activeWorkflows(snapshot: Snapshot): readonly ContextEntry[] {
  const result: ContextEntry[] = [];
  const generation = snapshot.plan.generation;
  if (generation !== undefined) {
    result.push({ key: "plan", label: "Plan", detail: generation.state === "running" ? "Drafting" : humanState(generation.state) });
  } else if (snapshot.plan.proposal.kind === "assistant.plan-proposal.found") {
    result.push({ key: "plan", label: "Plan", detail: humanState(snapshot.plan.proposal.proposal.state) });
  }
  if (snapshot.goal.goal !== undefined) {
    result.push({ key: "goal", label: "Goal", detail: humanState(snapshot.goal.goal.state) });
  }
  if (snapshot.sideQuery.state !== "idle") {
    result.push({ key: "aside", label: "Ask aside", detail: humanState(snapshot.sideQuery.state) });
  }
  return result;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
