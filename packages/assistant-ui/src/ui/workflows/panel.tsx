import { CheckCircle2, CirclePause, Play, Send, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";

type WorkflowTab = "plan" | "goal" | "aside";

export function WorkflowsPanel({
  snapshot,
  busy,
  dispatch,
  onClose,
}: {
  readonly snapshot: Snapshot;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
  readonly onClose: () => void;
}): ReactNode {
  const [tab, setTab] = useState<WorkflowTab>(preferredTab(snapshot));
  return (
    <aside className={classes("context-panel workflows-panel")} aria-label="Workflows" data-ui-workflows-panel>
      <div className={classes("context-panel-header")}>
        <div><span className={classes("eyebrow")}>Workflows</span><h2>Plan, Goal, and aside</h2></div>
        <button type="button" className={classes("icon-button")} onClick={onClose} aria-label="Close workflows" title="Close workflows"><X size={17} /></button>
      </div>
      <div className={classes("workflow-tabs")} role="tablist" aria-label="Workflow">
        <WorkflowTabButton id="plan" selected={tab === "plan"} state={planState(snapshot)} select={setTab}>Plan</WorkflowTabButton>
        <WorkflowTabButton id="goal" selected={tab === "goal"} state={snapshot.goal.state} select={setTab}>Goal</WorkflowTabButton>
        <WorkflowTabButton id="aside" selected={tab === "aside"} state={snapshot.sideQuery.state} select={setTab}>Ask aside</WorkflowTabButton>
      </div>
      <div className={classes("workflow-content")}>
        {tab === "plan" ? <PlanJourney snapshot={snapshot} busy={busy} dispatch={dispatch} /> : null}
        {tab === "goal" ? <GoalJourney snapshot={snapshot} busy={busy} dispatch={dispatch} /> : null}
        {tab === "aside" ? <SideQueryJourney snapshot={snapshot} busy={busy} dispatch={dispatch} /> : null}
      </div>
    </aside>
  );
}

function WorkflowTabButton({
  id,
  selected,
  state,
  select,
  children,
}: {
  readonly id: WorkflowTab;
  readonly selected: boolean;
  readonly state: string;
  readonly select: (tab: WorkflowTab) => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <button type="button" role="tab" aria-selected={selected} data-ui-workflow-tab={id} className={classes(selected ? "is-active" : "")} onClick={() => select(id)}>
      <span>{children}</span><small>{stateLabel(state)}</small>
    </button>
  );
}

function PlanJourney({
  snapshot,
  busy,
  dispatch,
}: JourneyProps): ReactNode {
  const generation = snapshot.plan.generation;
  const proposal = snapshot.plan.proposal.kind === "assistant.plan-proposal.found"
    ? snapshot.plan.proposal.proposal
    : undefined;

  function generate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = requiredText(new FormData(event.currentTarget), "text");
    void dispatch({
      type: "start-plan-generation",
      input: {
        text,
        ...(snapshot.conversation.sessionId === undefined
          ? {}
          : { sessionId: snapshot.conversation.sessionId }),
      },
    });
  }

  function revise(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (proposal === undefined) return;
    const data = new FormData(event.currentTarget);
    const steps = parsePlanSteps(requiredText(data, "steps"));
    void dispatch({
      type: "revise-plan-proposal",
      input: {
        proposalId: proposal.proposalId,
        expectedRevision: proposal.revision,
        title: requiredText(data, "title"),
        summary: requiredText(data, "summary"),
        steps,
        references: proposal.references,
      },
    });
  }

  function decide(decision: "approve" | "reject" | "withdraw"): void {
    if (proposal === undefined) return;
    void dispatch({
      type: "decide-plan-proposal",
      input: {
        proposalId: proposal.proposalId,
        expectedRevision: proposal.revision,
        decision,
      },
    });
  }

  return (
    <section data-ui-plan data-ui-plan-state={planState(snapshot)}>
      {generation?.state === "running" ? (
        <WorkflowStatus title="Generating Plan" detail="Preparing a reviewable proposal.">
          <button type="button" data-ui-action="cancel-plan-generation" disabled={busy} onClick={() => void dispatch({ type: "cancel-plan-generation", input: { operationId: generation.operationId } })}>Cancel</button>
        </WorkflowStatus>
      ) : (
        <form className={classes("workflow-form")} data-ui-plan-form onSubmit={generate}>
          <label><span>What should the Plan accomplish?</span><textarea name="text" required maxLength={32768} disabled={!snapshot.view.planCanGenerate || busy} /></label>
          <button type="submit" disabled={!snapshot.view.planCanGenerate || busy}><Send size={14} /> Generate Plan</button>
        </form>
      )}
      {generation === undefined || generation.state === "running" ? null : (
        <WorkflowStatus
          title={`Generation ${stateLabel(generation.state)}`}
          {...(generation.error?.message === undefined ? {} : { detail: generation.error.message })}
        >
          <button type="button" data-ui-action="dismiss-plan-generation" disabled={busy} onClick={() => void dispatch({ type: "dismiss-plan-generation", input: { operationId: generation.operationId } })}>Dismiss</button>
        </WorkflowStatus>
      )}
      {proposal === undefined ? null : (
        <article
          className={classes("workflow-card")}
          data-ui-plan-proposal={proposal.proposalId}
          data-ui-plan-proposal-state={proposal.state}
          data-ui-plan-revision={proposal.revision}
        >
          <header><div><span className={classes("eyebrow")}>Proposal · {stateLabel(proposal.state)}</span><h3>{proposal.title}</h3></div><span>r{proposal.revision}</span></header>
          <p>{proposal.summary}</p>
          <ol>{proposal.steps.map((step) => <li key={step.id} data-ui-plan-step={step.id}><strong>{step.title}</strong>{step.detail === undefined ? null : <p>{step.detail}</p>}</li>)}</ol>
          {proposal.state === "open" ? (
            <>
              <details>
                <summary>Edit proposal</summary>
                <form className={classes("workflow-form")} onSubmit={revise}>
                  <label><span>Title</span><input name="title" defaultValue={proposal.title} required maxLength={500} /></label>
                  <label><span>Summary</span><textarea name="summary" defaultValue={proposal.summary} required maxLength={20000} /></label>
                  <label><span>Steps, one per line</span><textarea name="steps" defaultValue={proposal.steps.map((step) => step.title).join("\n")} required /></label>
                  <button type="submit" disabled={busy}>Save revision</button>
                </form>
              </details>
              <div className={classes("inline-actions")}>
                <button type="button" data-ui-action="decide-plan-proposal" data-ui-decision="approve" disabled={busy} onClick={() => decide("approve")}><CheckCircle2 size={14} /> Approve</button>
                <button type="button" data-ui-action="decide-plan-proposal" data-ui-decision="reject" disabled={busy} onClick={() => decide("reject")}>Reject</button>
                <button type="button" data-ui-action="decide-plan-proposal" data-ui-decision="withdraw" disabled={busy} onClick={() => decide("withdraw")}>Withdraw</button>
              </div>
            </>
          ) : null}
          {proposal.state === "approved" && proposal.execution === undefined ? (
            <button type="button" className={classes("primary-action")} data-ui-action="execute-plan-proposal" disabled={busy} onClick={() => void dispatch({ type: "execute-plan-proposal", input: { proposalId: proposal.proposalId, expectedRevision: proposal.revision } })}><Play size={14} /> Execute Plan</button>
          ) : null}
          {proposal.execution === undefined ? null : <p className={classes("muted")} data-ui-plan-execution data-ui-job-state={proposal.execution.jobState}>Execution {stateLabel(proposal.execution.jobState)}</p>}
        </article>
      )}
    </section>
  );
}

function GoalJourney({ snapshot, busy, dispatch }: JourneyProps): ReactNode {
  const goal = snapshot.goal.goal;
  function start(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void dispatch({
      type: "start-goal",
      input: {
        ...(snapshot.conversation.sessionId === undefined ? {} : { sessionId: snapshot.conversation.sessionId }),
        objective: requiredText(data, "objective"),
        successCriteria: lines(requiredText(data, "successCriteria")),
        boundaries: lines(optionalText(data, "boundaries")),
        constraints: lines(optionalText(data, "constraints")),
        stopPolicy: {
          maxAttempts: boundedInteger(data, "maxAttempts", 1, 100, 5),
          maxConsecutiveBlockedAttempts: boundedInteger(data, "maxConsecutiveBlockedAttempts", 1, 100, 2),
        },
      },
    });
  }
  function change(type: "pause-goal" | "resume-goal" | "cancel-goal"): void {
    if (goal === undefined) return;
    if (type === "cancel-goal") {
      void dispatch({ type, input: { goalId: goal.goalId, expectedRevision: goal.revision, reason: "cancelled by user" } });
      return;
    }
    void dispatch({ type, input: { goalId: goal.goalId, expectedRevision: goal.revision } });
  }
  if (goal === undefined) {
    return (
      <form className={classes("workflow-form")} onSubmit={start} data-ui-goal-form>
        <label><span>Objective</span><textarea name="objective" required maxLength={32768} /></label>
        <label><span>Success criteria, one per line</span><textarea name="successCriteria" required maxLength={65536} /></label>
        <label><span>Boundaries, one per line</span><textarea name="boundaries" maxLength={65536} /></label>
        <label><span>Constraints, one per line</span><textarea name="constraints" maxLength={65536} /></label>
        <div className={classes("form-grid")}>
          <label><span>Maximum attempts</span><input name="maxAttempts" type="number" min={1} max={100} defaultValue={5} /></label>
          <label><span>Blocked limit</span><input name="maxConsecutiveBlockedAttempts" type="number" min={1} max={100} defaultValue={2} /></label>
        </div>
        <button type="submit" disabled={!snapshot.view.goalCanStart || busy}>Start Goal</button>
      </form>
    );
  }
  return (
    <article
      className={classes("workflow-card")}
      data-ui-goal={goal.goalId}
      data-ui-goal-state={goal.state}
      data-ui-goal-revision={goal.revision}
    >
      <header><div><span className={classes("eyebrow")}>Goal · {stateLabel(goal.state)}</span><h3>{goal.objective}</h3></div><span>{goal.attemptCount}/{goal.stopPolicy.maxAttempts}</span></header>
      <p>{goal.reason.detail ?? stateLabel(goal.reason.code)}</p>
      <h4>Success criteria</h4>
      <ul>{goal.successCriteria.map((criterion) => <li key={criterion.id}>{criterion.description}</li>)}</ul>
      <h4>Attempts</h4>
      {goal.attempts.length === 0 ? <p className={classes("muted")}>No attempts yet</p> : (
        <ol>{goal.attempts.map((attempt) => (
          <li key={attempt.attemptId} data-ui-goal-attempt={attempt.attemptNumber}>
            <strong>Attempt {attempt.attemptNumber}</strong>
            <span>{attempt.review?.disposition ?? "running"}</span>
            {attempt.verifications.map((verification) => <small key={verification.requirementId} data-ui-goal-verification={verification.requirementId} data-ui-verification-result={verification.result}>{verification.result}: {verification.reason ?? verification.requirementId}</small>)}
          </li>
        ))}</ol>
      )}
      <div className={classes("inline-actions")}>
        {goal.canPause ? <button type="button" disabled={busy} onClick={() => change("pause-goal")}><CirclePause size={14} /> Pause</button> : null}
        {goal.canResume ? <button type="button" disabled={busy} onClick={() => change("resume-goal")}><Play size={14} /> Resume</button> : null}
        {goal.canCancel ? <button type="button" disabled={busy} onClick={() => change("cancel-goal")}>Cancel</button> : null}
      </div>
    </article>
  );
}

function SideQueryJourney({ snapshot, busy, dispatch }: JourneyProps): ReactNode {
  const query = snapshot.sideQuery;
  function start(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void dispatch({ type: "start-side-query", input: { question: requiredText(new FormData(event.currentTarget), "question") } });
  }
  if (query.state === "idle") {
    return (
      <form className={classes("workflow-form")} onSubmit={start} data-ui-side-query-form>
        <p className={classes("muted")}>Ask a read-only question using current context without adding it to the conversation history.</p>
        <label><span>Question</span><textarea name="question" required maxLength={16384} /></label>
        <button type="submit" disabled={!snapshot.view.sideQueryCanStart || busy}>Ask aside</button>
      </form>
    );
  }
  if (query.queryId === undefined) return null;
  return (
    <article className={classes("workflow-card")} data-ui-side-query={query.queryId} data-ui-side-query-state={query.state}>
      <header><div><span className={classes("eyebrow")}>Ask aside · {stateLabel(query.state)}</span><h3 data-ui-side-query-question>{query.question}</h3></div></header>
      {query.state === "running" ? <p>Thinking in a temporary context…</p> : null}
      {query.state === "succeeded" ? <p className={classes("aside-answer")} data-ui-side-query-answer>{query.answerText}</p> : null}
      {query.state === "failed" ? <p role="alert">{query.errorMessage ?? "Side question failed"}</p> : null}
      {query.state === "running" ? (
        <button type="button" data-ui-action="cancel-side-query" disabled={busy} onClick={() => void dispatch({ type: "cancel-side-query", input: { queryId: query.queryId! } })}>Cancel</button>
      ) : (
        <button type="button" data-ui-action="dismiss-side-query" disabled={busy} onClick={() => void dispatch({ type: "dismiss-side-query", input: { queryId: query.queryId! } })}>Dismiss</button>
      )}
    </article>
  );
}

function WorkflowStatus({ title, detail, children }: { readonly title: string; readonly detail?: string; readonly children: ReactNode }): ReactNode {
  return <div className={classes("workflow-status")}><strong>{title}</strong>{detail === undefined ? null : <p>{detail}</p>}<div>{children}</div></div>;
}

interface JourneyProps {
  readonly snapshot: Snapshot;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
}

function preferredTab(snapshot: Snapshot): WorkflowTab {
  if (snapshot.sideQuery.state !== "idle") return "aside";
  if (snapshot.plan.generation !== undefined || snapshot.plan.proposal.kind === "assistant.plan-proposal.found") return "plan";
  if (snapshot.goal.goal !== undefined) return "goal";
  return "plan";
}

function planState(snapshot: Snapshot): string {
  if (snapshot.plan.generation !== undefined) return snapshot.plan.generation.state;
  return snapshot.plan.proposal.kind === "assistant.plan-proposal.found"
    ? snapshot.plan.proposal.proposal.state
    : "idle";
}

function parsePlanSteps(value: string) {
  return lines(value).map((title, index) => ({ id: `step-${index + 1}`, title }));
}

function lines(value: string | undefined): readonly string[] {
  return value?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) ?? [];
}

function requiredText(data: FormData, field: string): string {
  const value = optionalText(data, field);
  if (value === undefined) throw new Error(`${field} is required`);
  return value;
}

function optionalText(data: FormData, field: string): string | undefined {
  const value = data.get(field);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function boundedInteger(data: FormData, field: string, minimum: number, maximum: number, fallback: number): number {
  const value = Number(data.get(field) ?? fallback);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function stateLabel(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
