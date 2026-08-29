import {
  Bot,
  Check,
  CircleStop,
  Crown,
  MessagesSquare,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  Action,
  Snapshot,
} from "../../application/model.js";
import type { TeamParticipantReadModel } from "@wanex/assistant/surface";
import type { DispatchAction } from "../shared/action.js";
import { IconButton } from "../shared/icon-button.js";
import { classes } from "../classes.js";

export function TeamContext({
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
  const page = snapshot.team.page;
  const conversationId = snapshot.team.conversationId;
  const candidates = snapshot.view.recentSessions.filter((session) => !session.archived);
  const [closeConfirmation, setCloseConfirmation] = useState(false);
  const [coordinatorError, setCoordinatorError] = useState<string>();
  const coordinatorParticipantId = page?.conversation.coordinatorParticipantId;

  useEffect(() => {
    setCloseConfirmation(false);
    setCoordinatorError(undefined);
  }, [conversationId, coordinatorParticipantId]);

  if (page === undefined || conversationId === undefined) {
    return (
      <aside className={classes("context-panel")} aria-label="Group details">
        <PanelHeader title="Group details" onClose={onClose} />
        <p className={classes("context-note")}>Select an available group to manage its agents.</p>
      </aside>
    );
  }

  const participantBusy = pendingActionTypes.has("add-team-participant") ||
    pendingActionTypes.has("update-team-participant");
  const coordinatorBusy = pendingActionTypes.has("set-team-coordinator");
  const coordinator = page.participants.find(
    (participant) => participant.participantId === coordinatorParticipantId,
  );

  return (
    <aside className={classes("context-panel team-context")} aria-label="Group details" data-ui-team-context>
      <PanelHeader title={page.conversation.title} onClose={onClose} />
      <div className={classes("team-context-summary")}>
        <span className={classes("team-mode-label")}>
          {page.conversation.mode === "coordinated"
            ? <Crown size={12} aria-hidden="true" />
            : <MessagesSquare size={12} aria-hidden="true" />}
          {page.conversation.mode === "coordinated" ? "Coordinated" : "Discussion"}
        </span>
        <span>{page.conversation.activeAgentCount} active agent{page.conversation.activeAgentCount === 1 ? "" : "s"}</span>
        <span>{page.conversation.activeRound ? "Round in progress" : "Ready"}</span>
      </div>

      {page.conversation.mode === "coordinated" ? (
        <section className={classes("team-context-section team-coordinator-section")} aria-labelledby="team-coordinator-heading">
          <div className={classes("team-context-heading")}>
            <h3 id="team-coordinator-heading">Coordinator</h3>
            <span>{coordinator === undefined ? "Required" : "Assigned"}</span>
          </div>
          <div className={classes("team-coordinator-status")} data-ui-team-coordinator>
            <Crown size={14} aria-hidden="true" />
            <strong>{coordinator?.displayName ?? "Not assigned"}</strong>
          </div>
          {coordinatorError === undefined ? null : (
            <p className={classes("team-coordinator-error")} role="alert">
              {coordinatorError}
            </p>
          )}
        </section>
      ) : null}

      <section className={classes("team-context-section")} aria-labelledby="team-participants-heading">
        <div className={classes("team-context-heading")}>
          <h3 id="team-participants-heading">Participants</h3>
          <span>{page.participants.length}</span>
        </div>
        <ul className={classes("team-participant-list")}>
          {page.participants.map((participant) => (
            <ParticipantRow
              key={participant.participantId}
              participant={participant}
              conversationId={conversationId}
              busy={participantBusy}
              coordinatorBusy={coordinatorBusy}
              coordinated={page.conversation.mode === "coordinated"}
              coordinatorParticipantId={coordinatorParticipantId}
              onAssignCoordinator={(participantId) => {
                setCoordinatorError(undefined);
                void dispatch({
                  type: "set-team-coordinator",
                  input: {
                    conversationId,
                    expectedCoordinatorParticipantId: coordinatorParticipantId ?? null,
                    coordinatorParticipantId: participantId,
                  },
                }).then((succeeded) => {
                  if (!succeeded) {
                    setCoordinatorError("Coordinator changed elsewhere. Review the current group and try again.");
                  }
                });
              }}
              dispatch={dispatch}
            />
          ))}
        </ul>
      </section>

      <section className={classes("team-context-section")} aria-labelledby="add-agent-heading">
        <div className={classes("team-context-heading")}>
          <h3 id="add-agent-heading">Add an existing agent</h3>
        </div>
        {candidates.length === 0 ? (
          <p className={classes("context-note")}>Create an agent conversation before adding it to this group.</p>
        ) : (
          <form
            className={classes("team-add-agent")}
            onSubmit={(event) => {
              event.preventDefault();
              const selected = event.currentTarget.elements.namedItem("agentSessionId");
              const candidate = selected instanceof HTMLSelectElement
                ? candidates.find((session) => session.sessionId === selected.value)
                : undefined;
              if (candidate === undefined || participantBusy) return;
              void dispatch({
                type: "add-team-participant",
                input: {
                  conversationId,
                  agentSessionId: candidate.sessionId,
                  displayName: candidate.label,
                  idempotencyKey: `team-participant:${conversationId}:${candidate.sessionId}`,
                },
              });
            }}
          >
            <select
              key={conversationId}
              name="agentSessionId"
              defaultValue={candidates[0]?.sessionId ?? ""}
              aria-label="Agent conversation"
              disabled={participantBusy}
            >
              {candidates.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>{session.label}</option>
              ))}
            </select>
            <button type="submit" disabled={candidates.length === 0 || participantBusy}>
              <UserPlus size={14} /> Add
            </button>
          </form>
        )}
      </section>

      <section className={classes("team-context-section team-danger-zone")} aria-labelledby="group-actions-heading">
        <div className={classes("team-context-heading")}>
          <h3 id="group-actions-heading">Group actions</h3>
        </div>
        {closeConfirmation ? (
          <div className={classes("team-close-confirmation")}>
            <p>Close this group? Its history remains available in storage.</p>
            <div>
              <button
                type="button"
                onClick={() => setCloseConfirmation(false)}
                disabled={pendingActionTypes.has("close-team-conversation")}
              >
                <X size={14} /> Keep open
              </button>
              <button
                type="button"
                className={classes("is-danger")}
                disabled={pendingActionTypes.has("close-team-conversation")}
                onClick={() => void dispatch({
                  type: "close-team-conversation",
                  input: { conversationId },
                }).then((closed) => {
                  if (closed) onClose();
                })}
              >
                <Check size={14} /> Close group
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={classes("team-close-button")}
            onClick={() => setCloseConfirmation(true)}
          >
            <CircleStop size={14} /> Close group
          </button>
        )}
      </section>
    </aside>
  );
}

function ParticipantRow({
  participant,
  conversationId,
  busy,
  coordinatorBusy,
  coordinated,
  coordinatorParticipantId,
  onAssignCoordinator,
  dispatch,
}: {
  readonly participant: TeamParticipantReadModel;
  readonly conversationId: string;
  readonly busy: boolean;
  readonly coordinatorBusy: boolean;
  readonly coordinated: boolean;
  readonly coordinatorParticipantId: string | undefined;
  readonly onAssignCoordinator: (participantId: string) => void;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const mayManage = participant.kind === "agent" && participant.state !== "left";
  const isCoordinator = participant.participantId === coordinatorParticipantId;
  const mayCoordinate = coordinated && participant.kind === "agent" &&
    participant.state === "active" && !isCoordinator;
  const stateLabel = isCoordinator
    ? participant.role === undefined ? "Coordinator" : `Coordinator · ${participant.role}`
    : participant.role ?? participant.state;
  return (
    <li
      data-ui-team-participant-state={participant.state}
      data-ui-team-coordinator={isCoordinator ? "true" : undefined}
    >
      <span className={classes("team-participant-icon")} aria-hidden="true"><Bot size={14} /></span>
      <span className={classes("team-participant-copy")}>
        <strong>{participant.displayName}</strong>
        <small>{stateLabel}</small>
      </span>
      {mayManage ? (
        <span className={classes("team-participant-actions")}>
          {mayCoordinate ? (
            <IconButton
              label={`Make ${participant.displayName} coordinator`}
              disabled={coordinatorBusy}
              onClick={() => onAssignCoordinator(participant.participantId)}
            >
              <Crown size={14} />
            </IconButton>
          ) : null}
          <IconButton
            label={isCoordinator
              ? `Reassign the coordinator before muting ${participant.displayName}`
              : participant.state === "active"
                ? `Mute ${participant.displayName}`
                : `Reactivate ${participant.displayName}`}
            disabled={busy || isCoordinator}
            onClick={() => void dispatch({
              type: "update-team-participant",
              input: {
                conversationId,
                participantId: participant.participantId,
                state: participant.state === "active" ? "muted" : "active",
              },
            })}
          >
            {participant.state === "active" ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </IconButton>
          <IconButton
            label={isCoordinator
              ? `Reassign the coordinator before removing ${participant.displayName}`
              : `Remove ${participant.displayName}`}
            disabled={busy || isCoordinator}
            onClick={() => void dispatch({
              type: "update-team-participant",
              input: {
                conversationId,
                participantId: participant.participantId,
                state: "left",
              },
            })}
          >
            <UserMinus size={14} />
          </IconButton>
        </span>
      ) : null}
    </li>
  );
}

function PanelHeader({ title, onClose }: {
  readonly title: string;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <div className={classes("context-panel-header")}>
      <div><span className={classes("eyebrow")}>Group</span><h2>{title}</h2></div>
      <IconButton label="Close group details" onClick={onClose}><X size={17} /></IconButton>
    </div>
  );
}
