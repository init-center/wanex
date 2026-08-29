import type { CodingHostTurnSignal } from "../host/events.js";
import type { CodingHost, CodingRepository } from "../host/types.js";
import { CodingApplicationError } from "./errors.js";
import { CodingApplicationEventLog } from "./events.js";
import { CodingLiveTurnProjection } from "./live.js";
import type {
  ApplyCodingProposalRequest,
  CancelCodingTurnRequest,
  CloseCodingProjectRequest,
  CodingApplication,
  CodingApplicationEventListener,
  CodingApplicationEventPage,
  CodingApplicationState,
  CodingLiveTurnReadModel,
  CodingProjectReadModel,
  CodingSessionPage,
  CodingSessionReadModel,
  CodingProposalActionResult,
  CodingProposalApplyResult,
  CodingProposalDecisionRequest,
  CodingProposalReadModel,
  CodingProposalUndoResult,
  CodingTurnReadModel,
  CodingTurnPage,
  CodingTranscriptPage,
  ListCodingEventsRequest,
  ListCodingSessionsRequest,
  ListCodingTurnsRequest,
  ReadCodingProjectRequest,
  ReadCodingSessionRequest,
  ReadCodingTranscriptRequest,
  ReadCodingProposalRequest,
  ReadCodingTurnRequest,
  RequestCodingProposalApplyRequest,
  ResolveCodingTurnApprovalRequest,
  ResolveCodingTurnRecoveryRequest,
  StartCodingTurnCommand,
  UndoCodingProposalRequest,
} from "./model.js";
import {
  listApplicationSessions,
  listApplicationTurns,
  readApplicationSession,
} from "./history.js";
import { readApplicationTranscript } from "./transcript.js";
import {
  projectCodingProposal,
  projectCodingProposalAction,
  projectCodingProposalApply,
  projectCodingProposalUndo,
} from "./proposal.js";
import { type OpenCodingProject, projectCodingProject } from "./project.js";
import {
  type ActiveCodingTurn,
  projectStartingTurn,
  projectTurnSnapshot,
  sameTurnReference,
} from "./turn.js";

const PROGRESS_EVENT_INTERVAL_MS = 50;

export class CodingApplicationController implements CodingApplication {
  #currentState: CodingApplicationState = "open";
  readonly #host: CodingHost;
  readonly #projects = new Map<string, OpenCodingProject>();
  readonly #turns = new Map<string, ActiveCodingTurn>();
  readonly #liveTurns = new Map<string, CodingLiveTurnProjection>();
  readonly #events = new CodingApplicationEventLog();
  readonly #lastProgressAt = new Map<string, number>();
  readonly #lastLiveEventAt = new Map<string, number>();
  #closePromise: Promise<void> | undefined;

  constructor(host: CodingHost) {
    this.#host = host;
  }

  get state(): CodingApplicationState {
    return this.#currentState;
  }

  registerProject(repository: CodingRepository): CodingProjectReadModel {
    this.assertOpen();
    const current = this.#projects.get(repository.repositoryId);
    if (current !== undefined && current.repository.state === "open") {
      return projectCodingProject(current);
    }
    const project = { repository, openedAt: Date.now() };
    this.#projects.set(repository.repositoryId, project);
    this.#events.publish({
      kind: "project_invalidated",
      projectId: repository.repositoryId,
      reason:
        projectCodingProject(project).state === "attention"
          ? "recovery_attention"
          : "project_opened",
    });
    return projectCodingProject(project);
  }

  async listProjects(): Promise<readonly CodingProjectReadModel[]> {
    this.assertOpen();
    return [...this.#projects.values()]
      .map(projectCodingProject)
      .sort((left, right) => right.openedAt - left.openedAt);
  }

  async readProject(
    request: ReadCodingProjectRequest,
  ): Promise<CodingProjectReadModel | null> {
    this.assertOpen();
    const project = this.#projects.get(
      normalizeId(request.projectId, "projectId"),
    );
    return project === undefined ? null : projectCodingProject(project);
  }

  async closeProject(request: CloseCodingProjectRequest): Promise<void> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    await project.repository.close();
    this.#projects.delete(project.repository.repositoryId);
    for (const [turnId, turn] of this.#turns) {
      if (turn.projectId === project.repository.repositoryId) {
        this.#turns.delete(turnId);
        this.#liveTurns.delete(turnId);
        this.#lastLiveEventAt.delete(turnId);
      }
    }
    this.#events.publish({
      kind: "project_invalidated",
      projectId: project.repository.repositoryId,
      reason: "project_closed",
    });
  }

  async listSessions(
    request: ListCodingSessionsRequest,
  ): Promise<CodingSessionPage> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    return await listApplicationSessions({
      repository: project.repository,
      input: request,
    });
  }

  async readSession(
    request: ReadCodingSessionRequest,
  ): Promise<CodingSessionReadModel | null> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    return await readApplicationSession({
      repository: project.repository,
      input: {
        ...request,
        sessionId: normalizeId(request.sessionId, "sessionId"),
      },
    });
  }

  async listTurns(request: ListCodingTurnsRequest): Promise<CodingTurnPage> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    return await listApplicationTurns({
      repository: project.repository,
      input: {
        ...request,
        sessionId: normalizeId(request.sessionId, "sessionId"),
      },
    });
  }

  async readTranscript(
    request: ReadCodingTranscriptRequest,
  ): Promise<CodingTranscriptPage | null> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    return await readApplicationTranscript({
      repository: project.repository,
      input: {
        ...request,
        sessionId: normalizeId(request.sessionId, "sessionId"),
      },
    });
  }

  async startTurn(
    request: StartCodingTurnCommand,
  ): Promise<CodingTurnReadModel> {
    this.assertOpen();
    if (request.content.length === 0) {
      throw new CodingApplicationError(
        "invalid_request",
        "Coding Turn content is required",
      );
    }
    const project = this.requireProject(request.projectId);
    const operation = project.repository.startTurn({
      idempotencyKey: request.idempotencyKey,
      content: request.content,
      ...(request.sessionId === undefined
        ? {}
        : { sessionId: request.sessionId }),
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.proposalTitle === undefined
        ? {}
        : { proposalTitle: request.proposalTitle }),
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      ...(request.modelEndpointId === undefined
        ? {}
        : { modelEndpointId: request.modelEndpointId }),
      ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
    });
    const now = Date.now();
    const active: ActiveCodingTurn = {
      projectId: project.repository.repositoryId,
      operation,
      createdAt: now,
      updatedAt: now,
      terminal: false,
    };
    this.#turns.set(operation.reference.turnId, active);
    this.#liveTurns.set(
      operation.reference.turnId,
      new CodingLiveTurnProjection(operation.reference),
    );
    this.observeSettlement(active);
    this.#events.publish({
      kind: "turn_invalidated",
      projectId: active.projectId,
      turnId: operation.reference.turnId,
      reason: "turn_started",
    });
    return await this.readActiveTurn(active);
  }

  async readTurn(
    request: ReadCodingTurnRequest,
  ): Promise<CodingTurnReadModel | null> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    const turnId = normalizeId(request.turnId, "turnId");
    const active = this.#turns.get(turnId);
    if (
      active === undefined ||
      active.projectId !== project.repository.repositoryId
    ) {
      const snapshot = await project.repository.getTurn(turnId);
      return snapshot === null
        ? null
        : projectTurnSnapshot(project.repository.repositoryId, snapshot);
    }
    return await this.readActiveTurn(active);
  }

  async readLiveTurn(
    request: ReadCodingTurnRequest,
  ): Promise<CodingLiveTurnReadModel | null> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    const turnId = normalizeId(request.turnId, "turnId");
    const active = this.#turns.get(turnId);
    if (
      active === undefined ||
      active.projectId !== project.repository.repositoryId
    ) {
      return null;
    }
    return (
      this.#liveTurns.get(turnId)?.read(project.repository.repositoryId) ?? null
    );
  }

  async cancelTurn(
    request: CancelCodingTurnRequest,
  ): Promise<CodingTurnReadModel> {
    const active = this.requireTurn(request);
    await active.operation.cancel(
      normalizeReason(request.reason, "cancel reason"),
    );
    active.updatedAt = Date.now();
    return await this.readActiveTurn(active);
  }

  async resolveTurnApproval(
    request: ResolveCodingTurnApprovalRequest,
  ): Promise<CodingTurnReadModel> {
    const active = this.requireTurn(request);
    await active.operation.resolveApproval({
      executionId: normalizeId(request.executionId, "executionId"),
      expectedApprovalRevision: normalizeRevision(
        request.expectedApprovalRevision,
      ),
      decision: request.decision,
      reason: normalizeReason(request.reason, "approval reason"),
      idempotencyKey: normalizeId(request.requestId, "requestId"),
    });
    active.updatedAt = Date.now();
    return await this.readActiveTurn(active);
  }

  async resolveTurnRecovery(
    request: ResolveCodingTurnRecoveryRequest,
  ): Promise<CodingTurnReadModel> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    const snapshot = await project.repository.resolveTurnRecovery({
      executionId: normalizeId(request.executionId, "executionId"),
      expectedRecoveryRevision: normalizeRevision(
        request.expectedRecoveryRevision,
      ),
      decision: request.decision,
      reason: normalizeReason(request.reason, "recovery reason"),
      requestId: normalizeId(request.requestId, "requestId"),
      ...(request.content === undefined ? {} : { content: request.content }),
      ...(request.contentDigest === undefined
        ? {}
        : { contentDigest: request.contentDigest }),
      ...(request.error === undefined ? {} : { error: request.error }),
      turnId: normalizeId(request.turnId, "turnId"),
    });
    this.#events.publish({
      kind: "turn_invalidated",
      projectId: project.repository.repositoryId,
      turnId: snapshot.reference.turnId,
      reason: "turn_recovery_resolved",
    });
    return projectTurnSnapshot(project.repository.repositoryId, snapshot);
  }

  async readProposal(
    request: ReadCodingProposalRequest,
  ): Promise<CodingProposalReadModel | null> {
    this.assertOpen();
    const project = this.requireProject(request.projectId);
    const proposal = await project.repository.getProposal(
      normalizeId(request.proposalId, "proposalId"),
    );
    return proposal === null
      ? null
      : projectCodingProposal(project.repository.repositoryId, proposal);
  }

  async decideProposal(
    request: CodingProposalDecisionRequest,
  ): Promise<CodingProposalActionResult> {
    const project = this.requireProject(request.projectId);
    const receipt = await project.repository.decideProposal({
      proposalId: normalizeId(request.proposalId, "proposalId"),
      decision: request.decision,
      reason: normalizeReason(request.reason, "Proposal decision reason"),
      idempotencyKey: normalizeId(request.requestId, "requestId"),
    });
    this.publishProposal(
      project,
      receipt.proposal.proposalId,
      "proposal_reviewed",
    );
    return projectCodingProposalAction(
      project.repository.repositoryId,
      receipt,
    );
  }

  async requestProposalApply(
    request: RequestCodingProposalApplyRequest,
  ): Promise<CodingProposalActionResult> {
    const project = this.requireProject(request.projectId);
    const receipt = await project.repository.requestProposalApply({
      proposalId: normalizeId(request.proposalId, "proposalId"),
      reason: normalizeReason(request.reason, "Proposal apply reason"),
      idempotencyKey: normalizeId(request.requestId, "requestId"),
    });
    this.publishProposal(
      project,
      receipt.proposal.proposalId,
      "proposal_apply_requested",
    );
    return projectCodingProposalAction(
      project.repository.repositoryId,
      receipt,
    );
  }

  async applyProposal(
    request: ApplyCodingProposalRequest,
  ): Promise<CodingProposalApplyResult> {
    const project = this.requireProject(request.projectId);
    const receipt = await project.repository.applyProposal(
      normalizeId(request.proposalId, "proposalId"),
    );
    this.publishProposal(
      project,
      receipt.proposal.proposalId,
      "proposal_applied",
    );
    return projectCodingProposalApply(project.repository.repositoryId, receipt);
  }

  async undoProposal(
    request: UndoCodingProposalRequest,
  ): Promise<CodingProposalUndoResult> {
    const project = this.requireProject(request.projectId);
    const receipt = await project.repository.undoProposal({
      proposalId: normalizeId(request.proposalId, "proposalId"),
      idempotencyKey: normalizeId(request.requestId, "requestId"),
    });
    this.publishProposal(
      project,
      receipt.proposal.proposalId,
      "proposal_undone",
    );
    return projectCodingProposalUndo(project.repository.repositoryId, receipt);
  }

  async readEvents(
    request: ListCodingEventsRequest = {},
  ): Promise<CodingApplicationEventPage> {
    this.assertOpen();
    return this.#events.read(request);
  }

  subscribe(listener: CodingApplicationEventListener): () => void {
    this.assertOpen();
    return this.#events.subscribe(listener);
  }

  observeHostTurn(signal: CodingHostTurnSignal): void {
    if (this.#currentState !== "open") return;
    const active = this.#turns.get(signal.reference.turnId);
    if (
      active === undefined ||
      !sameTurnReference(active.operation.reference, signal.reference)
    ) {
      return;
    }
    if (signal.kind === "provider_event") {
      const live = this.#liveTurns.get(signal.reference.turnId);
      if (live === undefined || !live.applyProviderEvent(signal.event)) return;
      this.publishLiveTurn(
        active,
        live,
        signal.event.event.type === "finish" || signal.event.event.type === "error",
      );
      return;
    }
    const now = Date.now();
    active.updatedAt = now;
    if (signal.kind === "progress") {
      const previous = this.#lastProgressAt.get(signal.reference.turnId) ?? 0;
      if (now - previous < PROGRESS_EVENT_INTERVAL_MS) return;
      this.#lastProgressAt.set(signal.reference.turnId, now);
    }
    this.#events.publish({
      kind: "turn_invalidated",
      projectId: active.projectId,
      turnId: signal.reference.turnId,
      reason: hostReason(signal.kind),
    });
    const live = this.#liveTurns.get(signal.reference.turnId);
    if (live === undefined) return;
    if (signal.kind === "settled") {
      this.#liveTurns.delete(signal.reference.turnId);
      this.#lastLiveEventAt.delete(signal.reference.turnId);
      return;
    }
    const phase =
      signal.kind === "suspended"
        ? "waiting"
        : signal.kind === "cancel_requested"
          ? "cancelling"
          : signal.kind === "approval_resolved"
            ? "starting"
            : undefined;
    if (
      signal.kind === "suspended" ||
      signal.kind === "approval_resolved"
    ) {
      live.prepareNextAttempt();
    }
    if (phase !== undefined && live.setPhase(phase)) {
      this.publishLiveTurn(active, live, true);
    }
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) return this.#closePromise;
    this.#currentState = "closing";
    this.#closePromise = this.#host.close().finally(() => {
      this.#projects.clear();
      this.#turns.clear();
      this.#liveTurns.clear();
      this.#lastProgressAt.clear();
      this.#lastLiveEventAt.clear();
      this.#events.clear();
      this.#currentState = "closed";
    });
    return this.#closePromise;
  }

  private async readActiveTurn(
    active: ActiveCodingTurn,
  ): Promise<CodingTurnReadModel> {
    const project = this.requireProject(active.projectId);
    const snapshot = await project.repository.getTurn(
      active.operation.reference.turnId,
    );
    if (
      snapshot !== null &&
      !sameTurnReference(active.operation.reference, snapshot.reference)
    ) {
      throw new Error("active Coding Turn contradicts canonical persistence");
    }
    return snapshot === null
      ? projectStartingTurn(active)
      : projectTurnSnapshot(active.projectId, snapshot);
  }

  private requireProject(projectId: string): OpenCodingProject {
    this.assertOpen();
    const normalized = normalizeId(projectId, "projectId");
    const project = this.#projects.get(normalized);
    if (project === undefined || project.repository.state !== "open") {
      throw new CodingApplicationError(
        "project_unavailable",
        "Coding project is unavailable",
      );
    }
    return project;
  }

  private requireTurn(request: ReadCodingTurnRequest): ActiveCodingTurn {
    const project = this.requireProject(request.projectId);
    const turnId = normalizeId(request.turnId, "turnId");
    const active = this.#turns.get(turnId);
    if (
      active === undefined ||
      active.projectId !== project.repository.repositoryId
    ) {
      throw new CodingApplicationError(
        "turn_unavailable",
        "Coding Turn is unavailable",
      );
    }
    return active;
  }

  private observeSettlement(active: ActiveCodingTurn): void {
    void active.operation.result.then(
      () => this.settle(active),
      (error) => {
        active.error = error;
        this.settle(active);
      },
    );
  }

  private settle(active: ActiveCodingTurn): void {
    active.terminal = true;
    active.updatedAt = Date.now();
    this.#lastProgressAt.delete(active.operation.reference.turnId);
    this.#liveTurns.delete(active.operation.reference.turnId);
    this.#lastLiveEventAt.delete(active.operation.reference.turnId);
    this.#events.publish({
      kind: "turn_invalidated",
      projectId: active.projectId,
      turnId: active.operation.reference.turnId,
      reason: "turn_settled",
    });
  }

  private publishProposal(
    project: OpenCodingProject,
    proposalId: string,
    reason:
      | "proposal_reviewed"
      | "proposal_apply_requested"
      | "proposal_applied"
      | "proposal_undone",
  ): void {
    this.#events.publish({
      kind: "proposal_invalidated",
      projectId: project.repository.repositoryId,
      proposalId,
      reason,
    });
  }

  private publishLiveTurn(
    active: ActiveCodingTurn,
    live: CodingLiveTurnProjection,
    force: boolean,
  ): void {
    const turnId = active.operation.reference.turnId;
    const now = Date.now();
    const previous = this.#lastLiveEventAt.get(turnId) ?? 0;
    if (!force && now - previous < PROGRESS_EVENT_INTERVAL_MS) return;
    this.#lastLiveEventAt.set(turnId, now);
    this.#events.publish({
      kind: "turn_live_invalidated",
      projectId: active.projectId,
      turnId,
      revision: live.revision,
      reason: "turn_live_updated",
    });
  }

  private assertOpen(): void {
    if (this.#currentState !== "open") {
      throw new CodingApplicationError(
        "application_closed",
        "Coding application is closed",
      );
    }
  }
}

export function createCodingApplicationSurface(
  controller: CodingApplicationController,
): CodingApplication {
  const surface: CodingApplication = {
    get state() {
      return controller.state;
    },
    listProjects: async () => await controller.listProjects(),
    readProject: async (request) => await controller.readProject(request),
    closeProject: async (request) => await controller.closeProject(request),
    listSessions: async (request) => await controller.listSessions(request),
    readSession: async (request) => await controller.readSession(request),
    readTranscript: async (request) => await controller.readTranscript(request),
    listTurns: async (request) => await controller.listTurns(request),
    startTurn: async (request) => await controller.startTurn(request),
    readTurn: async (request) => await controller.readTurn(request),
    readLiveTurn: async (request) => await controller.readLiveTurn(request),
    cancelTurn: async (request) => await controller.cancelTurn(request),
    resolveTurnApproval: async (request) =>
      await controller.resolveTurnApproval(request),
    resolveTurnRecovery: async (request) =>
      await controller.resolveTurnRecovery(request),
    readProposal: async (request) => await controller.readProposal(request),
    decideProposal: async (request) => await controller.decideProposal(request),
    requestProposalApply: async (request) =>
      await controller.requestProposalApply(request),
    applyProposal: async (request) => await controller.applyProposal(request),
    undoProposal: async (request) => await controller.undoProposal(request),
    readEvents: async (request) => await controller.readEvents(request),
    subscribe: (listener) => controller.subscribe(listener),
  };
  return Object.freeze(surface);
}

function hostReason(
  kind: Exclude<CodingHostTurnSignal["kind"], "provider_event">,
):
  | "turn_progress"
  | "turn_waiting"
  | "turn_execution_settled"
  | "turn_cancel_requested"
  | "approval_resolved"
  | "turn_admitted" {
  switch (kind) {
    case "submitted":
      return "turn_admitted";
    case "progress":
      return "turn_progress";
    case "suspended":
      return "turn_waiting";
    case "settled":
      return "turn_execution_settled";
    case "cancel_requested":
      return "turn_cancel_requested";
    case "approval_resolved":
      return "approval_resolved";
  }
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > 512) {
    throw new CodingApplicationError("invalid_request", `${label} is invalid`);
  }
  return normalized;
}

function normalizeReason(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > 1_024
  ) {
    throw new CodingApplicationError("invalid_request", `${label} is invalid`);
  }
  return normalized;
}

function normalizeRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CodingApplicationError(
      "invalid_request",
      "approval revision is invalid",
    );
  }
  return value;
}
