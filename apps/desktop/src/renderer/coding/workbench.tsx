import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleStop,
  Code2,
  FileDiff,
  FolderOpen,
  LoaderCircle,
  Send,
  ShieldCheck,
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
  CodingTranscriptMessageReadModel,
  CodingTranscriptPartReadModel,
} from "@wanex/coding";
import {
  CodingWorkbenchController,
  type CodingWorkbenchState,
  type DesktopRendererCodingClient,
} from "./controller.js";

export function CodingWorkbench({
  client,
}: {
  readonly client: DesktopRendererCodingClient;
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

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

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

  if (state.project === undefined) {
    return (
      <main className="coding-shell" data-ui-coding-shell data-ui-coding-state={state.status}>
        <header className="coding-header">
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>Coding</h1>
            <p>Work with an existing project and review every change before it lands.</p>
          </div>
          <button
            type="button"
            className="primary-button"
            data-ui-coding-action="open-project"
            onClick={() => void run("project.open", () => controller.openProject())}
            disabled={pending !== undefined}
          >
            {pending === "project.open" ? <LoaderCircle className="spin" size={16} /> : <FolderOpen size={16} />}
            Open project
          </button>
        </header>
        {state.error === undefined ? null : <ErrorNotice message={state.error} />}
      </main>
    );
  }

  const project = state.project;
  const activeTurn = state.turn;
  const recoveryPending = (activeTurn?.recovery.totalCount ?? 0) > 0;
  const canSubmit = state.status !== "loading" && pending === undefined && !recoveryPending;
  return (
    <main className="coding-shell" data-ui-coding-shell data-ui-coding-state={state.status} data-ui-coding-project data-ui-coding-project-id={project.projectId}>
      <header className="coding-header coding-header-compact">
        <div className="coding-title">
          <Code2 size={18} aria-hidden="true" />
          <div>
            <span className="eyebrow">Project</span>
            <h1>{project.name}</h1>
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
        </div>
      </header>
      <div className="coding-layout">
        <aside className="coding-sessions" aria-label="Project sessions">
          <div className="section-label"><span>Sessions</span><span>{state.sessions.length}</span></div>
          {state.sessions.length === 0 ? <p className="muted-copy">No sessions yet.</p> : (
            <ul>
              {state.sessions.map((session) => (
                <li key={session.sessionId}>
                  <button type="button" className={session.sessionId === state.sessionId ? "session-item is-selected" : "session-item"} data-ui-coding-session-selected={session.sessionId === state.sessionId ? session.sessionId : undefined} onClick={() => void run(`session:${session.sessionId}`, () => controller.selectSession(session.sessionId))} disabled={pending !== undefined}>
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
        <aside className="coding-inspector" aria-label="Coding review">
          {activeTurn === undefined ? <ReviewPlaceholder /> : <TurnReview turn={activeTurn} controller={controller} pending={pending} run={run} />}
          {state.proposal === undefined ? null : <ProposalReview proposal={state.proposal} controller={controller} pending={pending} run={run} />}
        </aside>
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
  controller,
  pending,
  run,
}: {
  readonly proposal: NonNullable<CodingWorkbenchState["proposal"]>;
  readonly controller: CodingWorkbenchController;
  readonly pending?: string | undefined;
  readonly run: (key: string, action: () => Promise<void>) => Promise<void>;
}): ReactNode {
  const canApprove = proposal.state === "open";
  const canRequestApply = proposal.state === "approved";
  const canApply = proposal.state === "apply_requested";
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

function ReviewPlaceholder(): ReactNode {
  return <section className="review-section review-placeholder"><FileDiff size={18} /><p>Task details, approvals, and proposed changes appear here.</p></section>;
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
