import {
  Check,
  ChevronDown,
  Crown,
  MessageSquarePlus,
  MessagesSquare,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import {
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  Action,
  RecentSessionRow,
  Snapshot,
} from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";
import { SessionRow } from "./session-row.js";

export function Sidebar({
  snapshot,
  dispatch,
  pendingActionTypes,
  drawerOpen,
  navigationRef,
  onKeyDown,
  onNavigate,
  onGroupCreated,
  openSettings,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
  readonly pendingActionTypes: ReadonlySet<Action["type"]>;
  readonly drawerOpen: boolean;
  readonly navigationRef: RefObject<HTMLElement | null>;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly onNavigate: () => void;
  readonly onGroupCreated: (mode: "discussion" | "coordinated") => void;
  readonly openSettings: () => void;
}): ReactNode {
  const state = snapshot.view;
  const [search, setSearch] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMode, setGroupMode] = useState<"discussion" | "coordinated">("coordinated");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | undefined>();
  const [editingSessionId, setEditingSessionId] = useState<string | undefined>();
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const activeSessions = matchingSessions(state.recentSessions, normalizedSearch);
  const archivedSessions = matchingSessions(state.archivedSessions, normalizedSearch);
  const groups = snapshot.team.conversations.filter((conversation) =>
    normalizedSearch.length === 0 ||
    conversation.title.toLocaleLowerCase().includes(normalizedSearch),
  );
  const searching = normalizedSearch.length > 0;
  const matchCount = activeSessions.length + archivedSessions.length + groups.length;
  const archivedSectionOpen = searching
    ? archivedSessions.length > 0
    : archivedOpen;
  const canCreateDiscussion =
    snapshot.team.availability?.capabilities.canCreateDiscussion === true;
  const canCreateCoordinated =
    snapshot.team.availability?.capabilities.canCreateCoordinated === true;

  function setSessionMenu(sessionId: string, open: boolean): void {
    setOpenMenuSessionId(open ? sessionId : undefined);
    if (open) setEditingSessionId(undefined);
  }

  async function createGroup(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const title = groupTitle.trim();
    if (title.length === 0 || pendingActionTypes.has("create-team-conversation")) return;
    const created = await dispatch({
      type: "create-team-conversation",
      input: {
        mode: groupMode,
        title,
        idempotencyKey: `team-create:${createRequestId()}`,
      },
    });
    if (!created) return;
    setGroupTitle("");
    setCreatingGroup(false);
    onNavigate();
    onGroupCreated(groupMode);
  }

  return (
    <aside
      ref={navigationRef}
      id="conversation-navigation"
      className={classes("sidebar")}
      aria-label="Conversation navigation"
      role={drawerOpen ? "dialog" : undefined}
      aria-modal={drawerOpen ? "true" : undefined}
      data-ui-session-drawer
      data-ui-drawer-open={drawerOpen ? "true" : "false"}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={classes("new-button")}
        data-ui-initial-focus
        onClick={() => {
          onNavigate();
          void dispatch({ type: "start-new-conversation" });
        }}
      >
        <MessageSquarePlus size={16} /> New conversation
      </button>
      <label className={classes("session-search")}>
        <Search size={15} aria-hidden="true" />
        <span className={classes("sr-only")}>Search conversations and groups</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          aria-label="Search conversations and groups"
        />
      </label>
      <div className={classes("session-library")} data-ui-session-list>
        <section aria-labelledby="groups-heading" data-ui-team-list>
          <div className={classes("sidebar-heading")} id="groups-heading">
            <span>Groups</span>
            <span className={classes("sidebar-heading-actions")}>
              <span>{groups.length}</span>
              {canCreateDiscussion || canCreateCoordinated ? (
                <button
                  type="button"
                  aria-label="New group"
                  title="New group"
                  onClick={() => {
                    setGroupMode(canCreateCoordinated ? "coordinated" : "discussion");
                    setCreatingGroup(true);
                  }}
                >
                  <Plus size={13} />
                </button>
              ) : null}
            </span>
          </div>
          {creatingGroup ? (
            <form className={classes("group-create")} onSubmit={(event) => void createGroup(event)}>
              <div className={classes("group-create-row")}>
                {groupMode === "coordinated"
                  ? <Crown size={14} aria-hidden="true" />
                  : <UsersRound size={14} aria-hidden="true" />}
                <input
                  autoFocus
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  placeholder="Group name"
                  aria-label="Group name"
                  disabled={pendingActionTypes.has("create-team-conversation")}
                />
                <button
                  type="submit"
                  aria-label="Create group"
                  title="Create group"
                  disabled={groupTitle.trim().length === 0 || pendingActionTypes.has("create-team-conversation")}
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel new group"
                  title="Cancel"
                  onClick={() => {
                    setGroupTitle("");
                    setCreatingGroup(false);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <fieldset className={classes("group-mode-selector")} data-ui-team-create-mode>
                <legend className={classes("sr-only")}>Group mode</legend>
                <label>
                  <input
                    type="radio"
                    name="group-mode"
                    value="coordinated"
                    checked={groupMode === "coordinated"}
                    disabled={!canCreateCoordinated || pendingActionTypes.has("create-team-conversation")}
                    onChange={() => setGroupMode("coordinated")}
                  />
                  <Crown size={12} aria-hidden="true" />
                  <span>Coordinated</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="group-mode"
                    value="discussion"
                    checked={groupMode === "discussion"}
                    disabled={!canCreateDiscussion || pendingActionTypes.has("create-team-conversation")}
                    onChange={() => setGroupMode("discussion")}
                  />
                  <MessagesSquare size={12} aria-hidden="true" />
                  <span>Discussion</span>
                </label>
              </fieldset>
            </form>
          ) : null}
          <ul className={classes("session-list group-list")} aria-label="Groups">
            {groups.map((conversation) => {
              const selected = state.selection?.kind === "team" &&
                state.selection.conversationId === conversation.conversationId;
              return (
                <li key={conversation.conversationId}>
                  <button
                    type="button"
                    className={classes(`group-row ${selected ? "is-selected" : ""}`)}
                    data-ui-team-row
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      onNavigate();
                      void dispatch({
                        type: "select-team-conversation",
                        conversationId: conversation.conversationId,
                      });
                    }}
                  >
                    {conversation.mode === "coordinated"
                      ? <Crown size={14} aria-label="Coordinated group" />
                      : <UsersRound size={14} aria-label="Discussion group" />}
                    <span>{conversation.title}</span>
                    {conversation.activeRound ? (
                      <span className={classes("group-live-dot")} title="Agents responding" aria-label="Agents responding" />
                    ) : (
                      <small>{conversation.activeAgentCount}</small>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {!creatingGroup && !searching && groups.length === 0 ? (
            <p className={classes("session-empty")} data-ui-team-empty>
              {snapshot.team.state === "unavailable" ? "Groups unavailable" : "No groups yet"}
            </p>
          ) : null}
        </section>
        <section aria-labelledby="active-conversations-heading">
          <div className={classes("sidebar-heading")} id="active-conversations-heading">
            <span>Conversations</span><span>{activeSessions.length}</span>
          </div>
          <ul className={classes("session-list")} aria-label="Active conversations">
            {activeSessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                dispatch={dispatch}
                pendingActionTypes={pendingActionTypes}
                menuOpen={openMenuSessionId === session.sessionId}
                editing={editingSessionId === session.sessionId}
                setMenuOpen={(open) => setSessionMenu(session.sessionId, open)}
                beginRename={() => {
                  setOpenMenuSessionId(undefined);
                  setEditingSessionId(session.sessionId);
                }}
                finishRename={() => setEditingSessionId(undefined)}
                onSelect={() => {
                  onNavigate();
                  void dispatch({
                    type: "select-session",
                    sessionId: session.sessionId,
                  });
                }}
              />
            ))}
          </ul>
          {!searching && activeSessions.length === 0 ? (
            <p className={classes("session-empty")} data-ui-session-empty>No conversations yet</p>
          ) : null}
        </section>
        {state.archivedSessions.length > 0 ? (
          <details
            className={classes("archived-sessions")}
            data-ui-archived-sessions
            open={archivedSectionOpen}
            onToggle={(event) => {
              if (!searching) setArchivedOpen(event.currentTarget.open);
            }}
          >
            <summary>
              <span><ChevronDown size={13} aria-hidden="true" /> Archived</span>
              <span>{archivedSessions.length}</span>
            </summary>
            <ul className={classes("session-list")} aria-label="Archived conversations">
              {archivedSessions.map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  dispatch={dispatch}
                  pendingActionTypes={pendingActionTypes}
                  menuOpen={openMenuSessionId === session.sessionId}
                  editing={false}
                  setMenuOpen={(open) => setSessionMenu(session.sessionId, open)}
                />
              ))}
            </ul>
          </details>
        ) : null}
        {searching && matchCount === 0 ? (
          <p className={classes("session-empty")} data-ui-session-empty>No matches</p>
        ) : null}
      </div>
      <button
        type="button"
        className={classes("settings-button")}
        data-ui-action="open-settings"
        onClick={() => {
          onNavigate();
          openSettings();
        }}
      >
        <SlidersHorizontal size={16} /> Settings
      </button>
    </aside>
  );
}

function createRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("The browser client requires crypto.randomUUID");
  }
  return randomUuid.call(globalThis.crypto);
}

function matchingSessions(
  sessions: readonly RecentSessionRow[],
  normalizedSearch: string,
): readonly RecentSessionRow[] {
  return normalizedSearch.length === 0
    ? sessions
    : sessions.filter((session) =>
        session.label.toLocaleLowerCase().includes(normalizedSearch),
      );
}
