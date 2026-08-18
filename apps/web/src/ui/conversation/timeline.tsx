import {
  ArrowDown,
  ArrowUp,
  Bot,
  CircleAlert,
  Code2,
  GitPullRequest,
  LoaderCircle,
  ListChecks,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  ConversationHistoryRow,
  Snapshot,
} from "../../application/model.js";
import type { Client } from "../../client/contracts.js";
import { classes } from "../classes.js";
import { ResourceCard } from "../resources/card.js";
import type { DispatchAction } from "../shared/action.js";
import {
  ConversationRichText,
  MessageCopyAction,
  projectMessageClipboardText,
} from "./content.js";
import { ApprovalPanel } from "./approval.js";
import { CapabilityRequestCard } from "./interactions.js";
import { RecoveryPanel } from "./recovery.js";
import { useConversationScrollOwnership } from "./scroll.js";
import {
  ToolActivity,
  type ConversationToolPart,
} from "./tool-activity.js";

export function ConversationTimeline({
  snapshot,
  dispatch,
  client,
  onSnapshot,
  onError,
  onOpenSettings,
  onSelectPrompt,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly client: Client;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string) => void;
  readonly onOpenSettings: () => void;
  readonly onSelectPrompt: (prompt: string) => void;
}): ReactNode {
  const conversation = snapshot.conversation;
  const canonicalRevision = [
    conversation.historyRows
      .map((row) => `${row.id}:${row.updatedAt}:${row.status}`)
      .join(","),
    conversation.pendingFollowUp?.updatedAt ?? "",
    conversation.operation?.updatedAt ?? "",
  ].join("|");
  const {
    viewportRef,
    contentRef,
    showJumpToLatest,
    handleScroll,
    jumpToLatest,
    prepareForHistoryPrepend,
    cancelHistoryPrepend,
  } = useConversationScrollOwnership({
    sessionKey: conversation.sessionId ?? "new-conversation",
    canonicalRevision,
    ...(conversation.transientAssistantText === undefined
      ? {}
      : { transientRevision: conversation.transientAssistantText }),
  });
  const currentCapabilityRowIds = new Set(
    conversation.operation?.transcript.rows
      .filter((row) => row.capabilityRequests.length > 0)
      .map((row) => row.key) ?? [],
  );
  const [historyLoadState, setHistoryLoadState] = useState<
    "idle" | "loading" | "failed"
  >("idle");
  const [historyLoadError, setHistoryLoadError] = useState<string>();
  useEffect(() => {
    setHistoryLoadState("idle");
    setHistoryLoadError(undefined);
  }, [conversation.sessionId]);

  async function loadEarlierHistory(): Promise<void> {
    const sessionId = conversation.sessionId;
    const cursor = conversation.historyPage.nextCursor;
    if (
      sessionId === undefined ||
      cursor === undefined ||
      historyLoadState === "loading"
    ) return;
    setHistoryLoadState("loading");
    setHistoryLoadError(undefined);
    try {
      prepareForHistoryPrepend();
      const loaded = await dispatch({
        type: "load-earlier-history",
        input: {
          sessionId,
          cursor,
          limit: conversation.historyPage.limit,
        },
      });
      if (!loaded) {
        cancelHistoryPrepend();
        throw new Error("Earlier messages could not be loaded");
      }
      setHistoryLoadState("idle");
    } catch (reason) {
      setHistoryLoadState("failed");
      setHistoryLoadError(
        reason instanceof Error ? reason.message : "Earlier messages could not be loaded",
      );
    }
  }
  return (
    <div className={classes("timeline-frame")}>
      <div
        ref={viewportRef}
        className={classes("timeline")}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-relevant="additions text"
        data-ui-conversation-timeline
        data-ui-conversation-state={conversation.state}
        data-ui-history-expanded={conversation.historyExpanded ? "true" : "false"}
        onScroll={handleScroll}
        {...(conversation.sessionId === undefined
          ? {}
          : { "data-ui-session-id": conversation.sessionId })}
        {...(conversation.operationId === undefined
          ? {}
          : { "data-ui-operation-id": conversation.operationId })}
      >
        <div ref={contentRef} className={classes("timeline-content")}>
          {conversation.historyPage.hasMore ? (
            <div className={classes("history-loader")} data-ui-history-loader>
              <button
                type="button"
                disabled={historyLoadState === "loading"}
                onClick={() => void loadEarlierHistory()}
              >
                {historyLoadState === "loading" ? (
                  <LoaderCircle size={14} className={classes("is-running")} />
                ) : (
                  <ArrowUp size={14} />
                )}
                {historyLoadState === "loading" ? "Loading earlier messages" : "Load earlier messages"}
              </button>
              {historyLoadError === undefined ? null : (
                <span role="alert">{historyLoadError}</span>
              )}
            </div>
          ) : null}
          {conversation.historyPage.liveRowsTruncated ? (
            <p className={classes("history-notice")} role="status">
              Some pending messages are not shown.
            </p>
          ) : null}
          {conversation.historyRows.length === 0 && conversation.transientAssistantText === undefined ? (
            <div className={classes("empty")}>
              <div className={classes("empty-heading")}>
                <div>
                  <h2>What would you like to do?</h2>
                  <p>Start with a question, a file, or one of these common tasks.</p>
                </div>
              </div>
              <div className={classes("quick-starts")} data-ui-quick-starts aria-label="Quick starts">
                <QuickStartButton label="Explain a codebase" detail="Map the important parts" onSelect={onSelectPrompt} />
                <QuickStartButton label="Review a change" detail="Find risks before they ship" onSelect={onSelectPrompt} />
                <QuickStartButton label="Draft a plan" detail="Turn an idea into next steps" onSelect={onSelectPrompt} />
              </div>
              {snapshot.view.providerRunGate.canRun ? null : (
                <button type="button" className={classes("primary-action")} data-ui-action="open-settings" onClick={onOpenSettings}>
                  <SlidersHorizontal size={15} /> Connect a model
                </button>
              )}
            </div>
          ) : null}
          {conversation.historyRows.map((row) => (
            <TimelineRow
              key={row.id}
              row={row}
              client={client}
              currentCapabilityRowIds={currentCapabilityRowIds}
              {...(conversation.operationId === undefined
                ? {}
                : { operationId: conversation.operationId })}
              {...(conversation.sessionId === undefined
                ? {}
                : { sessionId: conversation.sessionId })}
              onSnapshot={onSnapshot}
              onError={onError}
            />
          ))}
          {conversation.transientAssistantText === undefined ? null : (
            <article
              className={classes("message is-assistant is-streaming")}
              data-ui-transient-assistant
            >
              <MessageHeader label="Assistant" meta="Working" role="assistant" />
              <div className={classes("message-body")}>{conversation.transientAssistantText}</div>
            </article>
          )}
          {conversation.pendingFollowUp === undefined ? null : (
            <PendingMessage
              label="Queued follow-up"
              state={conversation.pendingFollowUp.state}
              text={conversation.pendingFollowUp.text}
              operationId={conversation.pendingFollowUp.operationId}
            />
          )}
          {conversation.operation?.steering?.pending.map((item) => (
            <PendingMessage
              key={item.steeringId}
              label="Guiding current response"
              state="Pending"
              text={item.text}
            />
          ))}
          {(conversation.operation?.approvals?.items.length ?? 0) > 0
            ? <ApprovalPanel snapshot={snapshot} dispatch={dispatch} />
            : null}
          <RecoveryPanel conversation={conversation} dispatch={dispatch} />
        </div>
      </div>
      {showJumpToLatest ? (
        <button
          type="button"
          className={classes("jump-latest")}
          data-ui-action="jump-to-latest"
          onClick={jumpToLatest}
        >
          <ArrowDown size={14} aria-hidden="true" /> Jump to latest
        </button>
      ) : null}
    </div>
  );
}

function QuickStartButton({
  label,
  detail,
  onSelect,
}: {
  readonly label: string;
  readonly detail: string;
  readonly onSelect: (prompt: string) => void;
}): ReactNode {
  const prompts: Record<string, string> = {
    "Explain a codebase": "Explain this codebase and point out the most important files to understand first.",
    "Review a change": "Review my current changes. Find correctness risks, missing tests, and anything that may regress.",
    "Draft a plan": "Help me turn this idea into a concrete implementation plan with scope, steps, and verification.",
  };
  return (
    <button
      type="button"
      className={classes("quick-start")}
      onClick={() => onSelect(prompts[label] ?? label)}
    >
      <span>
        <span className={classes("quick-start-icon")} aria-hidden="true">
          {label === "Explain a codebase" ? <Code2 size={15} /> : label === "Review a change" ? <GitPullRequest size={15} /> : <ListChecks size={15} />}
        </span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <ArrowUp size={15} aria-hidden="true" />
    </button>
  );
}

function TimelineRow({
  row,
  client,
  currentCapabilityRowIds,
  operationId,
  sessionId,
  onSnapshot,
  onError,
}: {
  readonly row: ConversationHistoryRow;
  readonly client: Client;
  readonly currentCapabilityRowIds: ReadonlySet<string>;
  readonly operationId?: string;
  readonly sessionId?: string;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onError: (message: string) => void;
}): ReactNode {
  const role = row.role === "user"
    ? "user"
    : row.role === "assistant"
      ? "assistant"
      : "system";
  const status = messageStatusLabel(row.status);
  const clipboardText = projectMessageClipboardText(row);
  return (
    <article
      className={classes(`message is-${role}${clipboardText === undefined ? "" : " has-copy-action"}`)}
      data-ui-conversation-row={row.id}
      data-ui-role={role}
    >
      {role === "user" || (role === "assistant" && status === undefined) ? null : (
        <MessageHeader
          label={row.role === "assistant" ? "Assistant" : row.role}
          meta={status}
          role={role}
        />
      )}
      <div className={classes("message-body")}>
        {groupTimelineParts(row.parts).map((group) => {
          if (group.type === "tools") {
            return <ToolActivity key={group.key} tools={group.tools} />;
          }
          const part = group.part;
          if (part.type === "reasoning") {
            return (
              <details
                key={part.key}
                className={classes("reasoning")}
                data-ui-reasoning
              >
                <summary>Reasoning</summary>
                <ConversationRichText source={part.text} />
              </details>
            );
          }
          if (part.type === "text") {
            return <ConversationRichText key={part.key} source={part.text} />;
          }
          return (
            <ResourceCard
              key={part.key}
              client={client}
              resource={part}
              {...(sessionId === undefined ? {} : { sessionId })}
              {...(part.kind === "image" ? { label: "Generated image" } : {})}
            />
          );
        })}
        {row.capabilityRequests.map((request) => (
          <CapabilityRequestCard
            key={`${row.id}:${request.operation}`}
            request={request}
            current={request.setupRequired && currentCapabilityRowIds.has(row.id)}
            {...(operationId === undefined ? {} : { operationId })}
            {...(sessionId === undefined ? {} : { sessionId })}
            client={client}
            onSnapshot={onSnapshot}
            onError={onError}
          />
        ))}
      </div>
      {clipboardText === undefined
        ? null
        : <MessageCopyAction rowId={row.id} text={clipboardText} />}
    </article>
  );
}

function PendingMessage({
  label,
  state,
  text,
  operationId,
}: {
  readonly label: string;
  readonly state: string;
  readonly text: string;
  readonly operationId?: string;
}): ReactNode {
  return (
    <article
      className={classes("pending")}
      data-ui-pending={label === "Queued follow-up" ? "queued-follow-up" : "steering"}
      data-ui-pending-state={state}
      {...(operationId === undefined
        ? {}
        : { "data-ui-pending-operation-id": operationId })}
    >
      <MessageHeader label={label} meta={state} role="status" /><p>{text}</p>
    </article>
  );
}

function MessageHeader({ label, meta, role }: {
  readonly label: string;
  readonly meta: string | undefined;
  readonly role: "user" | "assistant" | "system" | "status";
}): ReactNode {
  const avatar = role === "assistant"
    ? meta === "Working"
      ? <LoaderCircle size={14} className={classes("is-running")} />
      : <Bot size={14} />
    : role === "user"
      ? <UserRound size={14} />
      : role === "status"
        ? <LoaderCircle size={14} />
        : <CircleAlert size={14} />;
  return (
    <header className={classes("message-header")} data-ui-message-header>
      <span className={classes("message-avatar")} aria-hidden="true">{avatar}</span>
      <strong>{label}</strong>
      {meta === undefined ? null : <span className={classes("message-meta")}>{meta}</span>}
    </header>
  );
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

type TimelinePart = ConversationHistoryRow["parts"][number];
type TimelinePartGroup =
  | {
      readonly type: "part";
      readonly key: string;
      readonly part: Exclude<TimelinePart, ConversationToolPart>;
    }
  | {
      readonly type: "tools";
      readonly key: string;
      readonly tools: readonly ConversationToolPart[];
    };

function groupTimelineParts(
  parts: readonly TimelinePart[],
): readonly TimelinePartGroup[] {
  const groups: TimelinePartGroup[] = [];
  for (const part of parts) {
    if (part.type !== "tool") {
      groups.push({ type: "part", key: part.key, part });
      continue;
    }
    const previous = groups.at(-1);
    if (previous?.type === "tools") {
      groups[groups.length - 1] = {
        ...previous,
        tools: [...previous.tools, part],
      };
      continue;
    }
    groups.push({ type: "tools", key: `tools:${part.key}`, tools: [part] });
  }
  return groups;
}

function messageStatusLabel(value: string): string | undefined {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "completed" || normalized === "succeeded") return undefined;
  if (normalized.includes("run") || normalized.includes("stream")) return "Working";
  if (normalized.includes("fail") || normalized.includes("error")) return "Failed";
  return stateLabel(value);
}
