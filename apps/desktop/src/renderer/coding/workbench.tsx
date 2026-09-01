import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleStop,
  Code2,
  FileDiff,
  FolderOpen,
  LoaderCircle,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  CodingLiveTurnReadModel,
  CodingProjectReadModel,
  CodingTranscriptMessageReadModel,
  CodingTranscriptPartReadModel,
} from "@wanex/coding";
import type { RemoteConnectionProfile } from "../../remote/profile.js";
import type { DesktopRemoteRendererBridge } from "../../remote/bridge.js";
import {
  CodingWorkbenchController,
  type CodingWorkbenchState,
  type CodingWorkbenchClient,
} from "./controller.js";
import {
  RemoteProfileForm,
  type RemoteProfileFormValue,
} from "./remote-profile-form.js";

export type RemoteProfileClient = Pick<
  DesktopRemoteRendererBridge,
  "listProfiles" | "saveProfile" | "removeProfile"
>;

export function CodingWorkbench({
  client,
  remoteClient,
}: {
  readonly client: CodingWorkbenchClient;
  readonly remoteClient: RemoteProfileClient | undefined;
}): ReactNode {
  const controller = useMemo(
    () => new CodingWorkbenchController(client),
    [client],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    () => controller.state,
    () => controller.state,
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | undefined>();
  const [remoteProfiles, setRemoteProfiles] = useState<readonly RemoteConnectionProfile[] | undefined>();
  const [remoteProjects, setRemoteProjects] = useState<readonly CodingProjectReadModel[]>([]);
  const [remoteProfileId, setRemoteProfileId] = useState<string | undefined>();
  const [remoteError, setRemoteError] = useState<string | undefined>();
  const [showRemoteForm, setShowRemoteForm] = useState(false);
  const [editingRemoteProfile, setEditingRemoteProfile] = useState<RemoteConnectionProfile | undefined>();
  const [removeRemoteProfileId, setRemoveRemoteProfileId] = useState<string | undefined>();
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const reviewAvailable = state.turn !== undefined || state.proposal !== undefined;
  const reviewAttention =
    state.project?.state === "attention" ||
    (state.turn?.approvals.totalCount ?? 0) > 0 ||
    (state.turn?.recovery.totalCount ?? 0) > 0 ||
    state.proposal !== undefined;

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    setSessionsOpen(false);
    setInspectorOpen(false);
  }, [state.project?.projectId]);

  useEffect(() => {
    if (reviewAttention) setInspectorOpen(true);
  }, [reviewAttention]);

  useEffect(() => {
    if (!sessionsOpen && !inspectorOpen && remoteProfiles === undefined) return;
    function closeTopLayer(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (remoteProfiles !== undefined) {
        closeRemoteProjects();
        return;
      }
      if (inspectorOpen) {
        setInspectorOpen(false);
        return;
      }
      setSessionsOpen(false);
    }
    document.addEventListener("keydown", closeTopLayer);
    return () => document.removeEventListener("keydown", closeTopLayer);
  }, [inspectorOpen, remoteProfiles, sessionsOpen]);

  async function run(key: string, action: () => Promise<void>): Promise<void> {
    if (pending !== undefined) return;
    setPending(key);
    try {
      await action();
    } finally {
      setPending(undefined);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (draft.trim().length === 0) return;
    void run("turn.start", async () => {
      const accepted = await controller.startTurn(draft);
      if (accepted) setDraft("");
    });
  }

  async function loadRemoteProjects(profileId: string): Promise<void> {
    setRemoteError(undefined);
    setRemoteProfileId(profileId);
    setRemoteProjects((await controller.listRemoteProjects(profileId)).projects);
  }

  async function loadRemoteProfiles(): Promise<void> {
    setRemoteError(undefined);
    const profiles = remoteClient === undefined
      ? await controller.listRemoteProfiles()
      : await remoteClient.listProfiles();
    setRemoteProfiles(profiles);
    const first = profiles[0];
    if (first === undefined) {
      setRemoteProfileId(undefined);
      setRemoteProjects([]);
      return;
    }
    await loadRemoteProjects(remoteProfileId !== undefined && profiles.some((profile) => profile.profileId === remoteProfileId)
      ? remoteProfileId
      : first.profileId);
  }

  function openRemoteForm(profile?: RemoteConnectionProfile): void {
    setEditingRemoteProfile(profile);
    setShowRemoteForm(true);
    setRemoveRemoteProfileId(undefined);
    setRemoteError(undefined);
  }

  function closeRemoteProjects(): void {
    setRemoteProfiles(undefined);
    setRemoteProjects([]);
    setShowRemoteForm(false);
    setEditingRemoteProfile(undefined);
    setRemoveRemoteProfileId(undefined);
    setRemoteError(undefined);
  }

  async function saveRemoteProfile(input: RemoteProfileFormValue): Promise<void> {
    if (remoteClient === undefined) throw new Error("Remote profile management is unavailable");
    const saved = await remoteClient.saveProfile(input);
    setShowRemoteForm(false);
    setEditingRemoteProfile(undefined);
    const profiles = await remoteClient.listProfiles();
    setRemoteProfiles(profiles);
    setRemoteProfileId(saved.profileId);
    setRemoteProjects([]);
    await loadRemoteProjects(saved.profileId);
  }

  async function removeRemoteProfile(profileId: string): Promise<void> {
    if (remoteClient === undefined) throw new Error("Remote profile management is unavailable");
    await remoteClient.removeProfile(profileId);
    setRemoteProfiles((profiles) => profiles?.filter((profile) => profile.profileId !== profileId));
    setRemoteProfileId(undefined);
    setRemoteProjects([]);
    setEditingRemoteProfile(undefined);
    setRemoveRemoteProfileId(undefined);
  }

  if (state.project === undefined) {
    return (
      <main className="coding-shell coding-start" data-ui-coding-shell data-ui-coding-state={state.status}>
        <section className="coding-welcome" aria-labelledby="coding-welcome-title">
          <div className="coding-welcome-icon"><Code2 size={21} aria-hidden="true" /></div>
          <h1 id="coding-welcome-title">Choose a project</h1>
          <p>Open a project on this device or connect to a trusted server.</p>
          <div className="coding-welcome-actions">
            <button
              type="button"
              className="primary-button"
              data-ui-coding-action="open-project"
              onClick={() => void run("project.open", () => controller.openProject())}
              disabled={pending !== undefined}
            >
              {pending === "project.open" ? <LoaderCircle className="spin" size={16} /> : <FolderOpen size={16} />}
              Open local project
            </button>
            <button
              type="button"
              className="quiet-button"
              data-ui-coding-action="list-remote-projects"
              onClick={() => void run("remote.projects", async () => {
                try {
                  await loadRemoteProfiles();
                } catch (error) {
                  setRemoteError(error instanceof Error ? error.message : "Remote projects are unavailable");
                }
              })}
              disabled={pending !== undefined}
            >
              <Server size={16} /> Connect server
            </button>
          </div>
        </section>
        {state.error === undefined ? null : <ErrorNotice message={state.error} />}
        {remoteProfiles === undefined ? null : (
          <div className="connection-overlay">
            <button type="button" className="connection-backdrop" aria-label="Close server projects" onClick={closeRemoteProjects} />
            <section className="coding-remote-picker" data-ui-coding-remote-picker role="dialog" aria-modal="true" aria-labelledby="server-projects-title">
              <header className="connection-header">
                <div>
                  <h2 id="server-projects-title">Server projects</h2>
                  <p>Choose a saved server and project.</p>
                </div>
                <button type="button" className="connection-close" aria-label="Close server projects" title="Close" onClick={closeRemoteProjects}><X size={16} /></button>
              </header>
            {remoteError === undefined ? null : <ErrorNotice message={remoteError} />}
            {remoteClient !== undefined ? (
              <div className="remote-profile-actions">
                <button type="button" className="quiet-button" data-ui-remote-profile-action="add" onClick={() => openRemoteForm()} disabled={pending !== undefined}><Plus size={14} /> Add server</button>
                {remoteProfileId === undefined ? null : (
                  <>
                    <button type="button" className="quiet-button" data-ui-remote-profile-action="edit" onClick={() => openRemoteForm(remoteProfiles.find((profile) => profile.profileId === remoteProfileId))} disabled={pending !== undefined}><Pencil size={14} /> Edit</button>
                    {removeRemoteProfileId === remoteProfileId ? (
                      <>
                        <button type="button" className="quiet-button danger-button" data-ui-remote-profile-action="confirm-remove" onClick={() => void run("remote.profile.remove", async () => {
                          try {
                            await removeRemoteProfile(remoteProfileId);
                          } catch (error) {
                            setRemoteError(error instanceof Error ? error.message : "Remote server could not be removed");
                          }
                        })} disabled={pending !== undefined}><Trash2 size={14} /> Remove server</button>
                        <button type="button" className="quiet-button" data-ui-remote-profile-action="cancel-remove" onClick={() => setRemoveRemoteProfileId(undefined)} disabled={pending !== undefined}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="quiet-button" data-ui-remote-profile-action="remove" onClick={() => setRemoveRemoteProfileId(remoteProfileId)} disabled={pending !== undefined}><Trash2 size={14} /> Remove</button>
                    )}
                  </>
                )}
              </div>
            ) : null}
            {showRemoteForm && remoteClient !== undefined ? (
              <RemoteProfileForm
                profile={editingRemoteProfile}
                pending={pending !== undefined}
                onCancel={() => {
                  setShowRemoteForm(false);
                  setEditingRemoteProfile(undefined);
                }}
                onSave={(input) => void run("remote.profile.save", async () => {
                  try {
                    await saveRemoteProfile(input);
                  } catch (error) {
                    setRemoteError(error instanceof Error ? error.message : "Remote server could not be saved");
                  }
                })}
              />
            ) : null}
            {remoteProfiles.length === 0 ? <p className="muted-copy">No saved servers.</p> : (
              <>
                <label className="remote-profile-select">
                  <span>Server</span>
                  <select
                    value={remoteProfileId ?? ""}
                    onChange={(event) => {
                      const nextProfileId = event.target.value;
                      setRemoteProfileId(nextProfileId || undefined);
                      setRemoteProjects([]);
                      if (nextProfileId.length === 0) return;
                      void run("remote.projects", async () => {
                        try {
                          await loadRemoteProjects(nextProfileId);
                        } catch (error) {
                          setRemoteError(error instanceof Error ? error.message : "Remote projects are unavailable");
                        }
                      });
                    }}
                    disabled={pending !== undefined}
                  >
                    {remoteProfiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>)}
                  </select>
                </label>
                <ul className="remote-project-list">
                  {remoteProjects.map((remoteProject) => (
                    <li key={remoteProject.projectId}>
                      <button
                        type="button"
                        className="session-item"
                        data-ui-remote-project-id={remoteProject.projectId}
                        onClick={() => remoteProfileId === undefined ? undefined : void run(`remote.project:${remoteProject.projectId}`, () => controller.openRemoteProject(remoteProfileId, remoteProject.projectId))}
                        disabled={pending !== undefined || remoteProfileId === undefined}
                      >
                        <span>{remoteProject.name}</span>
                        <small>{remoteProject.state}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            </section>
          </div>
        )}
      </main>
    );
  }

  const project = state.project;
  const activeTurn = state.turn;
  const recoveryPending = (activeTurn?.recovery.totalCount ?? 0) > 0;
  const canSubmit = state.status !== "loading" && pending === undefined && !recoveryPending;
  return (
    <main className="coding-shell" data-ui-coding-shell data-ui-coding-state={state.status} data-ui-coding-project data-ui-coding-project-id={project.projectId} data-ui-coding-project-location={state.location?.kind}>
      <header className="coding-header coding-header-compact">
        <div className="coding-title">
          <button type="button" className="coding-navigation-toggle" aria-label="Open project sessions" aria-expanded={sessionsOpen} onClick={() => setSessionsOpen((open) => !open)}><PanelLeft size={17} /></button>
          <div>
            <h1>{project.name}</h1>
            <span>{state.location?.kind === "remote" ? "Remote project" : "Local project"}</span>
          </div>
          {project.state === "attention" ? <span className="attention-badge"><AlertTriangle size={13} /> Needs attention</span> : null}
        </div>
        <div className="coding-header-actions">
          {activeTurn?.canCancel ? (
            <button type="button" className="quiet-button" data-ui-coding-action="cancel-turn" onClick={() => void run("turn.cancel", () => controller.cancelTurn())} disabled={pending !== undefined}>
              <CircleStop size={15} /> Stop
            </button>
          ) : null}
          <button type="button" className="quiet-button" data-ui-coding-action="switch-project" onClick={() => void run("project.open", () => controller.openProject())} disabled={pending !== undefined}>
            <FolderOpen size={15} /> Switch project
          </button>
          {reviewAvailable ? (
            <button type="button" className={inspectorOpen ? "quiet-button is-selected" : "quiet-button"} data-ui-coding-action="toggle-review" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((open) => !open)}>
              <PanelRight size={15} /> Details
            </button>
          ) : null}
        </div>
      </header>
      <div className={`coding-layout${inspectorOpen && reviewAvailable ? " has-inspector" : ""}${sessionsOpen ? " is-sessions-open" : ""}`} data-ui-coding-workbench>
        {sessionsOpen ? <button type="button" className="coding-sessions-backdrop" aria-label="Close project sessions" onClick={() => setSessionsOpen(false)} /> : null}
        <aside className="coding-sessions" aria-label="Project sessions" data-ui-coding-sessions-open={sessionsOpen ? "true" : "false"}>
          <div className="section-label"><span>Sessions</span><span>{state.sessions.length}</span></div>
          {state.sessions.length === 0 ? <p className="muted-copy">No sessions yet.</p> : (
            <ul>
              {state.sessions.map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={session.sessionId === state.sessionId ? "session-item is-selected" : "session-item"} data-ui-coding-session-selected={session.sessionId === state.sessionId ? session.sessionId : undefined} onClick={() => void run(`session:${session.sessionId}`, async () => { await controller.selectSession(session.sessionId); setSessionsOpen(false); })} disabled={pending !== undefined}>
                    <span>{session.title ?? "Untitled session"}</span>
                    <small>{formatDate(session.updatedAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="coding-main" aria-label="Coding conversation">
          {state.error === undefined ? null : <ErrorNotice message={state.error} />}
          {state.status === "loading" && state.transcript === undefined ? <LoadingState /> : null}
          {state.transcript === undefined ? (
            <div className="coding-empty"><Code2 size={22} /><h2>Start a task</h2><p>Ask the agent to inspect the project, explain a problem, or prepare a change.</p></div>
          ) : (
            <Transcript messages={state.transcript.messages} live={state.liveTurn} />
          )}
          <form className="coding-composer" data-ui-coding-composer onSubmit={submit}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask the coding agent to inspect or change this project" aria-label="Coding instruction" disabled={!canSubmit} />
            <button type="submit" className="send-button" disabled={!canSubmit || draft.trim().length === 0} aria-label="Send coding instruction">
              {pending === "turn.start" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
        </section>
        {inspectorOpen && reviewAvailable ? (
          <aside className="coding-inspector" aria-label="Coding review">
            {activeTurn === undefined ? null : <TurnReview turn={activeTurn} controller={controller} pending={pending} run={run} />}
            {state.proposal === undefined ? null : <ProposalReview proposal={state.proposal} capabilities={state.capabilities} controller={controller} pending={pending} run={run} />}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function Transcript({
  messages,
  live,
}: {
  readonly messages: readonly CodingTranscriptMessageReadModel[];
  readonly live?: CodingLiveTurnReadModel | undefined;
}): ReactNode {
  return (
    <div className="coding-transcript" data-ui-coding-transcript>
      {messages.length === 0 ? <div className="coding-empty"><Code2 size={22} /><h2>Start a task</h2><p>Ask the coding agent to inspect the project.</p></div> : messages.map((message) => <Message key={message.messageId} message={message} />)}
      {live?.assistantText ? <article className="transcript-message assistant live-message"><div className="message-label">Assistant <span>{live.phase}</span></div><div className="message-body">{live.assistantText}</div></article> : null}
    </div>
  );
}

function Message({ message }: { readonly message: CodingTranscriptMessageReadModel }): ReactNode {
  return (
    <article className={`transcript-message ${message.role} ${message.status === "partial" ? "is-partial" : ""}`} data-ui-coding-message-role={message.role}>
      <div className="message-label">{message.role === "user" ? "You" : message.role === "tool" ? "Tool activity" : message.role === "system" ? "System" : "Assistant"}{message.status === "partial" ? <span>Incomplete</span> : null}</div>
      {message.parts.map((part) => <Part key={part.partId} part={part} />)}
    </article>
  );
}

function Part({ part }: { readonly part: CodingTranscriptPartReadModel }): ReactNode {
  if (part.visibility === "internal" || part.visibility === "provider_replay_only") return null;
  switch (part.type) {
    case "text": return <p className="message-body">{part.text}{part.truncated ? " …" : ""}</p>;
    case "reasoning": return <details className="reasoning"><summary><ChevronDown size={14} /> Reasoning</summary><p>{part.text ?? "Reasoning is not available."}{part.truncated ? " …" : ""}</p></details>;
    case "tool_call": return <div className="tool-line"><span className="tool-icon"><Code2 size={14} /></span><span>Used {part.toolName}</span></div>;
    case "tool_result": return <div className={part.isError ? "tool-line is-error" : "tool-line"}><span className="tool-icon">{part.isError ? <X size={14} /> : <Check size={14} />}</span><span>{part.isError ? "Tool failed" : "Tool completed"}</span></div>;
    case "resource": return <div className="resource-line"><FileDiff size={14} /> {part.kind} resource · {formatBytes(part.sizeBytes)}</div>;
    case "hidden": return null;
  }
}

function TurnReview({
  turn,
  controller,
  pending,
  run,
}: {
  readonly turn: NonNullable<CodingWorkbenchState["turn"]>;
  readonly controller: CodingWorkbenchController;
  readonly pending?: string | undefined;
  readonly run: (key: string, action: () => Promise<void>) => Promise<void>;
}): ReactNode {
  return (
    <section className="review-section" data-ui-coding-turn-review data-ui-coding-turn-state={turn.state} data-ui-coding-turn-result={turn.result}>
      <div className="section-label"><span>Current task</span><span className={`state-dot state-${turn.state}`} /></div>
      <div className="review-status"><strong>{turnLabel(turn.state, turn.result)}</strong><span>{formatDate(turn.updatedAt)}</span></div>
      {turn.error === undefined ? null : <p className="review-error">{turn.error.message}</p>}
      {turn.recovery.items.map((item) => (
        <RecoveryReview
          key={item.executionId}
          item={item}
          controller={controller}
          pending={pending}
          run={run}
        />
      ))}
      {turn.approvals.items.map((approval) => (
        <div className="approval-review" data-ui-coding-approval={approval.executionId} key={approval.executionId}>
          <div className="review-icon"><ShieldCheck size={16} /></div>
          <div><strong>{approval.presentation.summary}</strong><p>{approval.tool.title}</p></div>
          <div className="review-actions">
            <button type="button" data-ui-coding-approval-action="approve_once" onClick={() => void run(`approval:${approval.executionId}`, () => controller.resolveApproval(approval.executionId, approval.approvalRevision, "approve_once"))} disabled={pending !== undefined}><Check size={14} /> Allow</button>
            <button type="button" data-ui-coding-approval-action="deny" onClick={() => void run(`approval-deny:${approval.executionId}`, () => controller.resolveApproval(approval.executionId, approval.approvalRevision, "deny"))} disabled={pending !== undefined}><X size={14} /> Deny</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function RecoveryReview({
  item,
  controller,
  pending,
  run,
}: {
  readonly item: NonNullable<CodingWorkbenchState["turn"]>["recovery"]["items"][number];
  readonly controller: CodingWorkbenchController;
  readonly pending?: string | undefined;
  readonly run: (key: string, action: () => Promise<void>) => Promise<void>;
}): ReactNode {
  const [resultText, setResultText] = useState("");
  const decisions = new Set(item.availableDecisions);
  const confirmEnabled = resultText.trim().length > 0;
  const resolve = (decision: "confirm_succeeded" | "confirm_failed" | "retry" | "abandon_turn") =>
    void run(`recovery:${item.executionId}:${decision}`, () =>
      controller.resolveRecovery(
        item,
        decision,
        decision === "confirm_succeeded" || decision === "confirm_failed"
          ? resultText
          : undefined,
      ),
    );
  return (
    <div className="recovery-review" data-ui-coding-recovery={item.executionId}>
      <div className="recovery-heading">
        <div className="review-icon"><AlertTriangle size={16} /></div>
        <div>
          <strong>Tool result needs review</strong>
          <p>{item.tool.title}</p>
        </div>
      </div>
      <p className="recovery-evidence">{item.evidence.message}{item.evidence.messageTruncated ? " …" : ""}</p>
      {item.evidence.reconciliationRef === undefined ? null : (
        <p className="recovery-reference">Reference: <code>{item.evidence.reconciliationRef}</code></p>
      )}
      <div className="recovery-facts">
        <span>{item.tool.risk.replaceAll("_", " ")}</span>
        <span>{item.attemptCount} {item.attemptCount === 1 ? "attempt" : "attempts"}</span>
        <span>{item.tool.idempotent ? "Retry available" : "Retry unavailable"}</span>
      </div>
      <details className="recovery-attempts">
        <summary>Attempt history</summary>
        <ul>
          {item.attempts.map((attempt) => (
            <li key={attempt.attemptNumber}>
              <span>Attempt {attempt.attemptNumber}</span>
              <span>{attempt.state.replaceAll("_", " ")}</span>
            </li>
          ))}
        </ul>
        {item.attemptsTruncated ? <p className="muted-copy">Earlier attempts are not shown.</p> : null}
      </details>
      {decisions.has("confirm_succeeded") || decisions.has("confirm_failed") ? (
        <label className="recovery-result-field">
          <span>Verified result</span>
          <textarea
            value={resultText}
            onChange={(event) => setResultText(event.target.value)}
            placeholder="Enter the result you verified from the external system"
            rows={3}
            disabled={pending !== undefined}
          />
        </label>
      ) : null}
      <div className="review-actions recovery-actions">
        {decisions.has("retry") ? <button type="button" data-ui-coding-recovery-action="retry" onClick={() => resolve("retry")} disabled={pending !== undefined}><LoaderCircle size={14} /> Retry</button> : null}
        {decisions.has("confirm_succeeded") ? <button type="button" data-ui-coding-recovery-action="confirm_succeeded" onClick={() => resolve("confirm_succeeded")} disabled={pending !== undefined || !confirmEnabled}><Check size={14} /> Confirm succeeded</button> : null}
        {decisions.has("confirm_failed") ? <button type="button" data-ui-coding-recovery-action="confirm_failed" onClick={() => resolve("confirm_failed")} disabled={pending !== undefined || !confirmEnabled}><X size={14} /> Confirm failed</button> : null}
        {decisions.has("abandon_turn") ? <button type="button" data-ui-coding-recovery-action="abandon_turn" onClick={() => resolve("abandon_turn")} disabled={pending !== undefined}><X size={14} /> Abandon task</button> : null}
      </div>
    </div>
  );
}

function ProposalReview({
  proposal,
  capabilities,
  controller,
  pending,
  run,
}: {
  readonly proposal: NonNullable<CodingWorkbenchState["proposal"]>;
  readonly capabilities: CodingWorkbenchState["capabilities"];
  readonly controller: CodingWorkbenchController;
  readonly pending?: string | undefined;
  readonly run: (key: string, action: () => Promise<void>) => Promise<void>;
}): ReactNode {
  const canApprove = proposal.state === "open";
  const canRequestApply = proposal.state === "approved";
  const canApply = proposal.state === "apply_requested" &&
    capabilities?.proposalApply === true;
  const canUndo = proposal.changeState === "applied";
  return (
    <section className="review-section proposal-review" data-ui-coding-proposal data-ui-coding-proposal-state={proposal.state} data-ui-coding-proposal-change-state={proposal.changeState}>
      <div className="section-label"><span>Change review</span><FileDiff size={14} /></div>
      <h2>{proposal.title ?? "Proposed changes"}</h2>
      {proposal.summary === undefined ? null : <p className="muted-copy">{proposal.summary}</p>}
      <div className="proposal-state"><span>{proposal.state.replaceAll("_", " ")}</span><span>{proposal.totalFileCount} files</span></div>
      <ul className="file-list">{proposal.files.map((file) => <li key={file.path} data-ui-coding-proposal-file={file.path}><code>{file.path}</code><span>{file.kind}</span></li>)}</ul>
      <div className="review-actions proposal-actions">
        {canApprove ? <><button type="button" data-ui-coding-proposal-action="approve" onClick={() => void run("proposal.approve", () => controller.decideProposal("approve"))} disabled={pending !== undefined}><Check size={14} /> Approve</button><button type="button" data-ui-coding-proposal-action="reject" onClick={() => void run("proposal.reject", () => controller.decideProposal("reject"))} disabled={pending !== undefined}><X size={14} /> Reject</button></> : null}
        {canRequestApply ? <button type="button" data-ui-coding-proposal-action="request_apply" onClick={() => void run("proposal.request-apply", () => controller.requestProposalApply())} disabled={pending !== undefined}><ShieldCheck size={14} /> Request apply</button> : null}
        {canApply ? <button type="button" data-ui-coding-proposal-action="apply" onClick={() => void run("proposal.apply", () => controller.applyProposal())} disabled={pending !== undefined}><Check size={14} /> Apply</button> : null}
        {canUndo ? <button type="button" data-ui-coding-proposal-action="undo" onClick={() => void run("proposal.undo", () => controller.undoProposal())} disabled={pending !== undefined}><Undo2 size={14} /> Undo</button> : null}
      </div>
      {proposal.files.some((file) => file.before?.truncated || file.after?.truncated) ? <p className="muted-copy">Some file previews are truncated.</p> : null}
    </section>
  );
}

function LoadingState(): ReactNode {
  return <div className="coding-loading"><LoaderCircle className="spin" size={20} /><span>Loading project</span></div>;
}

function ErrorNotice({ message }: { readonly message: string }): ReactNode {
  return <div className="coding-error" role="alert"><AlertTriangle size={15} /><span>{message}</span></div>;
}

function turnLabel(state: string, result?: string): string {
  return result?.replaceAll("_", " ") ?? state.replaceAll("_", " ");
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
