import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CircleAlert,
  CircleDashed,
  LoaderCircle,
  MessageSquare,
  Minus,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Snapshot,
} from "../../application/model.js";
import type {
  TeamDeliveryReadModel,
  TeamConversationSummary,
  TeamMessageReadModel,
  TeamParticipantReadModel,
  TeamRoundReadModel,
} from "@wanex/assistant/surface";
import type { Client } from "../../client/contracts.js";
import { ConversationRichText } from "../conversation/content.js";
import { useConversationScrollOwnership } from "../conversation/scroll.js";
import { ResourceCard } from "../resources/card.js";
import type { DispatchAction } from "../shared/action.js";
import { classes } from "../classes.js";

export function TeamTimeline({
  snapshot,
  dispatch,
  client,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly client: Client;
}): ReactNode {
  const team = snapshot.team;
  const page = team.page;
  const canonicalRevision = page === undefined
    ? team.state
    : [
        page.messages.map((row) => `${row.messageId}:${row.updatedAt}:${row.status}`).join(","),
        page.rounds.map((row) => `${row.roundId}:${row.updatedAt}:${row.status}`).join(","),
        page.deliveries.map((row) => `${row.deliveryId}:${row.updatedAt}:${row.status}`).join(","),
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
    sessionKey: team.conversationId ?? "no-team",
    canonicalRevision,
  });
  const [historyLoadState, setHistoryLoadState] = useState<"idle" | "loading" | "failed">("idle");
  const [historyLoadError, setHistoryLoadError] = useState<string>();
  const participants = useMemo(
    () => new Map(page?.participants.map((participant) => [participant.participantId, participant])),
    [page?.participants],
  );

  useEffect(() => {
    setHistoryLoadState("idle");
    setHistoryLoadError(undefined);
  }, [team.conversationId]);

  async function loadEarlierHistory(): Promise<void> {
    const conversationId = team.conversationId;
    const cursor = page?.nextCursor;
    if (conversationId === undefined || cursor === undefined || historyLoadState === "loading") return;
    setHistoryLoadState("loading");
    setHistoryLoadError(undefined);
    prepareForHistoryPrepend();
    const loaded = await dispatch({
      type: "load-earlier-team-history",
      input: { conversationId, cursor, limit: 50 },
    });
    if (loaded) {
      setHistoryLoadState("idle");
      return;
    }
    cancelHistoryPrepend();
    setHistoryLoadState("failed");
    setHistoryLoadError("Earlier group messages could not be loaded");
  }

  return (
    <div className={classes("timeline-frame team-timeline-frame")}>
      <div
        ref={viewportRef}
        className={classes("timeline team-timeline")}
        role="log"
        aria-label="Group messages"
        aria-live="polite"
        aria-relevant="additions text"
        data-ui-team-timeline
        data-ui-team-state={team.state}
        onScroll={handleScroll}
      >
        <div ref={contentRef} className={classes("timeline-content team-timeline-content")}>
          {page?.nextCursor === undefined ? null : (
            <div className={classes("history-loader")} data-ui-team-history-loader>
              <button
                type="button"
                disabled={historyLoadState === "loading"}
                onClick={() => void loadEarlierHistory()}
              >
                {historyLoadState === "loading"
                  ? <LoaderCircle size={14} className={classes("is-running")} />
                  : <ArrowUp size={14} />}
                {historyLoadState === "loading" ? "Loading earlier messages" : "Load earlier messages"}
              </button>
              {historyLoadError === undefined ? null : <span role="alert">{historyLoadError}</span>}
            </div>
          )}
          {team.state !== "ready" || page === undefined ? (
            <TeamUnavailable state={team.state} message={team.message} />
          ) : page.messages.length === 0 ? (
            <div className={classes("team-empty")}>
              <span aria-hidden="true"><MessageSquare size={20} /></span>
              <h2>Start the group conversation</h2>
              <p>{page.conversation.mode === "coordinated"
                ? "The coordinator returns one answer and may delegate internally."
                : "Messages are shared with every active agent in this group."}</p>
            </div>
          ) : (
            page.messages.map((message) => (
              <TeamMessage
                key={message.messageId}
                message={message}
                mode={page.conversation.mode}
                participant={participants.get(message.authorParticipantId)}
                participants={participants}
                rounds={page.rounds}
                deliveries={page.deliveries}
                client={client}
              />
            ))
          )}
        </div>
      </div>
      {showJumpToLatest ? (
        <button type="button" className={classes("jump-latest")} onClick={jumpToLatest}>
          <ArrowDown size={14} aria-hidden="true" /> Jump to latest
        </button>
      ) : null}
    </div>
  );
}

function TeamMessage({
  message,
  mode,
  participant,
  participants,
  rounds,
  deliveries,
  client,
}: {
  readonly message: TeamMessageReadModel;
  readonly mode: TeamConversationSummary["mode"];
  readonly participant: TeamParticipantReadModel | undefined;
  readonly participants: ReadonlyMap<string, TeamParticipantReadModel>;
  readonly rounds: readonly TeamRoundReadModel[];
  readonly deliveries: readonly TeamDeliveryReadModel[];
  readonly client: Client;
}): ReactNode {
  const authorKind = participant?.kind ?? "system";
  const round = rounds.find((candidate) => candidate.sourceMessageId === message.messageId);
  const roundDeliveries = round === undefined
    ? []
    : deliveries.filter((delivery) => delivery.roundId === round.roundId);
  return (
    <article
      className={classes(`team-message is-${authorKind}`)}
      data-ui-team-message
      data-ui-team-message-status={message.status}
    >
      <header className={classes("team-message-header")}>
        <span className={classes("team-message-avatar")} aria-hidden="true">
          {authorKind === "agent" ? <Bot size={14} /> : authorKind === "user" ? <UserRound size={14} /> : <CircleAlert size={14} />}
        </span>
        <strong>{participant?.displayName ?? participantLabel(authorKind)}</strong>
        <span>{messageStatusLabel(message.status)}</span>
      </header>
      <div className={classes("message-body team-message-body")}>
        {message.content.map((part) => part.type === "text"
          ? <ConversationRichText key={part.partId} source={part.text} />
          : <ResourceCard key={part.partId} client={client} resource={part} />)}
      </div>
      {round === undefined ? null : (
        <RoundProgress
          round={round}
          mode={mode}
          deliveries={roundDeliveries}
          participants={participants}
        />
      )}
    </article>
  );
}

function RoundProgress({
  round,
  mode,
  deliveries,
  participants,
}: {
  readonly round: TeamRoundReadModel;
  readonly mode: TeamConversationSummary["mode"];
  readonly deliveries: readonly TeamDeliveryReadModel[];
  readonly participants: ReadonlyMap<string, TeamParticipantReadModel>;
}): ReactNode {
  return (
    <div className={classes(`team-round is-${round.status}`)} data-ui-team-round-status={round.status}>
      <div className={classes("team-round-summary")}>
        <RoundStatusIcon status={round.status} />
        <span>{roundStatusLabel(round, mode)}</span>
      </div>
      <ul className={classes("team-deliveries")} aria-label="Agent responses">
        {deliveries.map((delivery) => (
          <li key={delivery.deliveryId} data-ui-team-delivery-status={delivery.status}>
            <DeliveryStatusIcon status={delivery.status} />
            <span>{participants.get(delivery.participantId)?.displayName ?? "Agent"}</span>
            <small>{deliveryStatusLabel(delivery.status)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamUnavailable({ state, message }: {
  readonly state: Snapshot["team"]["state"];
  readonly message: string | undefined;
}): ReactNode {
  return (
    <div className={classes("team-empty")}>
      <span aria-hidden="true"><CircleAlert size={20} /></span>
      <h2>{state === "no-selection" ? "Choose a group" : "Group unavailable"}</h2>
      <p>{message ?? (state === "no-selection" ? "Select or create a group from the sidebar." : "This group could not be loaded.")}</p>
    </div>
  );
}

function RoundStatusIcon({ status }: { readonly status: TeamRoundReadModel["status"] }): ReactNode {
  if (status === "running") return <LoaderCircle size={13} className={classes("is-running")} />;
  if (status === "completed") return <Check size={13} />;
  if (status === "failed") return <CircleAlert size={13} />;
  if (status === "cancelled") return <X size={13} />;
  return <Minus size={13} />;
}

function DeliveryStatusIcon({ status }: { readonly status: TeamDeliveryReadModel["status"] }): ReactNode {
  if (status === "responding") return <LoaderCircle size={12} className={classes("is-running")} />;
  if (status === "replied") return <Check size={12} />;
  if (status === "failed") return <CircleAlert size={12} />;
  if (status === "cancelled") return <X size={12} />;
  if (status === "passed") return <Minus size={12} />;
  return <CircleDashed size={12} />;
}

function roundStatusLabel(
  round: TeamRoundReadModel,
  mode: TeamConversationSummary["mode"],
): string {
  if (mode === "coordinated") {
    if (round.status === "running") return "Coordinator is responding";
    if (round.status === "completed") {
      return round.replied > 0 ? "Coordinator replied" : "Coordinator passed";
    }
    if (round.status === "partial") return "Coordinator did not finish";
    if (round.status === "failed") return "Coordinator response failed";
    return "Coordinator response cancelled";
  }
  if (round.status === "running") return `${round.replied + round.passed} of ${round.expected} agents finished`;
  if (round.status === "completed") return `${round.replied} replied${round.passed === 0 ? "" : `, ${round.passed} passed`}`;
  if (round.status === "partial") return `${round.replied} replied, ${round.failed + round.cancelled} did not finish`;
  return round.status === "failed" ? "Round failed" : "Round cancelled";
}

function messageStatusLabel(status: TeamMessageReadModel["status"]): string {
  if (status === "sent") return "Sent";
  if (status === "queued") return "Queued";
  if (status === "failed") return "Failed";
  return "Superseded";
}

function deliveryStatusLabel(status: TeamDeliveryReadModel["status"]): string {
  return status === "responding" ? "Responding" : status.charAt(0).toUpperCase() + status.slice(1);
}

function participantLabel(kind: TeamParticipantReadModel["kind"]): string {
  if (kind === "agent") return "Agent";
  if (kind === "user") return "You";
  if (kind === "tool") return "Tool";
  return "System";
}
