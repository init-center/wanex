import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock3,
  LoaderCircle,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ConversationHistoryRow } from "../../application/model.js";
import { classes } from "../classes.js";

export type ConversationToolPart = Extract<
  ConversationHistoryRow["parts"][number],
  { readonly type: "tool" }
>;

type ToolActivityState = ConversationToolPart["state"];

export function ToolActivity({ tools }: {
  readonly tools: readonly ConversationToolPart[];
}): ReactNode {
  if (tools.length === 0) return null;
  const state = aggregateState(tools);
  if (tools.length === 1) {
    return (
      <div
        className={classes(`tool-activity is-single is-${state}`)}
        data-ui-tool-activity="single"
        data-ui-tool-count="1"
      >
        <ToolRow tool={tools[0]!} />
      </div>
    );
  }
  return <ToolActivityGroup tools={tools} state={state} />;
}

function ToolActivityGroup({
  tools,
  state,
}: {
  readonly tools: readonly ConversationToolPart[];
  readonly state: ToolActivityState;
}): ReactNode {
  const [expanded, setExpanded] = useState(state !== "succeeded");

  useEffect(() => {
    if (state !== "succeeded") setExpanded(true);
  }, [state]);

  return (
    <details
      className={classes(`tool-activity is-group is-${state}`)}
      data-ui-tool-activity="group"
      data-ui-tool-count={String(tools.length)}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span className={classes("tool-activity-icon")} aria-hidden="true">
          <ActivityIcon state={state} />
        </span>
        <span className={classes("tool-activity-copy")}>
          <strong>{activityTitle(state, tools.length)}</strong>
          <small>{activityStateLabel(state)}</small>
        </span>
        <ChevronDown
          size={14}
          className={classes("tool-activity-chevron")}
          aria-hidden="true"
        />
      </summary>
      <ul className={classes("tool-activity-list")}>
        {tools.map((tool) => (
          <li key={tool.key}>
            <ToolRow tool={tool} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function ToolRow({ tool }: { readonly tool: ConversationToolPart }): ReactNode {
  const summary = tool.presentation?.summary ?? tool.name;
  const details = tool.presentation?.details ?? [];
  return (
    <div
      className={classes(`tool-row is-${tool.state}`)}
      data-ui-tool={tool.name}
      data-ui-tool-state={tool.state}
    >
      <ToolIcon state={tool.state} />
      <span className={classes("tool-row-copy")}>
        <strong>{summary}</strong>
        {tool.presentation === undefined ? null : <small>{tool.name}</small>}
      </span>
      <small>{stateLabel(tool.state)}</small>
      {details.length === 0 ? null : (
        <details
          className={classes("tool-row-details")}
          data-ui-tool-details="true"
        >
          <summary>Details</summary>
          <dl>
            {details.map((detail, index) => (
              <div key={`${detail.label}:${index}`}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

function ActivityIcon({ state }: { readonly state: ToolActivityState }): ReactNode {
  if (state === "failed") {
    return <CircleAlert size={14} className={classes("is-error")} />;
  }
  if (state === "needs_attention") {
    return <CircleAlert size={14} className={classes("is-warning")} />;
  }
  if (state === "running") {
    return <LoaderCircle size={14} className={classes("is-running")} />;
  }
  if (state === "waiting") {
    return <Clock3 size={14} className={classes("is-waiting")} />;
  }
  if (state === "cancelled") {
    return <CircleMinus size={14} className={classes("is-cancelled")} />;
  }
  return <Wrench size={14} />;
}

function ToolIcon({ state }: { readonly state: ToolActivityState }): ReactNode {
  if (state === "failed") {
    return <CircleAlert size={14} className={classes("is-error")} aria-hidden="true" />;
  }
  if (state === "needs_attention") {
    return <CircleAlert size={14} className={classes("is-warning")} aria-hidden="true" />;
  }
  if (state === "running") {
    return <LoaderCircle size={14} className={classes("is-running")} aria-hidden="true" />;
  }
  if (state === "waiting") {
    return <Clock3 size={14} className={classes("is-waiting")} aria-hidden="true" />;
  }
  if (state === "cancelled") {
    return <CircleMinus size={14} className={classes("is-cancelled")} aria-hidden="true" />;
  }
  return <CircleCheck size={14} className={classes("is-success")} aria-hidden="true" />;
}

function aggregateState(tools: readonly ConversationToolPart[]): ToolActivityState {
  if (tools.some((tool) => tool.state === "needs_attention")) return "needs_attention";
  if (tools.some((tool) => tool.state === "failed")) return "failed";
  if (tools.some((tool) => tool.state === "running")) return "running";
  if (tools.some((tool) => tool.state === "waiting")) return "waiting";
  if (tools.some((tool) => tool.state === "cancelled")) return "cancelled";
  return "succeeded";
}

function activityTitle(state: ToolActivityState, count: number): string {
  if (state === "running") return `Using ${count} tools`;
  if (state === "waiting") return `${count} tool steps are waiting`;
  if (state === "needs_attention") return `${count} tool steps need attention`;
  if (state === "failed") return `${count} tool steps failed`;
  if (state === "cancelled") return `${count} tool steps stopped`;
  return `Used ${count} tools`;
}

function activityStateLabel(state: ToolActivityState): string {
  if (state === "running") return "Working";
  if (state === "waiting") return "Waiting";
  if (state === "needs_attention") return "Review";
  if (state === "failed") return "Failed";
  if (state === "cancelled") return "Stopped";
  return "Completed";
}

function stateLabel(value: ToolActivityState): string {
  switch (value) {
    case "running": return "Working";
    case "waiting": return "Waiting";
    case "succeeded": return "Succeeded";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "needs_attention": return "Needs attention";
  }
}
