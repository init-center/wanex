import type {
  CodingApplicationEvent,
  CodingClient,
  CodingLiveTurnReadModel,
  CodingProjectReadModel,
  CodingProposalReadModel,
  CodingSessionReadModel,
  CodingTranscriptPage,
  CodingTurnReadModel,
  ResolveCodingTurnRecoveryRequest,
} from "@wanex/coding";
import type { DesktopCodingProjectSelection } from "../../coding-bridge.js";
type ToolExecutionRecoveryDecision = ResolveCodingTurnRecoveryRequest["decision"];
type ToolResultContentPart = NonNullable<ResolveCodingTurnRecoveryRequest["content"]>[number];

type CodingWorkbenchOperations = Pick<
  CodingClient,
  | "readProject"
  | "listSessions"
  | "readSession"
  | "readTranscript"
  | "listTurns"
  | "readLiveTurn"
  | "startTurn"
  | "cancelTurn"
  | "resolveTurnApproval"
  | "resolveTurnRecovery"
  | "readProposal"
  | "decideProposal"
  | "requestProposalApply"
  | "applyProposal"
  | "undoProposal"
  | "subscribe"
>;

export type CodingWorkbenchClient = CodingWorkbenchOperations & {
  selectProject(): Promise<DesktopCodingProjectSelection>;
};

export type CodingWorkbenchStatus = "idle" | "loading" | "ready" | "error";

export interface CodingWorkbenchState {
  readonly status: CodingWorkbenchStatus;
  readonly project?: CodingProjectReadModel;
  readonly sessions: readonly CodingSessionReadModel[];
  readonly sessionId?: string;
  readonly transcript?: CodingTranscriptPage;
  readonly turn?: CodingTurnReadModel;
  readonly liveTurn?: CodingLiveTurnReadModel;
  readonly proposal?: CodingProposalReadModel;
  readonly error?: string;
}

const EMPTY_STATE: CodingWorkbenchState = Object.freeze({
  status: "idle",
  sessions: [],
});

export class CodingWorkbenchController {
  readonly #client: CodingWorkbenchClient;
  #state: CodingWorkbenchState = EMPTY_STATE;
  #listeners = new Set<() => void>();
  #readGeneration = 0;
  #refreshQueued = false;
  #unsubscribe: (() => void) | undefined;
  #pendingStart:
    | {
        readonly projectId: string;
        readonly sessionId?: string;
        readonly text: string;
        readonly idempotencyKey: string;
      }
    | undefined;
  #closed = false;

  constructor(client: CodingWorkbenchClient) {
    this.#client = client;
  }

  get state(): CodingWorkbenchState {
    return this.#state;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start(): void {
    if (this.#closed || this.#unsubscribe !== undefined) return;
    this.#unsubscribe = this.#client.subscribe(this.#handleEvent);
  }

  async openProject(): Promise<void> {
    this.#assertOpen();
    const previousState = this.#state;
    this.#setState({ status: "loading", sessions: [] });
    try {
      const selection = await this.#client.selectProject();
      if (this.#closed) return;
      if (selection.kind === "cancelled") {
        this.#setState(previousState);
        return;
      }
      this.#pendingStart = undefined;
      this.#setState({
        status: "loading",
        project: selection.project,
        sessions: [],
      });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    if (this.#state.project === undefined) return;
    if (!this.#state.sessions.some((session) => session.sessionId === sessionId)) {
      return;
    }
    if (sessionId !== this.#state.sessionId) this.#pendingStart = undefined;
    const { error: _error, ...current } = this.#state;
    this.#setState({ ...current, status: "loading", sessionId });
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const project = this.#state.project;
    if (project === undefined || this.#closed) return;
    const generation = ++this.#readGeneration;
    const selectedSessionId = this.#state.sessionId;
    if (this.#state.status !== "loading") {
      const { error: _error, ...current } = this.#state;
      this.#setState({ ...current, status: "loading" });
    }
    try {
      const [projectRead, sessions] = await Promise.all([
        this.#client.readProject({ projectId: project.projectId }),
        this.#client.listSessions({ projectId: project.projectId, limit: 50 }),
      ]);
      if (projectRead === null) throw new Error("Project is no longer available");
      const sessionId = selectedSessionId !== undefined &&
          sessions.sessions.some((session) => session.sessionId === selectedSessionId)
        ? selectedSessionId
        : sessions.sessions[0]?.sessionId;
      if (sessionId === undefined) {
        if (this.#closed || generation !== this.#readGeneration) return;
        this.#setState({ status: "ready", project: projectRead, sessions: sessions.sessions });
        return;
      }
      const [session, transcript, turns] = await Promise.all([
        this.#client.readSession({ projectId: project.projectId, sessionId }),
        this.#client.readTranscript({ projectId: project.projectId, sessionId, limit: 100 }),
        this.#client.listTurns({ projectId: project.projectId, sessionId, limit: 50 }),
      ]);
      if (session === null) throw new Error("Session is no longer available");
      const turn = turns.turns.at(-1);
      const liveTurn = turn === undefined
        ? undefined
        : await this.#client.readLiveTurn({ projectId: project.projectId, turnId: turn.turnId });
      const proposal = turn?.proposalId === undefined
        ? undefined
        : await this.#client.readProposal({ projectId: project.projectId, proposalId: turn.proposalId });
      if (this.#closed || generation !== this.#readGeneration) return;
      this.#setState({
        status: "ready",
        project: projectRead,
        sessions: sessions.sessions,
        sessionId: session.sessionId,
        ...(transcript === null ? {} : { transcript }),
        ...(turn === undefined ? {} : { turn }),
        ...(liveTurn === null || liveTurn === undefined ? {} : { liveTurn }),
        ...(proposal === null || proposal === undefined ? {} : { proposal }),
      });
    } catch (error) {
      if (generation !== this.#readGeneration) return;
      this.#setError(error);
    }
  }

  async startTurn(text: string): Promise<boolean> {
    const project = this.#state.project;
    if (project === undefined || text.trim().length === 0) return false;
    const normalizedText = text.trim();
    const sessionId = this.#state.sessionId;
    const pendingStart = this.#pendingStart;
    const idempotencyKey =
      pendingStart?.projectId === project.projectId &&
      pendingStart.sessionId === sessionId &&
      pendingStart.text === normalizedText
        ? pendingStart.idempotencyKey
        : `desktop:${globalThis.crypto.randomUUID()}`;
    this.#pendingStart = {
      projectId: project.projectId,
      ...(sessionId === undefined ? {} : { sessionId }),
      text: normalizedText,
      idempotencyKey,
    };
    const { error: _error, ...current } = this.#state;
    this.#setState({ ...current, status: "loading" });
    try {
      const turn = await this.#client.startTurn({
        projectId: project.projectId,
        idempotencyKey,
        content: [{ type: "text", text: normalizedText }],
        ...(sessionId === undefined ? {} : { sessionId }),
      });
      this.#pendingStart = undefined;
      this.#setState({ ...this.#state, status: "loading", sessionId: turn.sessionId, turn });
      await this.refresh();
      return true;
    } catch (error) {
      await this.refresh().catch(() => {});
      this.#setError(error);
      return false;
    }
  }

  async cancelTurn(): Promise<void> {
    const project = this.#state.project;
    const turn = this.#state.turn;
    if (project === undefined || turn === undefined || !turn.canCancel) return;
    try {
      await this.#client.cancelTurn({
        projectId: project.projectId,
        turnId: turn.turnId,
        reason: "Cancelled from the Coding workbench",
      });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async resolveApproval(
    executionId: string,
    approvalRevision: number,
    decision: "approve_once" | "deny",
  ): Promise<void> {
    const project = this.#state.project;
    const turn = this.#state.turn;
    if (project === undefined || turn === undefined) return;
    try {
      await this.#client.resolveTurnApproval({
        projectId: project.projectId,
        turnId: turn.turnId,
        executionId,
        expectedApprovalRevision: approvalRevision,
        decision,
        reason: decision === "approve_once"
          ? "Approved from the Coding workbench"
          : "Denied from the Coding workbench",
        requestId: requestId(),
      });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async resolveRecovery(
    item: CodingTurnReadModel["recovery"]["items"][number],
    decision: ToolExecutionRecoveryDecision,
    contentText?: string,
  ): Promise<void> {
    const project = this.#state.project;
    const turn = this.#state.turn;
    if (project === undefined || turn === undefined) return;
    try {
      const result = await recoveryResult(decision, contentText);
      const request: ResolveCodingTurnRecoveryRequest = {
        projectId: project.projectId,
        turnId: turn.turnId,
        executionId: item.executionId,
        expectedRecoveryRevision: item.recoveryRevision,
        decision,
        reason: recoveryReason(decision),
        requestId: requestId(),
        ...(result === undefined ? {} : result),
      };
      await this.#client.resolveTurnRecovery(request);
      await this.refresh();
    } catch (error) {
      await this.refresh().catch(() => {});
      this.#setError(error);
    }
  }

  async decideProposal(decision: "approve" | "reject" | "withdraw"): Promise<void> {
    const target = this.#proposalTarget();
    if (target === undefined) return;
    try {
      await this.#client.decideProposal({
        ...target,
        decision,
        reason: `Proposal ${decision} from the Coding workbench`,
        requestId: requestId(),
      });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async requestProposalApply(): Promise<void> {
    const target = this.#proposalTarget();
    if (target === undefined) return;
    try {
      await this.#client.requestProposalApply({
        ...target,
        reason: "Request apply from the Coding workbench",
        requestId: requestId(),
      });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async applyProposal(): Promise<void> {
    const target = this.#proposalTarget();
    if (target === undefined) return;
    try {
      await this.#client.applyProposal(target);
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  async undoProposal(): Promise<void> {
    const target = this.#proposalTarget();
    if (target === undefined) return;
    try {
      await this.#client.undoProposal({ ...target, requestId: requestId() });
      await this.refresh();
    } catch (error) {
      this.#setError(error);
    }
  }

  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#readGeneration += 1;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#listeners.clear();
  }

  #handleEvent = (event: CodingApplicationEvent): void => {
    const projectId = this.#state.project?.projectId;
    if (projectId === undefined || event.projectId !== projectId) return;
    if (this.#refreshQueued) return;
    this.#refreshQueued = true;
    queueMicrotask(() => {
      this.#refreshQueued = false;
      void this.refresh();
    });
  };

  #proposalTarget(): { readonly projectId: string; readonly proposalId: string } | undefined {
    const project = this.#state.project;
    const proposal = this.#state.proposal;
    return project === undefined || proposal === undefined
      ? undefined
      : { projectId: project.projectId, proposalId: proposal.proposalId };
  }

  #setState(state: CodingWorkbenchState): void {
    if (this.#closed) return;
    this.#state = Object.freeze(state);
    for (const listener of this.#listeners) listener();
  }

  #setError(error: unknown): void {
    this.#setState({
      ...this.#state,
      status: "error",
      error: error instanceof Error ? error.message : "Coding request failed",
    });
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Coding workbench is closed");
  }
}

function requestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) throw new Error("Coding workbench requires crypto.randomUUID");
  return randomUuid.call(globalThis.crypto);
}

function recoveryReason(decision: ToolExecutionRecoveryDecision): string {
  switch (decision) {
    case "retry":
      return "Retry requested from the Coding workbench";
    case "confirm_succeeded":
      return "Tool success confirmed from the Coding workbench";
    case "confirm_failed":
      return "Tool failure confirmed from the Coding workbench";
    case "abandon_turn":
      return "Turn abandoned from the Coding workbench";
    default:
      throw new Error("Unknown recovery decision");
  }
}

async function recoveryResult(
  decision: ToolExecutionRecoveryDecision,
  contentText: string | undefined,
): Promise<
  Pick<ResolveCodingTurnRecoveryRequest, "content" | "contentDigest"> | undefined
> {
  if (decision !== "confirm_succeeded" && decision !== "confirm_failed") {
    if (contentText !== undefined) {
      throw new Error("Recovery result is only valid for a confirmation");
    }
    return undefined;
  }
  const text = contentText?.trim();
  if (text === undefined || text.length === 0) {
    throw new Error("Enter the verified Tool result before confirming it");
  }
  const content: readonly ToolResultContentPart[] = [{ type: "text", text }];
  const digest = await stableSha256(stableJson(content));
  return {
    content,
    contentDigest: digest,
  };
}

async function stableSha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("Recovery confirmation requires Web Crypto");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}
