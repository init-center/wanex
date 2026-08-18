import { describe, expect, it } from "vitest";
import type {
  AttachmentDraft,
  CommandCatalogReadModel,
  ConversationAttachmentsReadModel,
  ConversationHistoryReadModel,
  ConversationOperationReadModel,
  RegenerateTrackedConversationOperationRequest,
  ResolveTrackedConversationRecoveryRequest,
  ChangeGoalStateRequest,
  CancelGoalRequest,
  GoalReadModel,
  HomeReadModel,
  ModelEndpointReadModel,
  PlanGenerationReadModel,
  PlanInvalidationCause,
  PlanProposalReadModel,
  ReadSideQueryResult,
  ReadGoalRequest,
  SideQueryInvalidationCause,
  SideQueryReadModel,
  StartSideQueryRequest,
  StartGoalRequest,
  TeamConversationSummary,
  TeamConversationPageReadModel,
  TeamParticipantReadModel,
} from "@wanex/product";
import type {
  SurfaceClientCommandEnvelope,
  SurfaceEvent,
  SurfaceEventListener,
} from "@wanex/product/surface";
import {
  createTuiFullScreen,
  type TuiFullScreenClient,
} from "../src/full-screen/index.js";
import { projectTuiTeamTimeline } from "../src/full-screen/team/projection.js";
import { teamComposerAvailability } from "../src/full-screen/team/composer.js";
import type { TuiAttachmentHost } from "../src/model.js";
import { TuiVirtualTerminal } from "./full-screen/virtual-terminal.js";

describe("product full-screen TUI", () => {
  it("renders canonical history and keeps a CJK multiline composer stable across resize", async () => {
    const client = new FullScreenClientFixture();
    client.transcript = transcript([
      historyRow("user", "你好，Wanex", "row_user"),
      historyRow("assistant", "Canonical answer", "row_assistant"),
    ]);
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const initial = await terminal.text();
      expect(initial).toContain("Wanex  Project discussion");
      expect(initial).toContain("你好，Wanex");
      expect(initial).toContain("Canonical answer");
      for (const privateField of [
        "attemptId",
        "jobId",
        "secretRef",
        "storeDir",
        "serviceBin",
      ]) {
        expect(initial).not.toContain(privateField);
      }

      terminal.sendInput("第一行");
      terminal.sendInput("\u001b[27;2;13~");
      terminal.sendInput("\u001b[200~second line\u001b[201~");
      await terminal.waitForRender();
      expect(fullScreen.state().draft).toBe("第一行\nsecond line");

      terminal.resize(42, 14);
      const resized = await terminal.viewport();
      expect(resized).toHaveLength(14);
      expect(resized.join("\n")).toContain("第一行");
      expect(resized.at(-1)).toContain("Enter submit");
    } finally {
      await fullScreen.stop();
    }
  });

  it("holds one Team selection and never performs Session-scoped canonical reads", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    client.operation = operation({ terminal: false });
    const terminal = new TuiVirtualTerminal(80, 20);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(fullScreen.state()).toMatchObject({
        selection: {
          kind: "team",
          conversationId: "team_product_tui",
        },
        team: {
          conversation: {
            conversationId: "team_product_tui",
            title: "Research group",
          },
        },
      });
      expect(fullScreen.state().transcript).toBeUndefined();
      expect(fullScreen.state().attachments).toBeUndefined();
      expect(fullScreen.state().operation).toBeUndefined();
      expect(client.readCounts).toMatchObject({
        team: 1,
        transcript: 0,
        attachments: 0,
        operation: 0,
      });
      const rendered = await terminal.text();
      expect(rendered).toContain("Research group");
      expect(rendered).not.toContain("Existing request");

      terminal.sendInput("must not become a Session turn");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(client.submissions).toHaveLength(0);
      expect(client.teamRoundSubmissions).toHaveLength(1);
      expect(client.teamRoundSubmissions[0]).toMatchObject({
        conversationId: "team_product_tui",
        text: "must not become a Session turn",
      });
      expect(fullScreen.state().team?.messages.at(-1)?.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: "must not become a Session turn",
        }),
      ]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("loads and selects a Team from the unified navigation without exposing runtime ids", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u000f");
      await eventually(() => terminalTextContains(terminal, "Research group"));
      const picker = await terminal.text();
      expect(picker).toContain("New group");
      expect(picker).toContain("Research group");
      expect(picker).not.toContain("team_product_tui");

      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      await terminal.waitForRender();
      terminal.sendInput("\r");
      await eventually(() => client.teamSelections.length === 1);
      await eventually(
        () => fullScreen.state().selection?.kind === "team",
      );
      expect(client.teamSelections).toEqual([
        { conversationId: "team_product_tui" },
      ]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("uses an exact coordinator CAS from Group details", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOR");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Clear coordinator"));
      const actions = await terminal.text();
      expect(actions).not.toContain("Mute agent");
      expect(actions).not.toContain("Remove agent");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Clear coordinator?"));
      terminal.sendInput("\r");
      await eventually(() => client.teamCoordinatorUpdates.length === 1);
      expect(client.teamCoordinatorUpdates).toEqual([
        {
          conversationId: "team_product_tui",
          expectedCoordinatorParticipantId: "participant_agent",
          coordinatorParticipantId: null,
        },
      ]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("confirms an irreversible agent removal before changing canonical state", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    client.team = {
      ...client.team,
      conversation: {
        ...client.team.conversation,
        participantCount: client.team.conversation.participantCount + 1,
        activeAgentCount: client.team.conversation.activeAgentCount + 1,
      },
      participants: [
        ...client.team.participants,
        {
          participantId: "participant_reviewer",
          kind: "agent",
          displayName: "Review agent",
          state: "active",
          createdAt: 13,
          updatedAt: 13,
        },
      ],
    };
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOR");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Remove agent"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Remove agent?"));
      expect(client.teamParticipantUpdates).toHaveLength(0);
      expect(await terminal.text()).toContain("Review agent");

      terminal.sendInput("\r");
      await eventually(() => client.teamParticipantUpdates.length === 1);
      expect(client.teamParticipantUpdates).toEqual([
        {
          conversationId: "team_product_tui",
          participantId: "participant_reviewer",
          state: "left",
        },
      ]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("returns from participant actions to Group details", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOR");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Clear coordinator"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      expect(await terminal.text()).toContain("Add agent");
    } finally {
      await fullScreen.stop();
    }
  });

  it("projects public Team timeline content without runtime evidence", () => {
    const rendered = projectTuiTeamTimeline(teamConversationPage());
    expect(rendered).toContain("Public Team history");
    expect(rendered).toContain("You | Sent");
    expect(rendered).not.toContain("team_message_existing");
    expect(rendered).not.toContain("participant_user");
    expect(rendered).not.toContain("jobId");
  });

  it("keeps a rejected Team message in the editor", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    client.rejectTeamCommand = true;
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("rejected group message");
      terminal.sendInput("\r");
      await eventually(
        () => fullScreen.state().errorMessage === "Team round rejected",
      );
      expect(fullScreen.state().draft).toBe("rejected group message");
      expect(client.teamRoundSubmissions).toHaveLength(1);
      expect(fullScreen.state().team?.messages).toHaveLength(1);
    } finally {
      await fullScreen.stop();
    }
  });

  it("creates a coordinated group by default without rendering its idempotency key", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u000f");
      await eventually(() => terminalTextContains(terminal, "New group"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Give this group a short title"));
      terminal.sendInput("Platform group");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Group mode"));
      terminal.sendInput("\r");
      await eventually(() => client.teamCreates.length === 1);
      await eventually(() => fullScreen.state().selection?.kind === "team");
      expect(client.teamCreates[0]).toMatchObject({
        title: "Platform group",
        mode: "coordinated",
      });
      const request = client.teamCreates[0] as { readonly idempotencyKey: string };
      expect(request.idempotencyKey).toMatch(/^tui-team-conversation:/);
      expect(await terminal.text()).not.toContain(request.idempotencyKey);
      expect(fullScreen.state().team?.conversation.title).toBe("Platform group");
    } finally {
      await fullScreen.stop();
    }
  });

  it("adds an existing agent from Group details without rendering its session id", async () => {
    const client = new FullScreenClientFixture();
    client.addSession(
      "agent_session_private",
      "Research agent",
      "Agent history",
      "agent",
    );
    client.setTeamSelection();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOR");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Research agent"));
      const picker = await terminal.text();
      expect(picker).not.toContain("agent_session_private");
      terminal.sendInput("\r");
      await eventually(() => client.teamParticipantAdds.length === 1);
      expect(client.teamParticipantAdds[0]).toMatchObject({
        conversationId: "team_product_tui",
        agentSessionId: "agent_session_private",
      });
      const request = client.teamParticipantAdds[0] as { readonly idempotencyKey: string };
      expect(request.idempotencyKey).toMatch(/^tui-team-participant:/);
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps Group details open and rereads canonical authority after stale coordinator CAS", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    client.rejectTeamCoordinator = true;
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const readsBefore = client.readCounts.team;
      terminal.sendInput("\u001bOR");
      await eventually(() => terminalTextContains(terminal, "Group details"));
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Clear coordinator"));
      terminal.sendInput("\r");
      await eventually(() => terminalTextContains(terminal, "Clear coordinator?"));
      terminal.sendInput("\r");
      await eventually(() => client.teamCoordinatorUpdates.length === 1);
      await eventually(
        () => fullScreen.state().errorMessage === "Coordinator changed; refresh and retry",
      );
      expect(client.readCounts.team).toBeGreaterThan(readsBefore);
      expect(fullScreen.state().team?.conversation.coordinatorParticipantId).toBe(
        "participant_agent",
      );
      expect(await terminal.text()).toContain("Group details");
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps Session-only controls inert in a Team selection", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOS");
      terminal.sendInput("\u001b[15~");
      terminal.sendInput("\u001b[17~");
      terminal.sendInput("\u000e");
      terminal.sendInput("\u0007");
      await terminal.waitForRender();
      expect(client.planStarts).toHaveLength(0);
      expect(client.goalStarts).toHaveLength(0);
      expect(client.sideQueryStarts).toHaveLength(0);
      expect(fullScreen.state().mode).toBe("submit");
      expect(fullScreen.state().selection?.kind).toBe("team");
    } finally {
      await fullScreen.stop();
    }
  });

  it("gates coordinated and active Team rounds from the canonical page", () => {
    const page = teamConversationPage();
    const withoutCoordinator = {
      ...page,
      conversation: (() => {
        const { coordinatorParticipantId: _coordinator, ...conversation } = page.conversation;
        return conversation;
      })(),
    };
    expect(teamComposerAvailability({
      page: withoutCoordinator,
      providerCanRun: true,
    })).toMatchObject({
      canDraft: true,
      canSubmit: false,
      message: "Choose a coordinator before sending",
    });
    expect(teamComposerAvailability({
      page: {
        ...page,
        conversation: { ...page.conversation, activeRound: true },
      },
      providerCanRun: true,
    })).toMatchObject({
      canSubmit: false,
      message: "Waiting for the current round to finish",
    });
  });

  it("clears selection-specific state when switching between Session and Team", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(80, 20);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(fullScreen.state().transcript?.sessionId).toBe(
        "session_product_tui",
      );
      expect(fullScreen.state().team).toBeUndefined();

      client.setTeamSelection();
      await fullScreen.refresh();
      expect(fullScreen.state().selection).toEqual({
        kind: "team",
        conversationId: "team_product_tui",
      });
      expect(fullScreen.state().team?.conversation.title).toBe(
        "Research group",
      );
      expect(fullScreen.state().transcript).toBeUndefined();
      expect(fullScreen.state().attachments).toBeUndefined();
      expect(fullScreen.state().operation).toBeUndefined();

      await client.selectSession({ sessionId: "session_product_tui" });
      await fullScreen.refresh();
      expect(fullScreen.state().selection).toEqual({
        kind: "session",
        sessionId: "session_product_tui",
      });
      expect(fullScreen.state().team).toBeUndefined();
      expect(fullScreen.state().transcript?.sessionId).toBe(
        "session_product_tui",
      );
    } finally {
      await fullScreen.stop();
    }
  });

  it("rereads only the selected Team after Surface invalidation", async () => {
    const client = new FullScreenClientFixture();
    client.setTeamSelection();
    const terminal = new TuiVirtualTerminal(80, 20);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(client.readCounts.team).toBe(1);

      client.emitTeamInvalidation(1, "team_other");
      client.emitTeamInvalidation(2, "team_product_tui");
      client.emitTeamInvalidation(3, "team_product_tui");
      await eventually(() => client.readCounts.team === 2);
      await settleEventLoop();
      expect(client.readCounts.team).toBe(2);

      client.emitTeamInvalidation(4);
      await eventually(() => client.readCounts.team === 3);
    } finally {
      await fullScreen.stop();
    }
  });

  it("clears accepted input and restores rejected input with Product feedback", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("accepted message");
      terminal.sendInput("\r");
      await eventually(() => client.submissions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.submissions).toEqual([
        { text: "accepted message", sessionId: "session_product_tui" },
      ]);
      expect(fullScreen.state()).toMatchObject({
        draft: "",
        statusMessage: "Message accepted",
      });

      client.rejectSubmission = true;
      terminal.sendInput("keep rejected draft");
      terminal.sendInput("\r");
      await eventually(() => client.submissions.length === 2);
      await eventually(
        () => fullScreen.state().errorMessage === "provider is unavailable",
      );
      expect(fullScreen.state().draft).toBe("keep rejected draft");
      expect(await terminal.text()).toContain("keep rejected draft");
      expect(await terminal.text()).toContain("provider is unavailable");
    } finally {
      await fullScreen.stop();
    }
  });

  it("renders transient deltas, ignores stale events, and reconciles invalidation canonically", async () => {
    const client = new FullScreenClientFixture();
    client.operation = operation({ terminal: false });
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      client.emitAssistantDelta(1, "Streaming ");
      client.emitAssistantDelta(2, "answer");
      await terminal.waitForRender();
      expect(fullScreen.state().transientAssistantText).toBe(
        "Streaming answer",
      );
      expect(await terminal.text()).toContain("Streaming answer");

      client.emitAssistantDelta(2, " duplicate");
      expect(fullScreen.state().transientAssistantText).toBe(
        "Streaming answer",
      );

      client.transcript = transcript([
        historyRow("assistant", "Canonical gap recovery", "row_gap"),
      ]);
      client.emitAssistantDelta(4, "must not append across a gap");
      await eventually(() => {
        const part = fullScreen.state().transcript?.rows[0]?.parts[0];
        return part?.type === "text" && part.text === "Canonical gap recovery";
      });
      expect(fullScreen.state().transientAssistantText).toBeUndefined();
      expect(await terminal.text()).toContain("Canonical gap recovery");
      expect(await terminal.text()).not.toContain(
        "must not append across a gap",
      );

      client.transcript = transcript([
        historyRow("assistant", "Canonical settled answer", "row_settled"),
      ]);
      client.operation = operation({ terminal: true, state: "succeeded" });
      client.emitInvalidation(5);
      await eventually(
        () => fullScreen.state().transientAssistantText === undefined,
      );
      expect(await terminal.text()).toContain("Canonical settled answer");
      expect(await terminal.text()).not.toContain("Streaming answer");
      expect(client.readCounts.transcript).toBeGreaterThan(1);
    } finally {
      await fullScreen.stop();
    }
  });

  it("replays a streaming delta received during initial canonical loading", async () => {
    const client = new FullScreenClientFixture();
    client.operation = operation({ terminal: false });
    const releaseHomeRead = client.pauseHomeRead();
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      const started = fullScreen.start();
      await eventually(() => client.readCounts.home === 1);
      client.emitAssistantDelta(1, "Early streaming delta");
      releaseHomeRead();
      await started;

      expect(fullScreen.state().transientAssistantText).toBe(
        "Early streaming delta",
      );
      expect(await terminal.text()).toContain("Early streaming delta");
    } finally {
      await fullScreen.stop();
    }
  });

  it("dispatches queue, guide, stop, and approval through typed Product requests", async () => {
    const client = new FullScreenClientFixture();
    client.operation = operation({
      terminal: false,
      approval: true,
      state: "waiting",
    });
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(await terminal.text()).toContain("Tool approval");
      terminal.sendInput("\u000f");
      terminal.sendInput("\u001bOQ");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Tool approval");
      expect(await terminal.text()).not.toContain("Conversations");
      expect(await terminal.text()).not.toContain("Models");
      expect(client.readCounts.models).toBe(0);
      terminal.sendInput("\r");
      await eventually(() => client.approvals.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.approvals).toEqual([
        {
          sessionId: "session_product_tui",
          approvalId: "approval_product_tui",
          expectedApprovalRevision: 3,
          decision: "approve_once",
          reason: "approved in TUI",
        },
      ]);

      client.operation = operation({ terminal: false });
      await fullScreen.refresh();
      terminal.sendInput("\u000e");
      terminal.sendInput("queued follow-up");
      terminal.sendInput("\r");
      await eventually(() => client.queued.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.queued[0]).toEqual({
        operationId: "operation_product_tui",
        sessionId: "session_product_tui",
        text: "queued follow-up",
      });

      terminal.sendInput("\u0007");
      terminal.sendInput("guide now");
      terminal.sendInput("\r");
      await eventually(() => client.guided.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.guided[0]).toMatchObject({
        input: {
          operationId: "operation_product_tui",
          sessionId: "session_product_tui",
          text: "guide now",
        },
        requestId: expect.stringMatching(/^tui-steer-/),
      });

      terminal.sendInput("\u0018");
      await eventually(() => client.cancellations.length === 1);
      expect(client.cancellations[0]).toEqual({
        sessionId: "session_product_tui",
        reason: "user requested cancellation from TUI",
      });
    } finally {
      await fullScreen.stop();
    }
  });

  it("opens recent conversations or a new conversation without losing the draft", async () => {
    const client = new FullScreenClientFixture();
    client.addSession(
      "session_second",
      "Second conversation",
      "Second history",
    );
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("draft survives navigation");
      terminal.sendInput("\u000f");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Conversations");
      expect(await terminal.text()).toContain("New conversation");
      expect(await terminal.text()).toContain("* Project discussion");

      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => client.sessionSelections.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.sessionSelections).toEqual([
        { sessionId: "session_second" },
      ]);
      expect(fullScreen.state()).toMatchObject({
        selection: { kind: "session", sessionId: "session_second" },
        draft: "draft survives navigation",
      });
      expect(await terminal.text()).toContain("Second history");

      terminal.sendInput("\u000f");
      terminal.sendInput("\u001b");
      await terminal.waitForRender();
      expect(client.sessionSelections).toHaveLength(1);
      expect(fullScreen.state().draft).toBe("draft survives navigation");

      client.rejectSessionSelection = true;
      terminal.sendInput("\u000f");
      terminal.sendInput("\u001b[A");
      terminal.sendInput("\r");
      await eventually(() => client.sessionSelections.length === 2);
      await eventually(
        () =>
          fullScreen.state().errorMessage ===
          "selectSession failed: session selection rejected",
      );
      expect(fullScreen.state()).toMatchObject({
        selection: { kind: "session", sessionId: "session_second" },
        draft: "draft survives navigation",
      });
      expect(await terminal.text()).toContain("Second history");
      client.rejectSessionSelection = false;

      terminal.sendInput("\u000f");
      terminal.sendInput("\u001b[A");
      terminal.sendInput("\u001b[A");
      terminal.sendInput("\r");
      await eventually(() => client.newConversationCount === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(fullScreen.state()).toMatchObject({
        draft: "draft survives navigation",
        statusMessage: "New conversation ready",
      });
      expect(fullScreen.state().selection).toBeUndefined();
      expect(await terminal.text()).toContain(
        "Start with a question, a file, or a task.",
      );
    } finally {
      await fullScreen.stop();
    }
  });

  it("selects a configured model canonically and preserves draft on rejection", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("model-safe draft");
      terminal.sendInput("\u001bOQ");
      await eventually(() => client.readCounts.models === 1);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Models");
      expect(await terminal.text()).toContain("* deepseek-chat");
      expect(await terminal.text()).toContain("gpt-5.4");
      expect(await terminal.text()).not.toContain("secretRef");

      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => client.modelSelections.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.modelSelections).toEqual([
        { endpointId: "endpoint_openai" },
      ]);
      expect(fullScreen.state().draft).toBe("model-safe draft");
      expect(await terminal.text()).toContain("Model selected | gpt-5.4");

      client.rejectModelSelection = true;
      terminal.sendInput("\u001bOQ");
      await eventually(() => client.readCounts.models === 2);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Models");
      terminal.sendInput("\u001b[A");
      terminal.sendInput("\r");
      await eventually(() => client.modelSelections.length === 2);
      await eventually(
        () =>
          fullScreen.state().errorMessage ===
          "setActiveModelEndpoint failed: model selection rejected",
      );
      expect(fullScreen.state().draft).toBe("model-safe draft");
      expect(client.home.providerReadiness.activeEndpointId).toBe(
        "endpoint_openai",
      );
      expect(await terminal.text()).toContain("model selection rejected");
    } finally {
      await fullScreen.stop();
    }
  });

  it("discovers and filters dynamic plugin commands before preview and execution", async () => {
    const client = new FullScreenClientFixture();
    client.commandCatalog = {
      ...client.commandCatalog,
      commands: [
        ...client.commandCatalog.commands,
        productCommand({
          id: "product.shutdown",
          title: "Shutdown",
          paletteVisibility: "hidden",
        }),
      ],
    };
    const terminal = new TuiVirtualTerminal(90, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const initialHomeReads = client.readCounts.home;
      terminal.sendInput("command-safe draft");
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await terminal.waitForRender();
      const catalogView = await terminal.text();
      expect(catalogView).toContain("Product commands");
      expect(catalogView).toContain("Status");
      expect(catalogView).toContain("Plugin Action");
      expect(catalogView).not.toContain("Shutdown");
      expect(catalogView).not.toContain("secretRef:do-not-render");
      expect(catalogView).not.toContain("storeDir");

      terminal.sendInput("\u001b");
      await terminal.waitForRender();
      expect(fullScreen.state().draft).toBe("command-safe draft");

      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 2);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      terminal.sendInput("plugin");
      await terminal.waitForRender();
      const filtered = await terminal.text();
      expect(filtered).toContain("Plugin Action");
      expect(filtered).not.toContain("Status");
      terminal.sendInput("\r");

      await eventually(() => client.commandPreviews.length === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Execute Plugin Action?");
      expect(client.commandCallOrder).toEqual(["preview:plugin.example"]);
      expect(client.commandExecutions).toHaveLength(0);

      terminal.sendInput("\r");
      await eventually(() => client.commandExecutions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.commandCallOrder).toEqual([
        "preview:plugin.example",
        "execute:plugin.example",
      ]);
      expect(client.commandExecutions).toEqual([
        { commandId: "plugin.example" },
      ]);
      expect(client.readCounts.home).toBeGreaterThan(initialHomeReads);
      expect(fullScreen.state()).toMatchObject({
        draft: "command-safe draft",
        statusMessage: "Command completed: Plugin Action",
      });
    } finally {
      await fullScreen.stop();
    }
  });

  it("renders hostile plugin command metadata without changing its opaque command ID", async () => {
    const osc = "\u001b]0;plugin-attacker-title\u0007";
    const commandId = `plugin.opaque${osc}`;
    const client = new FullScreenClientFixture();
    client.commandCatalog = {
      commands: [
        productCommand({
          id: commandId,
          title: `插件${osc}\n动作 👩‍💻\u202e`,
          sourceKind: "plugin",
          sourceScope: "user",
          trust: "user_enabled",
        }),
      ],
      diagnostics: [],
    };
    const terminal = new TuiVirtualTerminal(92, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await eventually(() => !fullScreen.state().busy);
      const catalog = await terminal.text();
      expect(catalog).toContain("插件 动作 👩‍💻");
      expect(catalog).not.toContain("plugin-attacker-title");
      expect(terminal.titles).toEqual(["Wanex"]);

      terminal.sendInput("\r");
      await eventually(() => client.commandPreviews.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.commandPreviews).toEqual([{ commandId }]);
      const confirmation = await terminal.text();
      expect(confirmation).toContain("Execute 插件 动作 👩‍💻?");
      expect(confirmation).not.toContain("plugin-attacker-title");
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("collects closed schema fields with typed Pi inputs and local validation", async () => {
    const client = new FullScreenClientFixture();
    client.commandCatalog = {
      commands: [
        productCommand({
          id: "product.configure",
          title: "Configure Product",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 2 },
              mode: { type: "string", enum: ["safe", "fast"] },
              enabled: { type: "boolean" },
              metadata: {
                type: "object",
                properties: { source: { type: "string" } },
                additionalProperties: false,
              },
              tags: { type: "array", items: { type: "string" } },
              count: { type: "integer", minimum: 1, maximum: 3 },
            },
            required: ["name", "mode", "enabled", "metadata", "tags"],
            additionalProperties: false,
          },
        }),
      ],
      diagnostics: [],
    };
    const terminal = new TuiVirtualTerminal(96, 26);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("typed draft");
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      terminal.sendInput("\r");

      terminal.sendInput("Wanex");
      terminal.sendInput("\r");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput('{"source":"tui"}');
      terminal.sendInput("\r");
      terminal.sendInput('["one","two"]');
      terminal.sendInput("\r");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      terminal.sendInput("0");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("value is below the minimum");
      expect(client.commandPreviews).toHaveLength(0);

      terminal.sendInput("\u0015");
      terminal.sendInput("2");
      terminal.sendInput("\r");
      await eventually(() => client.commandPreviews.length === 1);
      expect(client.commandPreviews[0]).toEqual({
        commandId: "product.configure",
        input: {
          name: "Wanex",
          mode: "fast",
          enabled: true,
          metadata: { source: "tui" },
          tags: ["one", "two"],
          count: 2,
        },
      });
      expect(fullScreen.state().draft).toBe("typed draft");

      terminal.sendInput("\u001b");
      await terminal.waitForRender();
      expect(client.commandExecutions).toHaveLength(0);
      expect(fullScreen.state().draft).toBe("typed draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps open-object syntax local and preserves Product preview rejection", async () => {
    const client = new FullScreenClientFixture();
    client.rejectCommandPreview = true;
    client.commandCatalog = {
      commands: [
        productCommand({
          id: "plugin.open-input",
          title: "Open Input Action",
          sourceKind: "plugin",
          sourceScope: "user",
          trust: "user_enabled",
          inputSchema: {
            type: "object",
            properties: { known: { type: "string" } },
          },
        }),
      ],
      diagnostics: [],
    };
    const terminal = new TuiVirtualTerminal(90, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("preview-safe draft");
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      terminal.sendInput("\r");
      terminal.sendInput("not-json");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain(
        "value must be valid JSON object",
      );
      expect(client.commandPreviews).toHaveLength(0);

      terminal.sendInput("\u0015");
      terminal.sendInput('{"known":"value","dynamic":true}');
      terminal.sendInput("\r");
      await eventually(
        () => fullScreen.state().errorMessage === "preview blocked by Product",
      );
      expect(client.commandPreviews).toEqual([
        {
          commandId: "plugin.open-input",
          input: { known: "value", dynamic: true },
        },
      ]);
      expect(client.commandExecutions).toHaveLength(0);
      expect(fullScreen.state().draft).toBe("preview-safe draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("surfaces execution rejection without synthesizing Product state", async () => {
    const client = new FullScreenClientFixture();
    client.rejectCommandExecution = true;
    client.commandCatalog = {
      commands: [productCommand({ id: "product.status", title: "Status" })],
      diagnostics: [],
    };
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const initialHomeReads = client.readCounts.home;
      terminal.sendInput("execution-safe draft");
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      terminal.sendInput("\r");
      await eventually(() => client.commandPreviews.length === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Execute Status?");
      terminal.sendInput("\r");
      await eventually(
        () =>
          fullScreen.state().errorMessage === "execution rejected by Product",
      );
      expect(client.commandExecutions).toEqual([
        { commandId: "product.status" },
      ]);
      expect(client.readCounts.home).toBe(initialHomeReads);
      expect(fullScreen.state().draft).toBe("execution-safe draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("lets an arriving tool approval invalidate the entire command workflow", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("approval-safe draft");
      terminal.sendInput("\u0010");
      await eventually(() => client.readCounts.commands === 1);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Product commands");

      client.operation = operation({
        terminal: false,
        approval: true,
        state: "waiting",
      });
      await fullScreen.refresh();
      const approvalView = await terminal.text();
      expect(approvalView).toContain("Tool approval");
      expect(approvalView).not.toContain("Product commands");
      expect(fullScreen.state().draft).toBe("approval-safe draft");

      terminal.sendInput("\u0010");
      await terminal.waitForRender();
      expect(client.readCounts.commands).toBe(1);
      expect(await terminal.text()).toContain("Tool approval");
    } finally {
      await fullScreen.stop();
    }
  });

  it("adds and removes canonical attachments through the trusted host boundary", async () => {
    const client = new FullScreenClientFixture();
    const attachmentCalls: unknown[] = [];
    const attachmentHost: TuiAttachmentHost = {
      async attachPath(request) {
        attachmentCalls.push(request);
        client.setAttachments(request.sessionId, [
          attachmentDraft({
            resourceId: "resource_diagram",
            label: "diagram.png",
          }),
        ]);
        return { resourceId: "resource_diagram", label: "diagram.png" };
      },
    };
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({
      client,
      terminal,
      attachmentHost,
    });

    try {
      await fullScreen.start();
      terminal.sendInput("attachment-safe draft");
      terminal.sendInput("\u001bOR");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Attachments");
      expect(await terminal.text()).toContain("Add attachment");

      terminal.sendInput("\r");
      terminal.sendInput("/trusted/input/diagram.png");
      terminal.sendInput("\r");
      await eventually(
        () => fullScreen.state().attachments?.attachments.length === 1,
      );
      await eventually(() => !fullScreen.state().busy);
      expect(attachmentCalls).toEqual([
        {
          path: "/trusted/input/diagram.png",
          sessionId: "session_product_tui",
        },
      ]);
      expect(fullScreen.state().draft).toBe("attachment-safe draft");
      const prepared = await terminal.text();
      expect(prepared).toContain("Attachments (1): diagram.png [image]");
      expect(prepared).not.toContain("/trusted/input");
      expect(prepared).not.toContain("a".repeat(64));

      terminal.sendInput("\u001bOR");
      await terminal.waitForRender();
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Remove diagram.png?");
      terminal.sendInput("\r");
      await eventually(
        () => fullScreen.state().attachments?.attachments.length === 0,
      );
      await eventually(() => !fullScreen.state().busy);
      expect(client.attachmentRemovals).toEqual([
        {
          resourceId: "resource_diagram",
          sessionId: "session_product_tui",
        },
      ]);
      expect(fullScreen.state().draft).toBe("attachment-safe draft");
      expect(await terminal.text()).not.toContain("diagram.png [image]");
    } finally {
      await fullScreen.stop();
    }
  });

  it("renders hostile attachment labels as inert single-line terminal text", async () => {
    const client = new FullScreenClientFixture();
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_hostile_label",
        label: "diagram\u001b[31m\u001b]0;attacker-title\u0007\nnext\u202Ename",
      }),
    ]);
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const rendered = await terminal.text();
      expect(rendered).toContain("diagram nextname [image]");
      expect(rendered).not.toContain("attacker-title");
      expect(rendered).not.toContain("\\u001b");
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps every externally sourced display value inert across the xterm journey", async () => {
    const osc = "\u001b]0;attacker-title\u0007";
    const csi = "\u001b[31m";
    const reset = "\u001b[0m";
    const c1Osc = "\u009d0;c1-payload\u009c";
    const client = new FullScreenClientFixture();
    const opaqueEndpointId = `endpoint_hostile${osc}`;
    const activeEndpoint = modelEndpoint(
      opaqueEndpointId,
      `provider${osc}\n危险`,
      `model${osc}\n视觉 👩‍💻\u202e`,
      true,
    );
    client.home = {
      ...client.home,
      product: {
        ...client.home.product,
        sessions: {
          ...client.home.product.sessions,
          recent: client.home.product.sessions.recent.map((session) => ({
            ...session,
            title: `项目${osc}\n讨论 👩‍💻\u202e`,
          })),
        },
      },
      providerReadiness: {
        ...client.home.providerReadiness,
        activeEndpointId: activeEndpoint.id,
        activeEndpoint,
      },
    };
    client.modelEndpoints.splice(
      0,
      client.modelEndpoints.length,
      activeEndpoint,
    );
    client.transcript = transcript([
      {
        ...historyRow("assistant", "unused", "row_hostile"),
        parts: [
          {
            key: "hostile_text",
            type: "text",
            text: `第一行 ${csi}红色${reset}${osc}\n第二行 👩‍💻`,
          },
          {
            key: "hostile_reasoning",
            type: "reasoning",
            text: `推理${c1Osc}\n继续`,
          },
          {
            key: "hostile_tool",
            type: "tool",
            name: `工具${osc}\n发布\u202e`,
            state: "running",
          },
        ],
      },
    ]);
    client.operation = operation({ terminal: false });
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_hostile_everywhere",
        label: `图像${osc}\n附件\u202e.png`,
      }),
    ]);
    const terminal = new TuiVirtualTerminal(96, 26);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const initial = await terminal.text();
      expect(initial).toContain("项目 讨论 👩‍💻");
      expect(initial).toContain("model 视觉 👩‍💻");
      expect(initial).toContain("第一行 红色");
      expect(initial).toContain("第二行 👩‍💻");
      expect(initial).toContain("Thinking: 推理 0;c1-payload");
      expect(initial).toContain("Tool: 工具 发布 | running");
      expect(initial).toContain("图像 附件.png [image]");
      expect(initial).not.toContain("attacker-title");
      expect(terminal.titles).toEqual(["Wanex"]);

      terminal.sendInput("\u001bOQ");
      await eventually(() => client.readCounts.models === 1);
      await eventually(() => !fullScreen.state().busy);
      const models = await terminal.text();
      expect(models).toContain("model 视觉 👩‍💻");
      expect(models).toContain("provider 危险");
      expect(models).not.toContain("attacker-title");
      expect(terminal.titles).toEqual(["Wanex"]);
      terminal.sendInput("\r");
      await eventually(() => client.modelSelections.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.modelSelections).toEqual([
        { endpointId: opaqueEndpointId },
      ]);

      client.emitAssistantDelta(
        1,
        `流式${osc}${csi}内容${reset}\n保留换行 👩‍💻\u202e`,
      );
      await terminal.waitForRender();
      const streaming = await terminal.text();
      expect(streaming).toContain("流式内容");
      expect(streaming).toContain("保留换行 👩‍💻");
      expect(terminal.titles).toEqual(["Wanex"]);

      terminal.sendInput(
        "\u001b[200~粘贴\u009d0;paste-title\u009c 👩‍💻\u202e\u001b[201~",
      );
      await terminal.waitForRender();
      expect(fullScreen.state().draft).toBe("粘贴 0;paste-title  👩‍💻");
      expect(terminal.titles).toEqual(["Wanex"]);
      terminal.sendInput("\u0015");

      const approvalOperation = operation({
        terminal: false,
        approval: true,
        state: "waiting",
      });
      const approval = approvalOperation.approvals?.items[0];
      if (approval === undefined) throw new Error("approval is required");
      const opaqueApprovalId = `approval${osc}`;
      client.operation = {
        ...approvalOperation,
        approvals: {
          items: [
            {
              ...approval,
              approvalId: opaqueApprovalId,
              tool: {
                ...approval.tool,
                title: `发布${osc}\n结果\u202e`,
              },
              presentation: {
                ...approval.presentation,
                summary: `确认${osc}\n发布 👩‍💻`,
                details: [
                  {
                    ...approval.presentation.details[0]!,
                    label: `目标${osc}\n服务`,
                    value: `配置${c1Osc}\n完成`,
                  },
                ],
              },
            },
          ],
          truncated: false,
        },
      };
      await fullScreen.refresh();
      const approvalView = await terminal.text();
      expect(approvalView).toContain("发布 结果");
      expect(approvalView).toContain("确认");
      expect(approvalView).toContain("发布 👩‍💻");
      expect(approvalView).toContain("目标 服务: 配置 0;c1-payload");
      expect(approvalView).toContain("完成");
      expect(terminal.titles).toEqual(["Wanex"]);
      terminal.sendInput("\r");
      await eventually(() => client.approvals.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.approvals[0]).toMatchObject({
        approvalId: opaqueApprovalId,
      });

      client.rejectSubmission = true;
      client.submissionRejectionMessage = `失败${osc}\n请重试 👩‍💻\u202e`;
      terminal.sendInput("error request");
      terminal.sendInput("\r");
      await eventually(
        () =>
          fullScreen.state().errorMessage === client.submissionRejectionMessage,
      );
      const rejected = await terminal.text();
      expect(rejected).toContain("失败 请重试 👩‍💻");
      expect(rejected).not.toContain("attacker-title");
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("preserves an attachment-only draft on rejection and consumes it on acceptance", async () => {
    const client = new FullScreenClientFixture();
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_photo",
        label: "photo.png",
      }),
    ]);
    client.rejectSubmission = true;
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(await terminal.text()).toContain("photo.png [image]");
      terminal.sendInput("\r");
      await eventually(() => client.submissions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.submissions[0]).toEqual({
        text: "",
        sessionId: "session_product_tui",
      });
      expect(fullScreen.state().errorMessage).toBe("provider is unavailable");
      expect(fullScreen.state().attachments?.attachments).toHaveLength(1);

      client.rejectSubmission = false;
      terminal.sendInput("\r");
      await eventually(() => client.submissions.length === 2);
      await eventually(() => !fullScreen.state().busy);
      expect(fullScreen.state().attachments?.attachments).toHaveLength(0);
      expect(fullScreen.state().statusMessage).toBe("Message accepted");
      expect(await terminal.text()).not.toContain("photo.png [image]");
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps the composer and canonical drafts after a trusted attachment host error", async () => {
    const client = new FullScreenClientFixture();
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_existing",
        label: "existing.pdf",
        resourceKind: "document",
        previewKind: "document",
        mediaType: "application/pdf",
      }),
    ]);
    const attachmentHost: TuiAttachmentHost = {
      async attachPath() {
        throw new Error("attachment exceeds the trusted host limit");
      },
    };
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({
      client,
      terminal,
      attachmentHost,
    });

    try {
      await fullScreen.start();
      terminal.sendInput("host-error draft");
      terminal.sendInput("\u001bOR");
      terminal.sendInput("\r");
      terminal.sendInput("/private/new-file.pdf");
      terminal.sendInput("\r");
      await eventually(
        () =>
          fullScreen.state().errorMessage ===
          "attachment exceeds the trusted host limit",
      );
      expect(fullScreen.state().draft).toBe("host-error draft");
      expect(fullScreen.state().attachments?.attachments).toHaveLength(1);
      const failed = await terminal.text();
      expect(failed).toContain("existing.pdf [document]");
      expect(failed).not.toContain("/private/new-file.pdf");
    } finally {
      await fullScreen.stop();
    }
  });

  it("rereads Session-scoped attachment drafts after navigation", async () => {
    const client = new FullScreenClientFixture();
    client.addSession(
      "session_second",
      "Second conversation",
      "Second history",
    );
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_first",
        label: "first.png",
      }),
    ]);
    client.setAttachments("session_second", [
      attachmentDraft({
        resourceId: "resource_second",
        label: "second.pdf",
        resourceKind: "document",
        previewKind: "document",
        mediaType: "application/pdf",
      }),
    ]);
    const terminal = new TuiVirtualTerminal(84, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      expect(await terminal.text()).toContain("first.png [image]");
      terminal.sendInput("\u000f");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => {
        const selection = fullScreen.state().selection;
        return (
          selection?.kind === "session" &&
          selection.sessionId === "session_second"
        );
      });
      await eventually(() => !fullScreen.state().busy);
      const selected = await terminal.text();
      expect(selected).toContain("second.pdf [document]");
      expect(selected).not.toContain("first.png [image]");
    } finally {
      await fullScreen.stop();
    }
  });

  it("gives an arriving Tool approval priority over attachment input", async () => {
    const client = new FullScreenClientFixture();
    const attachmentHost: TuiAttachmentHost = {
      async attachPath() {
        throw new Error("attachment host must not run");
      },
    };
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({
      client,
      terminal,
      attachmentHost,
    });

    try {
      await fullScreen.start();
      terminal.sendInput("approval attachment draft");
      terminal.sendInput("\u001bOR");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Add attachment");

      client.operation = operation({
        terminal: false,
        approval: true,
        state: "waiting",
      });
      await fullScreen.refresh();
      const approvalView = await terminal.text();
      expect(approvalView).toContain("Tool approval");
      expect(approvalView).not.toContain("Add attachment");
      expect(fullScreen.state().draft).toBe("approval attachment draft");

      terminal.sendInput("\u001bOR");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Tool approval");
    } finally {
      await fullScreen.stop();
    }
  });

  it("generates, reviews, revision-fences, and executes a contextual Plan without changing the composer", async () => {
    const osc = "\u001b]0;attacker-plan-title\u0007";
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(100, 32);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("composer draft survives Plan");
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 1);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Create Plan");

      terminal.sendInput("Prepare the reviewed implementation");
      terminal.sendInput("\r");
      await eventually(() => client.planStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);
      const operationId = client.planGeneration?.operationId;
      if (operationId === undefined) throw new Error("Plan generation is required");
      expect(operationId).toBe("opaque-plan-operation-1");
      expect(client.planStarts).toEqual([
        {
          text: "Prepare the reviewed implementation",
          sessionId: "session_product_tui",
        },
      ]);
      expect(fullScreen.state().draft).toBe("composer draft survives Plan");
      expect(await terminal.text()).toContain("Generation: running");
      expect(await terminal.text()).not.toContain(operationId);

      client.completePlanGeneration(
        planProposal({
          title: `计划${osc}\n审阅 👩‍💻\u202e`,
          summary: "第一行\n第二行 remains visible",
          steps: [
            {
              id: "opaque-hostile-step",
              title: `检查${osc}\n边界`,
              detail: "保留 CJK 与 emoji 👩‍💻",
            },
          ],
        }),
      );
      client.emitPlanInvalidation(1, "generation_succeeded", {
        operationId,
        proposalId: "opaque-plan-proposal",
      });
      await eventually(
        () => client.readCounts.planGeneration >= 1 && client.readCounts.planProposal >= 2,
      );
      await terminal.waitForRender();
      const hostileView = await terminal.text();
      expect(hostileView).toContain("Title: 计划");
      expect(hostileView).toContain("审阅 👩‍💻");
      expect(hostileView).toContain("第一行");
      expect(hostileView).toContain("第二行 remains visible");
      expect(hostileView).toContain("保留 CJK 与 emoji 👩‍💻");
      expect(hostileView).not.toContain("attacker-plan-title");
      expect(hostileView).not.toContain("opaque-plan-proposal");
      expect(hostileView).not.toContain("opaque-hostile-step");
      expect(terminal.titles).toEqual(["Wanex"]);

      const readsBeforeGap = client.readCounts.planProposal;
      client.planProposal = planProposal({
        revision: 2,
        title: "Canonical Plan after event gap",
      });
      client.emitPlanInvalidation(3, "proposal_changed", {
        proposalId: "opaque-plan-proposal",
      });
      await eventually(() => client.readCounts.planProposal > readsBeforeGap);
      await eventually(() => fullScreen.state().lastEventSequence === 3);
      expect(await terminal.text()).toContain("Canonical Plan after event gap");
      expect(await terminal.text()).toContain("Revision: 2 | State: open");

      terminal.resize(54, 16);
      const compactPlan = (await terminal.viewport()).join("\n");
      expect(compactPlan).toContain("Approve Plan");
      expect(compactPlan).not.toContain("opaque-plan-proposal");
      expect(fullScreen.state().draft).toBe("composer draft survives Plan");
      terminal.resize(100, 32);

      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Approve Plan?");
      expect(client.planDecisions).toHaveLength(0);
      terminal.sendInput("\r");
      await eventually(() => client.planDecisions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planDecisions).toEqual([
        {
          proposalId: "opaque-plan-proposal",
          expectedRevision: 2,
          decision: "approve",
        },
      ]);
      expect(await terminal.text()).toContain("Revision: 3 | State: approved");
      expect(client.planExecutions).toHaveLength(0);

      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Execute Plan?");
      expect(client.planExecutions).toHaveLength(0);
      terminal.sendInput("\r");
      await eventually(() => client.planExecutions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planExecutions).toEqual([
        {
          proposalId: "opaque-plan-proposal",
          expectedRevision: 3,
        },
      ]);
      expect(fullScreen.state()).toMatchObject({
        draft: "composer draft survives Plan",
        statusMessage: "Plan execution started",
        operation: { state: "running" },
      });
      expect(await terminal.text()).not.toContain("Execute Plan?");
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("cancels and dismisses the exact Plan generation before starting again", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("cancellation-safe draft");
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 1);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Create Plan");
      terminal.sendInput("Plan something cancellable");
      terminal.sendInput("\r");
      await eventually(() => client.planStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);
      await terminal.waitForRender();

      terminal.sendInput("\r");
      await eventually(() => client.planCancellations.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planCancellations).toEqual([
        { operationId: "opaque-plan-operation-1" },
      ]);
      expect(await terminal.text()).toContain("Generation: cancelled");

      terminal.sendInput("\r");
      await eventually(() => client.planDismissals.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planDismissals).toEqual([
        { operationId: "opaque-plan-operation-1" },
      ]);
      expect(await terminal.text()).toContain("Create Plan");
      expect(fullScreen.state().draft).toBe("cancellation-safe draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("edits the canonical Plan content while preserving opaque step evidence and references", async () => {
    const client = new FullScreenClientFixture();
    client.planProposal = planProposal({
      references: [
        {
          kind: "resource",
          id: "opaque-reference",
          role: "source",
          metadata: { trusted: true },
        },
      ],
      steps: [
        {
          id: "opaque-step-one",
          title: "Inspect the current state",
          metadata: { owner: "planner" },
        },
        {
          id: "opaque-step-two",
          title: "Apply the reviewed change",
          detail: "Keep the existing Product authority.",
          metadata: { owner: "executor" },
        },
      ],
    });
    const terminal = new TuiVirtualTerminal(100, 32);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 1);
      await terminal.waitForRender();
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Plan title");

      terminal.sendInput("\u0015");
      terminal.sendInput("Revised Plan title");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("A clearer summary for approval");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("Inspect the repository");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("Read the relevant files first");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("Apply the safe change");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Revise Plan?");
      expect(client.planRevisions).toHaveLength(0);

      terminal.sendInput("\r");
      await eventually(() => client.planRevisions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planRevisions).toEqual([
        {
          proposalId: "opaque-plan-proposal",
          expectedRevision: 1,
          title: "Revised Plan title",
          summary: "A clearer summary for approval",
          steps: [
            {
              id: "opaque-step-one",
              title: "Inspect the repository",
              metadata: { owner: "planner" },
              detail: "Read the relevant files first",
            },
            {
              id: "opaque-step-two",
              title: "Apply the safe change",
              metadata: { owner: "executor" },
            },
          ],
        },
      ]);
      expect(client.planProposal?.revision).toBe(2);
      expect(client.planProposal?.references).toEqual([
        {
          kind: "resource",
          id: "opaque-reference",
          role: "source",
          metadata: { trusted: true },
        },
      ]);
      expect(await terminal.text()).toContain("Revision: 2 | State: open");
      expect(fullScreen.state().draft).toBe("");
    } finally {
      await fullScreen.stop();
    }
  });

  it("retains an edit draft across a Plan event gap and fails closed on a stale revision", async () => {
    const client = new FullScreenClientFixture();
    client.planProposal = planProposal();
    const terminal = new TuiVirtualTerminal(92, 28);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 1);
      await terminal.waitForRender();
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      terminal.sendInput("\u0015");
      terminal.sendInput("Unsaved revised title");
      await terminal.waitForRender();

      client.planProposal = planProposal({
        revision: 2,
        title: "Canonical title changed elsewhere",
      });
      const readsBeforeGap = client.readCounts.planProposal;
      client.emitPlanInvalidation(3, "proposal_changed", {
        proposalId: "opaque-plan-proposal",
      });
      await eventually(() => client.readCounts.planProposal > readsBeforeGap);
      await eventually(() => fullScreen.state().lastEventSequence === 3);
      expect(await terminal.text()).toContain("Unsaved revised title");
      expect(await terminal.text()).not.toContain("Canonical title changed elsewhere");

      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Revise Plan?");
      terminal.sendInput("\r");
      await eventually(() => client.planRevisions.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.planRevisions[0]).toMatchObject({
        expectedRevision: 1,
        title: "Unsaved revised title",
      });
      expect(fullScreen.state().errorMessage).toBe("Plan revision conflict");
      terminal.sendInput("\u001b[Z");
      terminal.sendInput("\u001b[Z");
      terminal.sendInput("\u001b[Z");
      terminal.sendInput("\u001b[Z");
      terminal.sendInput("\u001b[Z");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Plan title");
      expect(await terminal.text()).toContain("Unsaved revised title");
    } finally {
      await fullScreen.stop();
    }
  });

  it("closes Plan immediately for Tool approval and on canonical Session change", async () => {
    const client = new FullScreenClientFixture();
    client.addSession("session_second", "Second conversation", "Second history");
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("Plan priority draft");
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 1);
      expect(await terminal.text()).toContain("Create Plan");

      client.operation = operation({
        terminal: false,
        approval: true,
        state: "waiting",
      });
      await fullScreen.refresh();
      const approvalView = await terminal.text();
      expect(approvalView).toContain("Tool approval");
      expect(approvalView).not.toContain("Create Plan");
      terminal.sendInput("\u001bOS");
      await terminal.waitForRender();
      expect(client.readCounts.planProposal).toBe(1);

      terminal.sendInput("\u001b");
      client.operation = undefined;
      await client.selectSession({ sessionId: "session_second" });
      await fullScreen.refresh();
      terminal.sendInput("\u001bOS");
      await eventually(() => client.readCounts.planProposal === 2);
      expect(await terminal.text()).toContain("Create Plan");
      await client.selectSession({ sessionId: "session_product_tui" });
      await fullScreen.refresh();
      expect(await terminal.text()).not.toContain("Create Plan");
      expect(fullScreen.state().draft).toBe("Plan priority draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("collects a retained multiline Goal form, validates limits locally, and confirms the exact request", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("composer draft survives Goal");
      terminal.sendInput("\u001b[15~");
      await eventually(() => client.readCounts.goal === 1);
      expect(await terminal.text()).toContain("Create Goal");

      terminal.sendInput("实现稳定版本 👩‍💻");
      terminal.sendInput("\u001b[27;2;13~");
      terminal.sendInput("覆盖 Windows");
      client.emitInvalidation(1);
      client.emitInvalidation(3);
      await eventually(() => client.readCounts.goal >= 2);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("实现稳定版本 👩‍💻");
      expect(await terminal.text()).toContain("覆盖 Windows");
      terminal.sendInput("\r");
      terminal.sendInput("测试通过");
      terminal.sendInput("\u001b[27;2;13~");
      terminal.sendInput("无身份泄露");
      terminal.sendInput("\r");
      terminal.sendInput("仅修改 TUI");
      terminal.sendInput("\r");
      terminal.sendInput("\u001b[Z");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("3/6 Boundaries");
      expect(await terminal.text()).toContain("仅修改 TUI");
      terminal.resize(54, 16);
      const compactForm = (await terminal.viewport()).join("\n");
      expect(compactForm).toContain("3/6 Boundaries");
      expect(compactForm).toContain("仅修改 TUI");
      terminal.resize(88, 24);
      terminal.sendInput("\r");
      terminal.sendInput("不新增依赖");
      terminal.sendInput("\r");

      terminal.sendInput("\u0015");
      terminal.sendInput("0");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("maximum attempts must be a positive integer");
      expect(client.goalStarts).toHaveLength(0);

      terminal.sendInput("\u0015");
      terminal.sendInput("4");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("5");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain(
        "blocked-attempt limit cannot exceed maximum attempts",
      );
      expect(client.goalStarts).toHaveLength(0);

      terminal.sendInput("\u0015");
      terminal.sendInput("2");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Start Goal?");
      terminal.resize(54, 16);
      expect((await terminal.viewport()).join("\n")).toContain("Start Goal");
      terminal.sendInput("\u001b");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("6/6 Blocked-attempt limit");
      expect(await terminal.text()).toContain("2");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      await eventually(() => client.goalStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);

      expect(client.goalStarts).toEqual([
        {
          sessionId: "session_product_tui",
          objective: "实现稳定版本 👩‍💻\n覆盖 Windows",
          successCriteria: ["测试通过", "无身份泄露"],
          boundaries: ["仅修改 TUI"],
          constraints: ["不新增依赖"],
          stopPolicy: { maxAttempts: 4, maxConsecutiveBlockedAttempts: 2 },
        },
      ]);
      expect(fullScreen.state().draft).toBe("composer draft survives Goal");
      expect(fullScreen.state().statusMessage).toBe("Goal started");
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("reconciles Goal invalidations and gaps, then sends exact revision-fenced controls", async () => {
    const osc = "\u001b]0;attacker-goal-title\u0007";
    const client = new FullScreenClientFixture();
    client.goal = goalReadModel({
      revision: 7,
      state: "active",
      objective: `交付${osc}\n稳定目标 👩‍💻\u202e`,
      successCriteria: [
        {
          id: "opaque-criterion-id",
          description: `通过${osc}\n最终验收`,
        },
      ],
    });
    const terminal = new TuiVirtualTerminal(96, 28);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001b[15~");
      await eventually(() => client.readCounts.goal === 1);
      const initial = await terminal.text();
      expect(initial).toContain("State: active | Revision: 7");
      expect(initial).toContain("Objective: 交付");
      expect(initial).toContain("稳定目标 👩‍💻");
      expect(initial).toContain("Attempt 1: initial");
      expect(initial).not.toContain("attacker-goal-title");
      expect(initial).not.toContain("opaque-goal-id");
      expect(initial).not.toContain("opaque-attempt-id");

      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Pause Goal?");
      expect(client.goalPauses).toHaveLength(0);
      terminal.sendInput("\r");
      await eventually(() => client.goalPauses.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.goalPauses).toEqual([
        {
          goalId: "opaque-goal-id",
          expectedRevision: 7,
          reason: "paused by user in TUI",
        },
      ]);

      client.goal = goalReadModel({
        state: "paused",
        revision: 10,
        canPause: false,
        canResume: true,
        canCancel: true,
      });
      client.emitGoalInvalidation(1, "paused");
      await eventually(() => client.readCounts.goal >= 2);
      expect(await terminal.text()).toContain("State: paused | Revision: 10");

      const readsBeforeGap = client.readCounts.goal;
      client.goal = goalReadModel({
        state: "paused",
        revision: 11,
        canPause: false,
        canResume: true,
        canCancel: true,
      });
      client.emitGoalInvalidation(3, "attempt_reviewed");
      await eventually(() => client.readCounts.goal > readsBeforeGap);
      await eventually(() => fullScreen.state().lastEventSequence === 3);
      expect(await terminal.text()).toContain("Revision: 11");

      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Resume Goal?");
      terminal.sendInput("\r");
      await eventually(() => client.goalResumes.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.goalResumes).toEqual([
        {
          goalId: "opaque-goal-id",
          expectedRevision: 11,
          reason: "resumed by user in TUI",
        },
      ]);

      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Cancel Goal?");
      terminal.sendInput("\r");
      await eventually(() => client.goalCancellations.length === 1);
      expect(client.goalCancellations).toEqual([
        {
          goalId: "opaque-goal-id",
          expectedRevision: 12,
          reason: "cancelled by user in TUI",
        },
      ]);
      expect(terminal.titles).toEqual(["Wanex"]);
    } finally {
      await fullScreen.stop();
    }
  });

  it("gives Tool approval and canonical Session changes priority over Goal", async () => {
    const client = new FullScreenClientFixture();
    client.addSession("session_second", "Second conversation", "Second history");
    client.goal = goalReadModel({});
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("Goal priority draft");
      terminal.sendInput("\u001b[15~");
      await eventually(() => client.readCounts.goal === 1);
      expect(await terminal.text()).toContain("Goal");

      client.operation = operation({ terminal: false, approval: true, state: "waiting" });
      await fullScreen.refresh();
      expect(await terminal.text()).toContain("Tool approval");
      expect(await terminal.text()).not.toContain("State: active");
      const readsWithApproval = client.readCounts.goal;
      terminal.sendInput("\u001b[15~");
      await terminal.waitForRender();
      expect(client.readCounts.goal).toBe(readsWithApproval);

      terminal.sendInput("\u001b");
      client.operation = undefined;
      await client.selectSession({ sessionId: "session_second" });
      await fullScreen.refresh();
      terminal.sendInput("\u001b[15~");
      await eventually(() => client.readCounts.goal === readsWithApproval + 1);
      expect(await terminal.text()).toContain("Create Goal");
      await client.selectSession({ sessionId: "session_product_tui" });
      await fullScreen.refresh();
      expect(await terminal.text()).not.toContain("Create Goal");
      expect(fullScreen.state().draft).toBe("Goal priority draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("preserves Product no-Session Goal feedback without admitting work", async () => {
    const client = new FullScreenClientFixture();
    await client.startNewConversation();
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("draft without a Session");
      terminal.sendInput("\u001b[15~");
      await eventually(() => client.readCounts.goal === 1);
      await eventually(
        () =>
          fullScreen.state().errorMessage ===
          "select a session before reading its Goal",
      );
      expect(client.goalStarts).toHaveLength(0);
      expect(fullScreen.state().draft).toBe("draft without a Session");
      expect(await terminal.text()).toContain(
        "select a session before reading its Goal",
      );
    } finally {
      await fullScreen.stop();
    }
  });

  it("runs an event-driven multiline Side Query without changing the composer", async () => {
    const osc = "\u001b]0;attacker-side-query-title\u0007";
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(96, 28);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("main composer survives Side Query");
      terminal.sendInput("\u001b[17~");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Side Query");
      expect(await terminal.text()).toContain("Question");

      terminal.sendInput("临时问题");
      terminal.sendInput("\u001b[27;2;13~");
      terminal.sendInput("第二行 👩‍💻");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.sideQueryStarts).toEqual([
        { question: "临时问题\n第二行 👩‍💻" },
      ]);
      expect(fullScreen.state().draft).toBe(
        "main composer survives Side Query",
      );
      expect(await terminal.text()).toContain("State: running");

      const running = client.sideQuery;
      if (running === undefined) throw new Error("Side Query is required");
      client.sideQuery = {
        ...running,
        state: "succeeded",
        answerText: `第一段回答${osc}\n第二段 👩‍💻\u202e`,
        updatedAt: 11,
        finishedAt: 11,
      };
      client.emitSideQueryInvalidation(1, "succeeded");
      await eventually(() => client.readCounts.sideQuery === 1);
      await terminal.waitForRender();
      const answer = await terminal.text();
      expect(answer).toContain("State: succeeded");
      expect(answer).toContain("第一段回答");
      expect(answer).toContain("第二段 👩‍💻");
      expect(answer).not.toContain("attacker-side-query-title");
      expect(answer).not.toContain("opaque-side-query");
      expect(answer).not.toContain("session_product_tui");
      expect(answer).not.toContain("endpoint_product_tui");
      expect(terminal.titles).toEqual(["Wanex"]);

      client.sideQuery = {
        ...client.sideQuery,
        answerText: "Canonical answer after an event gap",
        updatedAt: 12,
      };
      client.emitSideQueryInvalidation(3, "succeeded");
      await eventually(() => client.readCounts.sideQuery === 2);
      expect(await terminal.text()).toContain(
        "Canonical answer after an event gap",
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      expect(client.readCounts.sideQuery).toBe(2);

      terminal.sendInput("\u001b");
      terminal.sendInput("\u001b[17~");
      await eventually(() => client.readCounts.sideQuery === 3);
      expect(await terminal.text()).toContain(
        "Canonical answer after an event gap",
      );
      expect(fullScreen.state().draft).toBe(
        "main composer survives Side Query",
      );
    } finally {
      await fullScreen.stop();
    }
  });

  it("uses exact Side Query cancellation, dismissal, failure, and replacement controls", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001b[17~");
      terminal.sendInput("cancel this temporary question");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryCancellations.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.sideQueryCancellations).toEqual([
        { queryId: "opaque-side-query-1" },
      ]);
      expect(await terminal.text()).toContain("State: cancelled");

      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryDismissals.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.sideQueryDismissals).toEqual([
        { queryId: "opaque-side-query-1" },
      ]);
      expect(await terminal.text()).toContain("Project discussion");
      terminal.sendInput("\u001b[17~");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Question");

      terminal.sendInput("question that fails");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 2);
      const running = client.sideQuery;
      if (running === undefined) throw new Error("Side Query is required");
      client.sideQuery = {
        ...running,
        state: "failed",
        error: {
          code: "runtime_error",
          category: "runtime",
          message: "temporary provider failure",
        },
        updatedAt: 20,
        finishedAt: 20,
      };
      client.emitSideQueryInvalidation(1, "failed");
      await eventually(() => client.readCounts.sideQuery === 1);
      expect(await terminal.text()).toContain("State: failed");
      expect(await terminal.text()).toContain("temporary provider failure");

      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Question");
      terminal.sendInput("replacement question");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 3);
      expect(client.sideQueryStarts.at(-1)).toEqual({
        question: "replacement question",
      });
      expect(client.sideQuery?.queryId).toBe("opaque-side-query-3");
    } finally {
      await fullScreen.stop();
    }
  });

  it("keeps opaque Side Query command failures out of terminal output", async () => {
    const client = new FullScreenClientFixture();
    client.rejectSideQueryStart = true;
    const terminal = new TuiVirtualTerminal(80, 22);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("failure-safe composer draft");
      terminal.sendInput("\u001b[17~");
      terminal.sendInput("question rejected by Product");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);

      expect(fullScreen.state().errorMessage).toBe(
        "Unable to start Side Query",
      );
      expect(fullScreen.state().draft).toBe("failure-safe composer draft");
      const output = await terminal.text();
      expect(output).toContain("Unable to start Side Query");
      expect(output).toContain("question rejected by Product");
      expect(output).not.toContain("opaque-side-query-secret");
    } finally {
      await fullScreen.stop();
    }
  });

  it("lets Tool approval preempt Side Query while preserving its original Session binding", async () => {
    const client = new FullScreenClientFixture();
    client.addSession("session_second", "Second conversation", "Second history");
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("Side Query priority draft");
      terminal.sendInput("\u001b[17~");
      terminal.sendInput("question bound to the first conversation");
      terminal.sendInput("\r");
      await eventually(() => client.sideQueryStarts.length === 1);
      await eventually(() => !fullScreen.state().busy);

      client.operation = operation({
        terminal: false,
        approval: true,
        state: "waiting",
      });
      await fullScreen.refresh();
      expect(await terminal.text()).toContain("Tool approval");
      expect(await terminal.text()).not.toContain("Waiting for the temporary answer");
      expect(client.sideQueryCancellations).toHaveLength(0);

      terminal.sendInput("\u001b");
      client.operation = undefined;
      await client.selectSession({ sessionId: "session_second" });
      await fullScreen.refresh();
      terminal.sendInput("\u001b[17~");
      await eventually(() => client.readCounts.sideQuery === 1);
      const reboundView = await terminal.text();
      expect(reboundView).toContain(
        "Question belongs to the conversation selected when it started.",
      );
      expect(reboundView).not.toContain("session_product_tui");
      expect(reboundView).not.toContain("session_second");
      expect(client.sideQuery?.sessionId).toBe("session_product_tui");

      terminal.sendInput("\r");
      await eventually(() => client.sideQueryCancellations.length === 1);
      expect(client.sideQueryCancellations).toEqual([
        { queryId: "opaque-side-query-1" },
      ]);
      expect(fullScreen.state().draft).toBe("Side Query priority draft");
    } finally {
      await fullScreen.stop();
    }
  });

  it("reviews canonical recovery automatically and submits exact structured success evidence", async () => {
    const client = new FullScreenClientFixture();
    client.operation = recoveryOperation();
    client.setAttachments("session_product_tui", [
      attachmentDraft({
        resourceId: "resource_recovery_attachment",
        label: "recovery-context.png",
      }),
    ]);
    const terminal = new TuiVirtualTerminal(100, 30);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const automatic = await terminal.text();
      expect(automatic).toContain("Recovery required");
      expect(automatic).toContain("Remote deployment");
      expect(automatic).toContain("external | non-idempotent");
      expect(automatic).toContain("Confirm succeeded");
      expect(automatic).toContain("Confirm failed");
      expect(automatic).toContain("Abandon turn");
      expect(automatic).toContain("F7 recovery");
      for (const opaque of [
        "opaque-recovery-product-tui",
        "opaque-reconciliation-product-tui",
        "operation_product_tui",
        "session_product_tui",
      ]) {
        expect(automatic).not.toContain(opaque);
      }

      terminal.sendInput("\u001b");
      terminal.sendInput("composer survives exact recovery");
      terminal.sendInput("\u001b[18~");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("1/2 Reason");

      terminal.sendInput("\u0015");
      terminal.sendInput("verified against the remote service");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("{");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("valid JSON is required");
      expect(client.recoveryResolutions).toHaveLength(0);

      terminal.sendInput("\u0015");
      terminal.sendInput('{"remoteId":"deployment-1","ok":true}');
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Confirm succeeded?");
      terminal.sendInput("\r");
      await eventually(() => client.recoveryResolutions.length === 1);
      await eventually(() => !fullScreen.state().busy);

      expect(client.recoveryResolutions).toEqual([
        {
          sessionId: "session_product_tui",
          recoveryId: "opaque-recovery-product-tui",
          expectedRecoveryRevision: 7,
          decision: "confirm_succeeded",
          reason: "verified against the remote service",
          content: [
            {
              type: "json",
              value: { remoteId: "deployment-1", ok: true },
            },
          ],
        },
      ]);
      expect(fullScreen.state()).toMatchObject({
        draft: "composer survives exact recovery",
        statusMessage: "Confirm succeeded accepted",
        operation: { state: "queued" },
      });
      expect(fullScreen.state().attachments?.attachments).toHaveLength(1);
      expect(terminal.titles).toEqual(["Wanex"]);
      const settled = await terminal.text();
      expect(settled).not.toContain("opaque-recovery-product-tui");
      expect(settled).not.toContain("opaque-reconciliation-product-tui");
    } finally {
      await fullScreen.stop();
    }
  });

  it("maps failure evidence exactly and keeps a rejected recovery form retryable", async () => {
    const client = new FullScreenClientFixture();
    client.operation = recoveryOperation();
    client.rejectRecoveryResolution = true;
    const terminal = new TuiVirtualTerminal(100, 30);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput("remote service reports a terminal failure");
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput('{"status":"failed"}');
      terminal.sendInput("\r");
      terminal.sendInput("\u0015");
      terminal.sendInput('{"code":"REMOTE_FAILURE"}');
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      await eventually(() => client.recoveryResolutions.length === 1);
      await eventually(() => !fullScreen.state().busy);

      expect(client.recoveryResolutions[0]).toEqual({
        sessionId: "session_product_tui",
        recoveryId: "opaque-recovery-product-tui",
        expectedRecoveryRevision: 7,
        decision: "confirm_failed",
        reason: "remote service reports a terminal failure",
        content: [{ type: "json", value: { status: "failed" } }],
        error: { code: "REMOTE_FAILURE" },
      });
      expect(fullScreen.state().errorMessage).toBe(
        "Recovery decision was rejected",
      );
      const retryable = await terminal.text();
      expect(retryable).toContain("Observed error JSON");
      expect(retryable).toContain("REMOTE_FAILURE");
      expect(retryable).not.toContain("opaque-recovery-secret");

      client.rejectRecoveryResolution = false;
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      await eventually(() => client.recoveryResolutions.length === 2);
      await eventually(() => !fullScreen.state().busy);
      expect(client.recoveryResolutions[1]).toEqual(
        client.recoveryResolutions[0],
      );
      expect(fullScreen.state().operation?.state).toBe("queued");
    } finally {
      await fullScreen.stop();
    }
  });

  it("fails closed when canonical recovery revision changes before confirmation", async () => {
    const client = new FullScreenClientFixture();
    client.operation = recoveryOperation();
    const terminal = new TuiVirtualTerminal(96, 28);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      terminal.sendInput("\r");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Confirm succeeded?");

      client.operation = recoveryOperationWithRevision(8);
      terminal.sendInput("\r");
      await eventually(() => client.recoveryResolutions.length === 1);
      await eventually(() => !fullScreen.state().busy);

      expect(client.recoveryResolutions[0]).toMatchObject({
        recoveryId: "opaque-recovery-product-tui",
        expectedRecoveryRevision: 7,
      });
      expect(fullScreen.state().errorMessage).toBe(
        "Recovery decision was rejected",
      );
      const refreshed = await terminal.text();
      expect(refreshed).toContain("Recovery required");
      expect(refreshed).not.toContain("Confirm succeeded?");
      expect(refreshed).not.toContain("opaque-recovery-secret");
    } finally {
      await fullScreen.stop();
    }
  });

  it("lets Tool approval preempt recovery and closes stale recovery state on Session change", async () => {
    const client = new FullScreenClientFixture();
    client.addSession("session_second", "Second conversation", "Second history");
    client.operation = recoveryOperation();
    const terminal = new TuiVirtualTerminal(92, 26);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("\r");
      terminal.sendInput("recovery draft remains untouched");
      await terminal.waitForRender();

      client.operation = recoveryOperation({ approval: true, updatedAt: 3 });
      await fullScreen.refresh();
      const approval = await terminal.text();
      expect(approval).toContain("Tool approval");
      expect(approval).not.toContain("Confirm succeeded: Remote deployment");
      expect(client.recoveryResolutions).toHaveLength(0);

      client.operation = undefined;
      await client.selectSession({ sessionId: "session_second" });
      await fullScreen.refresh();
      const changed = await terminal.text();
      expect(changed).toContain("Second conversation");
      expect(changed).toContain("Second history");
      expect(changed).not.toContain("Tool approval");
      expect(changed).not.toContain("Recovery required");
      expect(client.recoveryResolutions).toHaveLength(0);
    } finally {
      await fullScreen.stop();
    }
  });

  it("switches model explicitly before confirmed regeneration and retries Product rejection", async () => {
    const client = new FullScreenClientFixture();
    const failed = operation({ terminal: true, state: "failed" });
    client.operation = {
      ...failed,
      error: {
        code: "conversation_context_capacity_exceeded",
        category: "capacity",
        message: "context exceeds the selected model",
        modelEndpointId: "endpoint_product_tui",
        capacity: {
          reasons: ["input_tokens_exceeded"],
          inputTokens: 16_000,
          inputTokenCeiling: 8_000,
          inputResources: 0,
          requestedOutputTokens: 1_000,
          compactionAttempted: true,
        },
      },
    };
    const terminal = new TuiVirtualTerminal(100, 28);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      terminal.sendInput("regeneration keeps my composer");
      expect(await terminal.text()).toContain("F7 regenerate");
      terminal.sendInput("\u001b[18~");
      await terminal.waitForRender();
      expect(await terminal.text()).toContain(
        "Use F2 before regeneration to select a different model",
      );
      expect(client.regenerations).toHaveLength(0);
      terminal.sendInput("\u001b");
      await terminal.waitForRender();
      expect(await terminal.text()).not.toContain("Regenerate response?");

      terminal.sendInput("\u001bOQ");
      await eventually(() => client.readCounts.models === 1);
      await terminal.waitForRender();
      expect(await terminal.text()).toContain("Models");
      terminal.sendInput("\u001b[B");
      terminal.sendInput("\r");
      await eventually(() => client.modelSelections.length === 1);
      await eventually(() => !fullScreen.state().busy);
      expect(client.modelSelections).toEqual([{ endpointId: "endpoint_openai" }]);

      client.rejectRegeneration = true;
      terminal.sendInput("\u001b[18~");
      terminal.sendInput("\r");
      await eventually(() => client.regenerations.length === 1);
      await eventually(() => !fullScreen.state().busy);
      const retry = await terminal.text();
      expect(retry).toContain("previous regeneration request was rejected");
      expect(retry).not.toContain("opaque-operation-secret");

      client.rejectRegeneration = false;
      terminal.sendInput("\r");
      await eventually(() => client.regenerations.length === 2);
      await eventually(() => !fullScreen.state().busy);
      expect(client.regenerations).toEqual([
        { sessionId: "session_product_tui" },
        { sessionId: "session_product_tui" },
      ]);
      expect(fullScreen.state()).toMatchObject({
        draft: "regeneration keeps my composer",
        statusMessage: "Conversation regeneration started",
        operation: { state: "queued" },
      });
      expect(fullScreen.state().operation?.operationId).toBe("fresh_operation_1");
      expect(await terminal.text()).not.toContain("fresh_operation_1");
    } finally {
      await fullScreen.stop();
    }
  });

  it("does not expose an F7 action for active non-recoverable work", async () => {
    const client = new FullScreenClientFixture();
    client.operation = operation({ terminal: false });
    const terminal = new TuiVirtualTerminal(88, 24);
    const fullScreen = createTuiFullScreen({ client, terminal });

    try {
      await fullScreen.start();
      const initial = await terminal.text();
      expect(initial).not.toContain("F7 recovery");
      expect(initial).not.toContain("F7 regenerate");
      terminal.sendInput("\u001b[18~");
      await terminal.waitForRender();
      expect(client.regenerations).toHaveLength(0);
      expect(client.recoveryResolutions).toHaveLength(0);
      expect(await terminal.text()).not.toContain("Regenerate response?");
    } finally {
      await fullScreen.stop();
    }
  });

  it("restores the terminal promptly on quit and unsubscribes before work drains", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    await fullScreen.start();
    terminal.sendInput("\u0010");
    await eventually(() => client.readCounts.commands === 1);
    await eventually(() => !fullScreen.state().busy);
    await terminal.waitForRender();
    expect(await terminal.text()).toContain("Product commands");
    terminal.sendInput("\u0011");
    await eventually(() => terminal.lifecycle().stopCount === 1);
    await expect(fullScreen.waitUntilStopped()).resolves.toBe("quit");

    expect(fullScreen.state().stopped).toBe(true);
    expect(client.unsubscribeCount).toBe(1);
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1,
    });
    client.emitAssistantDelta(1, "must not render after stop");
    expect(fullScreen.state().lastEventSequence).toBeUndefined();
  });

  it("returns Provider management intent only after restoring the terminal", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(200, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });

    await fullScreen.start();
    expect(await terminal.text()).toContain("F8 providers");
    terminal.sendInput("\u001b[19~");

    await expect(fullScreen.waitUntilStopped()).resolves
      .toBe("provider-management");
    expect(client.unsubscribeCount).toBe(1);
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1,
    });
  });

  it("does not let an in-flight canonical read block terminal shutdown", async () => {
    const client = new FullScreenClientFixture();
    const terminal = new TuiVirtualTerminal(72, 18);
    const fullScreen = createTuiFullScreen({ client, terminal });
    let releaseHomeRead: (() => void) | undefined;

    try {
      await fullScreen.start();
      const initialReads = client.readCounts.home;
      releaseHomeRead = client.pauseHomeRead();
      client.emitInvalidation(1);
      await eventually(() => client.readCounts.home > initialReads);

      terminal.sendInput("\u0011");
      await expect(fullScreen.waitUntilStopped()).resolves.toBe("quit");
      expect(terminal.lifecycle()).toEqual({
        active: false,
        drainCount: 1,
        stopCount: 1,
      });
    } finally {
      releaseHomeRead?.();
      await fullScreen.stop();
    }
  });
});

class FullScreenClientFixture implements TuiFullScreenClient {
  home = homeReadModel();
  transcript = transcript([
    historyRow("user", "Existing request", "row_existing"),
  ]);
  operation: ConversationOperationReadModel | undefined;
  rejectSubmission = false;
  submissionRejectionMessage = "provider is unavailable";
  rejectSessionSelection = false;
  rejectModelSelection = false;
  rejectCommandPreview = false;
  rejectCommandExecution = false;
  rejectSideQueryStart = false;
  sideQueryStartRejectionMessage =
    "side query does not exist: opaque-side-query-secret";
  planGeneration: PlanGenerationReadModel | undefined;
  planProposal: PlanProposalReadModel | undefined;
  goal: GoalReadModel | undefined;
  sideQuery: SideQueryReadModel | undefined;
  team = teamConversationPage();
  teamConversations: TeamConversationSummary[] = [this.team.conversation];
  rejectTeamCommand = false;
  rejectTeamCoordinator = false;
  commandCatalog: CommandCatalogReadModel = {
    commands: [
      productCommand({ id: "product.status", title: "Status" }),
      productCommand({
        id: "plugin.example",
        title: "Plugin Action",
        sourceKind: "plugin",
        sourceScope: "user",
        sourceId: "secretRef:do-not-render",
        trust: "user_enabled",
      }),
    ],
    diagnostics: [],
  };
  readonly submissions: unknown[] = [];
  readonly sessionSelections: unknown[] = [];
  readonly modelSelections: unknown[] = [];
  readonly queued: unknown[] = [];
  readonly guided: unknown[] = [];
  readonly cancellations: unknown[] = [];
  readonly approvals: unknown[] = [];
  readonly commandPreviews: unknown[] = [];
  readonly commandExecutions: unknown[] = [];
  readonly commandCallOrder: string[] = [];
  readonly attachmentRemovals: unknown[] = [];
  readonly planStarts: unknown[] = [];
  readonly planGenerationReads: unknown[] = [];
  readonly planCancellations: unknown[] = [];
  readonly planDismissals: unknown[] = [];
  readonly planProposalReads: unknown[] = [];
  readonly planRevisions: unknown[] = [];
  readonly planDecisions: unknown[] = [];
  readonly planExecutions: unknown[] = [];
  readonly goalReads: unknown[] = [];
  readonly goalStarts: unknown[] = [];
  readonly goalPauses: unknown[] = [];
  readonly goalResumes: unknown[] = [];
  readonly goalCancellations: unknown[] = [];
  readonly sideQueryStarts: StartSideQueryRequest[] = [];
  readonly sideQueryReads: unknown[] = [];
  readonly sideQueryCancellations: unknown[] = [];
  readonly sideQueryDismissals: unknown[] = [];
  readonly teamReads: unknown[] = [];
  readonly teamSelections: unknown[] = [];
  readonly teamCreates: unknown[] = [];
  readonly teamParticipantAdds: unknown[] = [];
  readonly teamParticipantUpdates: unknown[] = [];
  readonly teamCoordinatorUpdates: unknown[] = [];
  readonly teamCloses: unknown[] = [];
  readonly teamRoundSubmissions: unknown[] = [];
  readonly regenerations: RegenerateTrackedConversationOperationRequest[] = [];
  readonly recoveryResolutions: ResolveTrackedConversationRecoveryRequest[] = [];
  rejectRegeneration = false;
  rejectRecoveryResolution = false;
  readonly readCounts = {
    home: 0,
    transcript: 0,
    operation: 0,
    models: 0,
    commands: 0,
    attachments: 0,
    planGeneration: 0,
    planProposal: 0,
    goal: 0,
    sideQuery: 0,
    team: 0,
  };
  newConversationCount = 0;
  unsubscribeCount = 0;
  private readonly listeners = new Set<SurfaceEventListener>();
  private homeReadGate: Promise<void> | undefined;
  private planGenerationCounter = 0;
  private sideQueryCounter = 0;
  private regenerationCounter = 0;
  private readonly transcripts = new Map<
    string,
    ConversationHistoryReadModel
  >();
  private readonly attachmentDrafts = new Map<
    string,
    ConversationAttachmentsReadModel
  >();
  readonly modelEndpoints: ModelEndpointReadModel[] = [
    modelEndpoint("endpoint_product_tui", "deepseek", "deepseek-chat", true),
    modelEndpoint("endpoint_openai", "openai", "gpt-5.4", false),
  ];

  async readHome() {
    this.readCounts.home += 1;
    await this.homeReadGate;
    return envelope("readHome", this.home);
  }

  async readTeamConversation(input?: {
    readonly conversationId?: string;
    readonly cursor?: string;
    readonly limit?: number;
  }) {
    this.readCounts.team += 1;
    this.teamReads.push(input);
    const conversationId =
      input?.conversationId ?? selectedTeamConversationId(this.home.state);
    if (conversationId === undefined) {
      return envelope("readTeamConversation", {
        kind: "product.team-conversation.no-selection" as const,
      });
    }
    if (conversationId !== this.team.conversation.conversationId) {
      return envelope("readTeamConversation", {
        kind: "product.team-conversation.missing" as const,
        conversationId,
      });
    }
    return envelope("readTeamConversation", {
      kind: "product.team-conversation.found" as const,
      page: this.team,
    });
  }

  async listTeamConversations() {
    this.readCounts.team += 1;
    if (this.rejectTeamCommand) {
      return failureEnvelope("listTeamConversations", "Team listing rejected");
    }
    return envelope("listTeamConversations", {
      kind: "product.team-conversation-list" as const,
      availability: {
        kind: "product.team-availability" as const,
        state: "ready" as const,
        reason: "configured" as const,
        capabilities: {
          canList: true,
          canCreateDiscussion: true,
          canCreateCoordinated: true,
          canManageParticipants: true,
          canAssignCoordinator: true,
          canSubmitRound: true,
        },
      },
      conversations: this.teamConversations,
    });
  }

  async selectTeamConversation(input: { readonly conversationId: string }) {
    this.teamSelections.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("selectTeamConversation", "Team selection rejected");
    }
    const conversation = this.teamConversations.find(
      (candidate) => candidate.conversationId === input.conversationId,
    );
    if (conversation === undefined) {
      return failureEnvelope("selectTeamConversation", "Team conversation is missing");
    }
    this.home = {
      ...this.home,
      state: {
        ...this.home.state,
        selection: { kind: "team", conversationId: input.conversationId },
      },
    };
    return envelope("selectTeamConversation", conversation);
  }

  async createTeamConversation(input: {
    readonly title?: string;
    readonly mode: "discussion" | "coordinated";
    readonly idempotencyKey: string;
  }) {
    this.teamCreates.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("createTeamConversation", "Team creation rejected");
    }
    const conversation: TeamConversationSummary = {
      conversationId: `team_created_${this.teamConversations.length}`,
      title: input.title ?? "Untitled group",
      mode: input.mode,
      state: "open",
      participantCount: 0,
      activeAgentCount: 0,
      activeRound: false,
      createdAt: 3,
      updatedAt: 3,
    };
    this.teamConversations.push(conversation);
    this.team = {
      kind: "product.team-conversation-page",
      conversation,
      participants: [],
      messages: [],
      rounds: [],
      deliveries: [],
      observedAt: 3,
    };
    this.setTeamSelection(conversation.conversationId);
    return envelope("createTeamConversation", conversation);
  }

  async closeTeamConversation(input: { readonly conversationId: string }) {
    this.teamCloses.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("closeTeamConversation", "Team close rejected");
    }
    this.team = {
      ...this.team,
      conversation: { ...this.team.conversation, state: "closed" },
    };
    this.teamConversations = this.teamConversations.map((conversation) =>
      conversation.conversationId === input.conversationId
        ? { ...conversation, state: "closed" }
        : conversation,
    );
    const { selection: _selection, ...state } = this.home.state;
    this.home = { ...this.home, state };
    return envelope("closeTeamConversation", this.team.conversation);
  }

  async addTeamParticipant(input: {
    readonly conversationId: string;
    readonly agentSessionId: string;
    readonly idempotencyKey: string;
    readonly displayName?: string;
    readonly role?: string;
  }) {
    this.teamParticipantAdds.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("addTeamParticipant", "Participant add rejected");
    }
    const participant: TeamParticipantReadModel = {
      participantId: `participant_added_${this.team.participants.length}`,
      kind: "agent",
      state: "active",
      displayName: input.displayName ?? `Agent ${this.team.participants.length + 1}`,
      ...(input.role === undefined ? {} : { role: input.role }),
      createdAt: 3,
      updatedAt: 3,
    };
    this.team = {
      ...this.team,
      conversation: {
        ...this.team.conversation,
        participantCount: this.team.conversation.participantCount + 1,
        activeAgentCount: this.team.conversation.activeAgentCount + 1,
      },
      participants: [...this.team.participants, participant],
    };
    return envelope("addTeamParticipant", participant);
  }

  async updateTeamParticipant(input: {
    readonly conversationId: string;
    readonly participantId: string;
    readonly state: "active" | "muted" | "left";
  }) {
    this.teamParticipantUpdates.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("updateTeamParticipant", "Participant update rejected");
    }
    const current = this.team.participants.find(
      (participant) => participant.participantId === input.participantId,
    );
    if (current === undefined) return failureEnvelope("updateTeamParticipant", "Participant is missing");
    const activeAgentDelta = current.kind === "agent"
      ? (input.state === "active" ? 1 : 0) - (current.state === "active" ? 1 : 0)
      : 0;
    const participant = { ...current, state: input.state };
    this.team = {
      ...this.team,
      participants: this.team.participants.map((candidate) =>
        candidate.participantId === input.participantId ? participant : candidate,
      ),
      conversation: {
        ...this.team.conversation,
        activeAgentCount: this.team.conversation.activeAgentCount + activeAgentDelta,
      },
    };
    return envelope("updateTeamParticipant", participant);
  }

  async setTeamCoordinator(input: {
    readonly conversationId: string;
    readonly expectedCoordinatorParticipantId: string | null;
    readonly coordinatorParticipantId: string | null;
  }) {
    this.teamCoordinatorUpdates.push(input);
    if (this.rejectTeamCoordinator) {
      return failureEnvelope("setTeamCoordinator", "Coordinator changed; refresh and retry");
    }
    const current = this.team.conversation.coordinatorParticipantId ?? null;
    if (current !== input.expectedCoordinatorParticipantId) {
      return failureEnvelope("setTeamCoordinator", "Coordinator changed; refresh and retry");
    }
    const nextConversation = input.coordinatorParticipantId === null
      ? (() => {
          const { coordinatorParticipantId: _coordinator, ...rest } = this.team.conversation;
          return rest;
        })()
      : {
          ...this.team.conversation,
          coordinatorParticipantId: input.coordinatorParticipantId,
        };
    this.team = { ...this.team, conversation: nextConversation };
    return envelope("setTeamCoordinator", this.team.conversation);
  }

  async submitTeamRound(input: {
    readonly conversationId: string;
    readonly text: string;
    readonly idempotencyKey: string;
  }) {
    this.teamRoundSubmissions.push(input);
    if (this.rejectTeamCommand) {
      return failureEnvelope("submitTeamRound", "Team round rejected");
    }
    const message = {
      messageId: `team_message_${this.team.messages.length + 1}`,
      authorParticipantId: "participant_user",
      kind: "message" as const,
      status: "sent" as const,
      content: [{ type: "text" as const, partId: `team_part_${this.team.messages.length + 1}`, text: input.text }],
      revision: 1,
      createdAt: 4,
      updatedAt: 4,
    };
    const round = {
      roundId: `round_${this.team.rounds.length + 1}`,
      sourceMessageId: message.messageId,
      status: "running" as const,
      expected: this.team.conversation.activeAgentCount,
      replied: 0,
      passed: 0,
      failed: 0,
      cancelled: 0,
      createdAt: 4,
      updatedAt: 4,
    };
    this.team = {
      ...this.team,
      conversation: { ...this.team.conversation, activeRound: true },
      messages: [...this.team.messages, message],
      rounds: [...this.team.rounds, round],
      observedAt: 4,
    };
    return envelope("submitTeamRound", {
      kind: "product.team-round.submitted" as const,
      conversation: this.team.conversation,
      message,
      round,
      deliveries: [],
    });
  }

  pauseHomeRead(): () => void {
    let release!: () => void;
    this.homeReadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.homeReadGate = undefined;
      release();
    };
  }

  setTeamSelection(
    conversationId = this.team.conversation.conversationId,
  ): void {
    this.home = {
      ...this.home,
      state: {
        ...this.home.state,
        selection: { kind: "team", conversationId },
      },
    };
  }

  async readSessionTranscript(input?: { readonly sessionId?: string }) {
    this.readCounts.transcript += 1;
    const sessionId = input?.sessionId ?? selectedSessionId(this.home.state);
    const selectedTranscript =
      sessionId === "session_product_tui"
        ? this.transcript
        : sessionId === undefined
          ? undefined
          : this.transcripts.get(sessionId);
    if (selectedTranscript === undefined) {
      return envelope("readSessionTranscript", {
        kind: "product.session-transcript.no-session" as const,
        message: "select a session before reading its transcript",
      });
    }
    return envelope("readSessionTranscript", {
      kind: "product.session-transcript.found" as const,
      sessionId: selectedTranscript.sessionId,
      transcript: selectedTranscript,
    });
  }

  async selectSession(input: { readonly sessionId: string }) {
    this.sessionSelections.push(input);
    if (this.rejectSessionSelection) {
      return failureEnvelope("selectSession", "session selection rejected");
    }
    this.home = {
      ...this.home,
      state: {
        ...this.home.state,
        selection: { kind: "session", sessionId: input.sessionId },
      },
    };
    return envelope("selectSession", this.home.state);
  }

  async startNewConversation() {
    this.newConversationCount += 1;
    this.operation = undefined;
    const { selection: _selection, ...state } = this.home.state;
    this.home = {
      ...this.home,
      state,
    };
    return envelope("startNewConversation", this.home.state);
  }

  async listModelEndpoints() {
    this.readCounts.models += 1;
    const activeEndpointId = this.home.providerReadiness.activeEndpointId;
    return envelope("listModelEndpoints", {
      ...(activeEndpointId === undefined ? {} : { activeEndpointId }),
      endpoints: this.modelEndpoints,
    });
  }

  async setActiveModelEndpoint(input: { readonly endpointId: string }) {
    this.modelSelections.push(input);
    if (this.rejectModelSelection) {
      return failureEnvelope(
        "setActiveModelEndpoint",
        "model selection rejected",
      );
    }
    const selected = this.modelEndpoints.find(
      (endpoint) => endpoint.id === input.endpointId,
    );
    if (selected === undefined) throw new Error("model endpoint is required");
    this.modelEndpoints.splice(
      0,
      this.modelEndpoints.length,
      ...this.modelEndpoints.map((endpoint) => ({
        ...endpoint,
        active: endpoint.id === selected.id,
      })),
    );
    const activeEndpoint = this.modelEndpoints.find(
      (endpoint) => endpoint.id === selected.id,
    );
    if (activeEndpoint === undefined)
      throw new Error("active endpoint is required");
    this.home = {
      ...this.home,
      providerReadiness: {
        ...this.home.providerReadiness,
        activeEndpointId: activeEndpoint.id,
        activeEndpoint,
      },
    };
    return envelope("setActiveModelEndpoint", activeEndpoint);
  }

  async readProductCommands() {
    this.readCounts.commands += 1;
    return envelope("readProductCommands", this.commandCatalog);
  }

  async readConversationAttachments(input?: { readonly sessionId?: string }) {
    this.readCounts.attachments += 1;
    const sessionId = input?.sessionId ?? selectedSessionId(this.home.state);
    return envelope(
      "readConversationAttachments",
      this.attachmentDrafts.get(attachmentKey(sessionId)) ??
        conversationAttachments(sessionId, []),
    );
  }

  async removeConversationAttachment(input: {
    readonly resourceId: string;
    readonly sessionId?: string;
  }) {
    this.attachmentRemovals.push(input);
    const sessionId = input.sessionId ?? selectedSessionId(this.home.state);
    const current =
      this.attachmentDrafts.get(attachmentKey(sessionId)) ??
      conversationAttachments(sessionId, []);
    const attachments = current.attachments.filter(
      (attachment) => attachment.resourceId !== input.resourceId,
    );
    const next = conversationAttachments(sessionId, attachments);
    this.attachmentDrafts.set(attachmentKey(sessionId), next);
    return envelope("removeConversationAttachment", {
      kind: "product.conversation-attachment.removed" as const,
      removed: attachments.length !== current.attachments.length,
      resourceId: input.resourceId,
      attachments: next,
    });
  }

  setAttachments(
    sessionId: string | undefined,
    attachments: readonly AttachmentDraft[],
  ): void {
    this.attachmentDrafts.set(
      attachmentKey(sessionId),
      conversationAttachments(sessionId, attachments),
    );
  }

  async previewProductCommandInvocation(input: {
    readonly commandId: string;
    readonly input?: unknown;
  }) {
    this.commandPreviews.push(input);
    this.commandCallOrder.push(`preview:${input.commandId}`);
    const command = this.commandCatalog.commands.find(
      (item) => item.id === input.commandId,
    );
    if (command === undefined) throw new Error("command is required");
    if (this.rejectCommandPreview) {
      return envelope("previewProductCommandInvocation", {
        kind: "rejected" as const,
        commandId: input.commandId,
        reason: "invalid_input" as const,
        message: "preview blocked by Product",
        command,
      });
    }
    return envelope("previewProductCommandInvocation", {
      kind: "runnable" as const,
      commandId: input.commandId,
      handlerRef: command.handlerRef,
      command,
      inputAccepted: true as const,
    });
  }

  async executeProductCommand(input: {
    readonly commandId: string;
    readonly input?: unknown;
  }) {
    this.commandExecutions.push(input);
    this.commandCallOrder.push(`execute:${input.commandId}`);
    const command = this.commandCatalog.commands.find(
      (item) => item.id === input.commandId,
    );
    if (command === undefined) throw new Error("command is required");
    if (this.rejectCommandExecution) {
      return envelope("executeProductCommand", {
        kind: "rejected" as const,
        commandId: input.commandId,
        reason: "execution_failed" as const,
        message: "execution rejected by Product",
        handlerRef: command.handlerRef,
      });
    }
    return envelope("executeProductCommand", {
      kind: "completed" as const,
      commandId: input.commandId,
      handlerRef: command.handlerRef,
      summary: {
        valueKind: "object",
        message: "Command completed" as const,
        references: [],
      },
    });
  }

  async startSideQuery(input: StartSideQueryRequest) {
    this.sideQueryStarts.push(input);
    if (this.rejectSideQueryStart) {
      return failureEnvelope(
        "startSideQuery",
        this.sideQueryStartRejectionMessage,
      );
    }
    if (this.sideQuery?.state === "running") {
      return failureEnvelope(
        "startSideQuery",
        "a side query is already running",
      );
    }
    const queryId = `opaque-side-query-${++this.sideQueryCounter}`;
    this.sideQuery = {
      kind: "product.side-query",
      queryId,
      sessionId: selectedSessionId(this.home.state) ?? "session_product_tui",
      modelEndpointId:
        this.home.providerReadiness.activeEndpointId ?? "endpoint_product_tui",
      state: "running",
      question: input.question,
      ...(input.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: input.maxOutputTokens }),
      startedAt: 10,
      updatedAt: 10,
    };
    return envelope("startSideQuery", this.sideQuery);
  }

  async readSideQuery(input: { readonly queryId: string }) {
    this.readCounts.sideQuery += 1;
    this.sideQueryReads.push(input);
    const value: ReadSideQueryResult =
      this.sideQuery?.queryId === input.queryId
        ? {
            kind: "product.side-query.found",
            query: this.sideQuery,
          }
        : {
            kind: "product.side-query.missing",
            queryId: input.queryId,
          };
    return envelope("readSideQuery", value);
  }

  async cancelSideQuery(input: { readonly queryId: string }) {
    this.sideQueryCancellations.push(input);
    if (
      this.sideQuery?.queryId !== input.queryId ||
      this.sideQuery.state !== "running"
    ) {
      return failureEnvelope("cancelSideQuery", "Side Query is not running");
    }
    this.sideQuery = {
      ...this.sideQuery,
      state: "cancelled",
      updatedAt: 11,
      finishedAt: 11,
    };
    return envelope("cancelSideQuery", this.sideQuery);
  }

  async dismissSideQuery(input: { readonly queryId: string }) {
    this.sideQueryDismissals.push(input);
    if (
      this.sideQuery?.queryId !== input.queryId ||
      this.sideQuery.state === "running"
    ) {
      return failureEnvelope("dismissSideQuery", "Side Query is not dismissible");
    }
    this.sideQuery = undefined;
    return envelope("dismissSideQuery", {
      kind: "product.side-query.dismissed" as const,
      queryId: input.queryId,
    });
  }

  async startPlanGeneration(input: {
    readonly text: string;
    readonly sessionId?: string;
  }) {
    this.planStarts.push(input);
    const operationId = `opaque-plan-operation-${++this.planGenerationCounter}`;
    this.planGeneration = {
      kind: "product.plan-generation",
      operationId,
      sessionId: input.sessionId ?? "session_product_tui",
      state: "running",
      startedAt: 10,
      updatedAt: 10,
    };
    return envelope("startPlanGeneration", this.planGeneration);
  }

  async readPlanGeneration(input: { readonly operationId: string }) {
    this.readCounts.planGeneration += 1;
    this.planGenerationReads.push(input);
    if (this.planGeneration?.operationId !== input.operationId) {
      return envelope("readPlanGeneration", {
        kind: "product.plan-generation.missing" as const,
        operationId: input.operationId,
      });
    }
    return envelope("readPlanGeneration", {
      kind: "product.plan-generation.found" as const,
      generation: this.planGeneration,
    });
  }

  async cancelPlanGeneration(input: { readonly operationId: string }) {
    this.planCancellations.push(input);
    if (this.planGeneration?.operationId !== input.operationId) {
      return failureEnvelope("cancelPlanGeneration", "Plan generation is missing");
    }
    this.planGeneration = {
      ...this.planGeneration,
      state: "cancelled",
      updatedAt: 11,
      finishedAt: 11,
    };
    return envelope("cancelPlanGeneration", this.planGeneration);
  }

  async dismissPlanGeneration(input: { readonly operationId: string }) {
    this.planDismissals.push(input);
    if (this.planGeneration?.operationId !== input.operationId) {
      return failureEnvelope("dismissPlanGeneration", "Plan generation is missing");
    }
    this.planGeneration = undefined;
    return envelope("dismissPlanGeneration", {
      kind: "product.plan-generation.dismissed" as const,
      operationId: input.operationId,
    });
  }

  async readPlanProposal(input?: { readonly proposalId?: string }) {
    this.readCounts.planProposal += 1;
    this.planProposalReads.push(input);
    if (this.planProposal === undefined) {
      return input?.proposalId === undefined
        ? envelope("readPlanProposal", {
            kind: "product.plan-proposal.no-selection" as const,
          })
        : envelope("readPlanProposal", {
            kind: "product.plan-proposal.missing" as const,
            proposalId: input.proposalId,
          });
    }
    if (
      input?.proposalId !== undefined &&
      input.proposalId !== this.planProposal.proposalId
    ) {
      return envelope("readPlanProposal", {
        kind: "product.plan-proposal.missing" as const,
        proposalId: input.proposalId,
      });
    }
    return envelope("readPlanProposal", {
      kind: "product.plan-proposal.found" as const,
      proposal: this.planProposal,
    });
  }

  async revisePlanProposal(input: {
    readonly proposalId?: string;
    readonly expectedRevision: number;
    readonly title: string;
    readonly summary: string;
    readonly steps: PlanProposalReadModel["steps"];
    readonly references?: PlanProposalReadModel["references"];
  }) {
    this.planRevisions.push(input);
    if (
      this.planProposal === undefined ||
      input.proposalId !== this.planProposal.proposalId ||
      input.expectedRevision !== this.planProposal.revision
    ) {
      return failureEnvelope("revisePlanProposal", "Plan revision conflict");
    }
    this.planProposal = {
      ...this.planProposal,
      revision: this.planProposal.revision + 1,
      title: input.title,
      summary: input.summary,
      steps: input.steps,
      references: input.references ?? this.planProposal.references,
      updatedAt: 12,
    };
    return envelope("revisePlanProposal", {
      kind: "product.plan-proposal.found" as const,
      proposal: this.planProposal,
    });
  }

  async decidePlanProposal(input: {
    readonly proposalId?: string;
    readonly expectedRevision: number;
    readonly decision: "approve" | "reject" | "withdraw";
  }) {
    this.planDecisions.push(input);
    if (
      this.planProposal === undefined ||
      input.proposalId !== this.planProposal.proposalId ||
      input.expectedRevision !== this.planProposal.revision
    ) {
      return failureEnvelope("decidePlanProposal", "Plan revision conflict");
    }
    this.planProposal = {
      ...this.planProposal,
      revision: this.planProposal.revision + 1,
      state:
        input.decision === "approve"
          ? "approved"
          : input.decision === "reject"
            ? "rejected"
            : "withdrawn",
      updatedAt: 12,
      decidedAt: 12,
    };
    return envelope("decidePlanProposal", {
      kind: "product.plan-proposal.found" as const,
      proposal: this.planProposal,
    });
  }

  async executePlanProposal(input: {
    readonly proposalId?: string;
    readonly expectedRevision: number;
  }) {
    this.planExecutions.push(input);
    if (
      this.planProposal === undefined ||
      this.planProposal.state !== "approved" ||
      input.proposalId !== this.planProposal.proposalId ||
      input.expectedRevision !== this.planProposal.revision
    ) {
      return failureEnvelope("executePlanProposal", "Plan is not executable");
    }
    this.operation = operation({ terminal: false });
    this.planProposal = {
      ...this.planProposal,
      execution: {
        inputId: "opaque-plan-input",
        turnId: "opaque-plan-turn",
        jobId: "opaque-plan-job",
        inputState: "consumed",
        turnState: "running",
        jobState: "running",
        boundAt: 13,
      },
      updatedAt: 13,
    };
    return envelope("executePlanProposal", {
      kind: "product.plan-execution.submitted" as const,
      proposal: this.planProposal,
      operation: {
        kind: "product.conversation-operation.found" as const,
        operation: this.operation,
      },
    });
  }

  completePlanGeneration(proposal = planProposal()): void {
    if (this.planGeneration === undefined) {
      throw new Error("Plan generation is required");
    }
    this.planProposal = proposal;
    this.planGeneration = {
      ...this.planGeneration,
      state: "succeeded",
      proposalId: proposal.proposalId,
      updatedAt: 11,
      finishedAt: 11,
    };
  }

  async readGoal(input?: ReadGoalRequest) {
    this.readCounts.goal += 1;
    this.goalReads.push(input);
    const sessionId = input?.sessionId ?? selectedSessionId(this.home.state);
    if (input?.goalId === undefined && sessionId === undefined) {
      return envelope("readGoal", {
        kind: "product.goal.no-session" as const,
        message: "select a session before reading its Goal" as const,
      });
    }
    if (
      this.goal === undefined ||
      (input?.goalId !== undefined && input.goalId !== this.goal.goalId) ||
      (input?.goalId === undefined && sessionId !== this.goal.sessionId)
    ) {
      return envelope("readGoal", {
        kind: "product.goal.missing" as const,
        ...(input?.goalId === undefined ? {} : { goalId: input.goalId }),
        ...(sessionId === undefined ? {} : { sessionId }),
      });
    }
    return envelope("readGoal", {
      kind: "product.goal.found" as const,
      goal: this.goal,
    });
  }

  async startGoal(input: StartGoalRequest) {
    this.goalStarts.push(input);
    this.goal = goalReadModel({
      revision: 1,
      state: "active",
      sessionId: input.sessionId ?? "session_product_tui",
      objective: input.objective,
      boundaries: input.boundaries ?? [],
      constraints: input.constraints ?? [],
      successCriteria: input.successCriteria.map((description, index) => ({
        id: `opaque-criterion-${index + 1}`,
        description,
      })),
      stopPolicy: {
        maxAttempts: input.stopPolicy?.maxAttempts ?? 8,
        maxConsecutiveBlockedAttempts:
          input.stopPolicy?.maxConsecutiveBlockedAttempts ?? 2,
      },
      attempts: [],
      attemptCount: 0,
      canPause: true,
      canResume: false,
      canCancel: true,
    });
    return envelope("startGoal", this.goal);
  }

  async pauseGoal(input: ChangeGoalStateRequest) {
    this.goalPauses.push(input);
    if (!this.matchesCurrentGoal(input)) {
      return failureEnvelope("pauseGoal", "Goal revision conflict");
    }
    this.goal = {
      ...this.requireGoal(),
      revision: input.expectedRevision + 1,
      state: "paused",
      reason: { code: "user_paused", ...(input.reason === undefined ? {} : { detail: input.reason }) },
      canPause: false,
      canResume: true,
      canCancel: true,
      updatedAt: 20,
    };
    return envelope("pauseGoal", this.goal);
  }

  async resumeGoal(input: ChangeGoalStateRequest) {
    this.goalResumes.push(input);
    if (!this.matchesCurrentGoal(input)) {
      return failureEnvelope("resumeGoal", "Goal revision conflict");
    }
    this.goal = {
      ...this.requireGoal(),
      revision: input.expectedRevision + 1,
      state: "active",
      reason: { code: "user_resumed", ...(input.reason === undefined ? {} : { detail: input.reason }) },
      canPause: true,
      canResume: false,
      canCancel: true,
      updatedAt: 21,
    };
    return envelope("resumeGoal", this.goal);
  }

  async cancelGoal(input: CancelGoalRequest) {
    this.goalCancellations.push(input);
    if (!this.matchesCurrentGoal(input)) {
      return failureEnvelope("cancelGoal", "Goal revision conflict");
    }
    this.goal = {
      ...this.requireGoal(),
      revision: input.expectedRevision + 1,
      state: "cancelled",
      reason: { code: "cancelled", detail: input.reason },
      canPause: false,
      canResume: false,
      canCancel: false,
      updatedAt: 22,
      closedAt: 22,
    };
    return envelope("cancelGoal", this.goal);
  }

  addSession(
    sessionId: string,
    title: string,
    text: string,
    kind: "chat" | "agent" = "chat",
  ): void {
    this.transcripts.set(
      sessionId,
      transcriptFor(sessionId, [
        historyRow("assistant", text, `${sessionId}_row`),
      ]),
    );
    this.home = {
      ...this.home,
      product: {
        ...this.home.product,
        sessions: {
          ...this.home.product.sessions,
          recentCount: this.home.product.sessions.recentCount + 1,
          recent: [
            ...this.home.product.sessions.recent,
            {
              sessionId,
              title,
              kind,
              status: "active",
              revision: 1,
              createdAt: 2,
              updatedAt: 2,
            },
          ],
        },
      },
    };
  }

  async readTrackedConversationOperation() {
    this.readCounts.operation += 1;
    return envelope(
      "readTrackedConversationOperation",
      this.operation === undefined
        ? {
            kind: "product.conversation-operation.untracked" as const,
            sessionId: "session_product_tui",
            message: "no active operation",
          }
        : {
            kind: "product.conversation-operation.found" as const,
            operation: this.operation,
          },
    );
  }

  async submitConversationOperation(input: unknown) {
    this.submissions.push(input);
    if (this.rejectSubmission) {
      return envelope("submitConversationOperation", {
        kind: "product.conversation-operation.rejected" as const,
        reason: "provider_not_ready" as const,
        message: this.submissionRejectionMessage,
        sessionId: "session_product_tui",
      });
    }
    const sessionId =
      typeof input === "object" &&
      input !== null &&
      "sessionId" in input &&
      typeof input.sessionId === "string"
        ? input.sessionId
        : selectedSessionId(this.home.state);
    this.setAttachments(sessionId, []);
    this.operation = operation({ terminal: false });
    return envelope("submitConversationOperation", {
      kind: "product.conversation-operation.found" as const,
      operation: this.operation,
    });
  }

  async queueGuidedFollowUp(input: unknown) {
    this.queued.push(input);
    return envelope("queueGuidedFollowUp", {
      kind: "product.conversation-operation.found" as const,
      operation: this.requireOperation(),
    });
  }

  async steerTrackedConversationOperation(
    input: unknown,
    options: { readonly requestId: string },
  ) {
    this.guided.push({ input, requestId: options.requestId });
    return envelope("steerTrackedConversationOperation", {
      kind: "product.conversation-operation.found" as const,
      operation: this.requireOperation(),
    });
  }

  async cancelTrackedConversationOperation(input: unknown) {
    this.cancellations.push(input);
    return envelope("cancelTrackedConversationOperation", {
      kind: "product.conversation-operation.cancel" as const,
      status: "cancel_requested" as const,
      operation: {
        kind: "product.conversation-operation.found" as const,
        operation: this.requireOperation(),
      },
    });
  }

  async regenerateTrackedConversationOperation(
    input: RegenerateTrackedConversationOperationRequest = {},
  ) {
    this.regenerations.push(input);
    const current = this.requireOperation();
    if (this.rejectRegeneration) {
      return envelope("regenerateTrackedConversationOperation", {
        kind: "product.conversation-operation.rejected" as const,
        reason: "operation_not_terminal" as const,
        message: "regeneration rejected: opaque-operation-secret",
        sessionId: current.sessionId,
        operation: current,
      });
    }
    this.operation = operation({
      terminal: false,
      state: "queued",
      operationId: `fresh_operation_${++this.regenerationCounter}`,
      sessionId: input.sessionId ?? current.sessionId,
      updatedAt: current.updatedAt + 1,
    });
    return envelope("regenerateTrackedConversationOperation", {
      kind: "product.conversation-operation.found" as const,
      operation: this.operation,
    });
  }

  async resolveTrackedConversationRecovery(
    input: ResolveTrackedConversationRecoveryRequest,
  ) {
    this.recoveryResolutions.push(input);
    const current = this.requireOperation();
    const item = current.recovery?.items.find(
      (candidate) => candidate.recoveryId === input.recoveryId,
    );
    if (
      this.rejectRecoveryResolution ||
      item === undefined ||
      item.recoveryRevision !== input.expectedRecoveryRevision
    ) {
      return envelope("resolveTrackedConversationRecovery", {
        kind: "product.conversation-operation.rejected" as const,
        reason: "recovery_revision_stale" as const,
        message: "recovery rejected: opaque-recovery-secret",
        sessionId: current.sessionId,
        operation: current,
      });
    }
    this.operation = operation({
      terminal: input.decision === "abandon_turn",
      state: input.decision === "abandon_turn" ? "failed" : "queued",
      operationId: current.operationId,
      sessionId: current.sessionId,
      updatedAt: current.updatedAt + 1,
    });
    return envelope("resolveTrackedConversationRecovery", {
      kind: "product.conversation-recovery.resolved" as const,
      decision: input.decision,
      action:
        input.decision === "abandon_turn"
          ? ("turn_abandoned" as const)
          : ("turn_requeued" as const),
      operation: {
        kind: "product.conversation-operation.found" as const,
        operation: this.operation,
      },
    });
  }

  async resolveTrackedConversationApproval(input: unknown) {
    this.approvals.push(input);
    this.operation = operation({ terminal: false });
    return envelope("resolveTrackedConversationApproval", {
      kind: "product.conversation-approval.resolved" as const,
      decision: "approve_once" as const,
      action: "turn_requeued" as const,
      operation: {
        kind: "product.conversation-operation.found" as const,
        operation: this.operation,
      },
    });
  }

  subscribeSurfaceEvents(listener: SurfaceEventListener) {
    this.listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.unsubscribeCount += 1;
      this.listeners.delete(listener);
    };
  }

  emitAssistantDelta(sequence: number, text: string): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.conversation.assistant-text-delta",
      command: "conversationEvent",
      at: sequence,
      conversation: {
        kind: "product.conversation.assistant-text-delta",
        sequence,
        at: sequence,
        operationId: "operation_product_tui",
        sessionId: "session_product_tui",
        partId: "part_product_tui",
        text,
        truncated: false,
      },
    });
  }

  emitInvalidation(sequence: number): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.conversation.operation-invalidated",
      command: "conversationEvent",
      at: sequence,
      conversation: {
        kind: "product.conversation.operation-invalidated",
        sequence,
        at: sequence,
        operationId: "operation_product_tui",
        sessionId: "session_product_tui",
        cause: "execution_completed",
      },
    });
  }

  emitTeamInvalidation(sequence: number, conversationId?: string): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.team.invalidated",
      command: "teamEvent",
      at: sequence,
      team: {
        kind: "product.team.invalidated",
        sequence,
        cause: "delivery_changed",
        at: sequence,
        ...(conversationId === undefined ? {} : { conversationId }),
      },
    });
  }

  emitSideQueryInvalidation(
    sequence: number,
    cause: SideQueryInvalidationCause,
    queryId = this.requireSideQuery().queryId,
  ): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.side-query.invalidated",
      command: "sideQueryEvent",
      at: sequence,
      sideQuery: {
        kind: "product.side-query.invalidated",
        sequence,
        at: sequence,
        queryId,
        cause,
      },
    });
  }

  emitPlanInvalidation(
    sequence: number,
    cause: PlanInvalidationCause,
    options: { readonly operationId?: string; readonly proposalId?: string } = {},
  ): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.plan.invalidated",
      command: "planEvent",
      at: sequence,
      plan: {
        kind: "product.plan.invalidated",
        sequence,
        at: sequence,
        cause,
        sessionId: "session_product_tui",
        ...options,
      },
    });
  }

  emitGoalInvalidation(
    sequence: number,
    cause:
      | "created"
      | "paused"
      | "resumed"
      | "attempt_admitted"
      | "attempt_reviewed"
      | "cancel_requested"
      | "cancelled"
      | "recovery_parked"
      | "limit_reached",
  ): void {
    this.emit({
      id: `surface:${sequence}`,
      sequence,
      type: "product.surface.goal.invalidated",
      command: "goalEvent",
      at: sequence,
      goal: {
        kind: "product.goal.invalidated",
        sequence,
        at: sequence,
        goalId: this.requireGoal().goalId,
        sessionId: this.requireGoal().sessionId,
        cause,
      },
    });
  }

  private emit(event: SurfaceEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private requireOperation(): ConversationOperationReadModel {
    if (this.operation === undefined) throw new Error("operation is required");
    return this.operation;
  }

  private requireGoal(): GoalReadModel {
    if (this.goal === undefined) throw new Error("Goal is required");
    return this.goal;
  }

  private requireSideQuery(): SideQueryReadModel {
    if (this.sideQuery === undefined) {
      throw new Error("Side Query is required");
    }
    return this.sideQuery;
  }

  private matchesCurrentGoal(input: {
    readonly goalId: string;
    readonly expectedRevision: number;
  }): boolean {
    return (
      this.goal?.goalId === input.goalId &&
      this.goal.revision === input.expectedRevision
    );
  }
}

function envelope<T>(
  command: SurfaceClientCommandEnvelope<T>["command"],
  value: T,
): SurfaceClientCommandEnvelope<T> {
  return {
    ok: true,
    command,
    value,
    event: {
      id: `event_${command}`,
      sequence: 1,
      type: "product.surface.command_completed",
      command,
      at: 1,
    },
  };
}

function failureEnvelope(
  command: SurfaceClientCommandEnvelope<never>["command"],
  message: string,
): SurfaceClientCommandEnvelope<never> {
  return {
    ok: false,
    command,
    error: { code: "command_error", category: "runtime", message },
    event: {
      id: `event_${command}_failed`,
      sequence: 1,
      type: "product.surface.command_rejected",
      command,
      at: 1,
    },
  };
}

function attachmentKey(sessionId: string | undefined): string {
  return sessionId ?? "product:new-conversation";
}

function conversationAttachments(
  sessionId: string | undefined,
  attachments: readonly AttachmentDraft[],
): ConversationAttachmentsReadModel {
  return {
    kind: "product.conversation-attachments",
    draftKey: attachmentKey(sessionId),
    ...(sessionId === undefined ? {} : { sessionId }),
    attachments,
  };
}

function attachmentDraft(options: {
  readonly resourceId: string;
  readonly label: string;
  readonly resourceKind?: AttachmentDraft["resourceKind"];
  readonly previewKind?: AttachmentDraft["previewKind"];
  readonly mediaType?: string;
}): AttachmentDraft {
  return {
    kind: "product.attachment",
    resourceId: options.resourceId,
    resourceKind: options.resourceKind ?? "image",
    previewKind: options.previewKind ?? "image",
    state: "available",
    sizeBytes: 4_096,
    sha256: "a".repeat(64),
    label: options.label,
    mediaType: options.mediaType ?? "image/png",
    addedAt: 1,
  };
}

function productCommand(options: {
  readonly id: string;
  readonly title: string;
  readonly sourceKind?: CommandCatalogReadModel["commands"][number]["sourceKind"];
  readonly sourceScope?: CommandCatalogReadModel["commands"][number]["sourceScope"];
  readonly sourceId?: string;
  readonly trust?: CommandCatalogReadModel["commands"][number]["trust"];
  readonly paletteVisibility?: CommandCatalogReadModel["commands"][number]["paletteVisibility"];
  readonly inputSchema?: CommandCatalogReadModel["commands"][number]["inputSchema"];
}): CommandCatalogReadModel["commands"][number] {
  return {
    id: options.id,
    name: options.id,
    title: options.title,
    handlerRef: `${options.id}.handler`,
    sourceKind: options.sourceKind ?? "builtin",
    sourceScope: options.sourceScope ?? "builtin",
    sourceId: options.sourceId ?? "product.backend",
    trust: options.trust ?? "trusted",
    paletteVisibility: options.paletteVisibility ?? "visible",
    category: options.sourceKind === "plugin" ? "extension" : "system",
    ...(options.inputSchema === undefined
      ? {}
      : { inputSchema: options.inputSchema }),
  };
}

function homeReadModel(): HomeReadModel {
  return {
    kind: "product.home",
    state: {
      selection: { kind: "session", sessionId: "session_product_tui" },
      layout: "single",
      mode: "chat",
      preferences: { theme: "system", density: "comfortable" },
    },
    product: {
      kind: "product.backend.overview",
      generatedAt: 1,
      ready: true,
      lifecycle: {
        disposed: false,
        ready: true,
        shutdownCommandId: "product.shutdown",
      },
      runtimeHost: {
        observed: true,
        started: true,
        workerCount: 1,
        memoryWorkerCount: 0,
        totalJobs: 0,
        backlogCount: 0,
        runningLeaseCount: 0,
        staleRunningLeaseCount: 0,
        loopCount: 1,
        activeLoopCount: 1,
        stoppedLoopCount: 0,
        runCount: 0,
        failureCount: 0,
        errorCount: 0,
        attentionRequired: false,
      },
      provider: { activeEndpointId: "endpoint_product_tui" },
      context: {
        configured: false,
        revision: 0,
        monitorRunning: false,
        monitorIntervalMs: 1_000,
        refreshCount: 0,
        instructionSources: 0,
        skillCount: 0,
        activationToolRegistered: false,
      },
      extensions: {
        configured: false,
        contributionCount: 0,
        diagnosticCount: 0,
        byDomain: {
          instruction: 0,
          skill: 0,
          command: 0,
          agent: 0,
          tool: 0,
          providerCatalog: 0,
          lifecycleHook: 0,
        },
      },
      capabilities: {
        selectedCount: 0,
        notSelectedCount: 0,
        selectedIds: [],
        notSelectedIds: [],
      },
      commands: {
        totalCount: 0,
        builtinCount: 0,
        extensionCount: 0,
        diagnosticCount: 0,
        categories: [],
        primary: [],
      },
      sessions: {
        recentCount: 1,
        recentLimit: 10,
        recent: [
          {
            sessionId: "session_product_tui",
            title: "Project discussion",
            kind: "chat",
            status: "active",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        archivedCount: 0,
        archived: [],
      },
      recommendedActions: [],
      diagnostics: {
        generatedAt: 1,
        totalCount: 0,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        activityCount: 0,
        top: [],
      },
    },
    providerReadiness: {
      status: "ready",
      reason: "active_endpoint_ready",
      activeEndpointId: "endpoint_product_tui",
      endpointCount: 1,
      canRun: true,
      attentionRequired: false,
      requiresCredential: false,
      credentialConfigured: false,
    },
    integration: {
      kind: "product.integration-contract",
      recommendedPackage: "@wanex/product",
      recommendedEntryPoint: "@wanex/product",
      rendererEntryPoint: "@wanex/product/surface",
      backendDependencies: ["@wanex/app"],
      forbiddenDefaultDependencies: [
        "@wanex/storage",
        "@wanex/plugin",
        "@wanex/connector",
        "@wanex/runtime/host",
      ],
      lifecycleSteps: ["create_app", "adapt_command_port", "dispose_app"],
      productOwnedState: [
        "selected_session",
        "panel_layout",
        "mode_routing",
        "renderer_state",
        "ui_preferences",
      ],
      rendererBoundary: {
        rendererMayOpenStorage: false,
        rendererMayReceiveStorePath: false,
        rendererMayReceiveServiceBinaryPath: false,
        rendererCalls: "app-owned-ipc-or-api",
      },
    },
    rendererBoundary: {
      rendererMayOpenStorage: false,
      rendererMayReceiveStorePath: false,
      rendererMayReceiveServiceBinaryPath: false,
      rendererCalls: "app-owned-ipc-or-api",
    },
    commandPort: {
      adapter: "app-owned-command-port",
      commandCount: 1,
    },
  };
}

function selectedSessionId(
  state: HomeReadModel["state"],
): string | undefined {
  return state.selection?.kind === "session"
    ? state.selection.sessionId
    : undefined;
}

function selectedTeamConversationId(
  state: HomeReadModel["state"],
): string | undefined {
  return state.selection?.kind === "team"
    ? state.selection.conversationId
    : undefined;
}

function teamConversationPage(): TeamConversationPageReadModel {
  return {
    kind: "product.team-conversation-page",
    conversation: {
      conversationId: "team_product_tui",
      title: "Research group",
      mode: "coordinated",
      state: "open",
      coordinatorParticipantId: "participant_agent",
      participantCount: 2,
      activeAgentCount: 1,
      activeRound: false,
      createdAt: 1,
      updatedAt: 2,
    },
    participants: [
      {
        participantId: "participant_user",
        kind: "user",
        state: "active",
        displayName: "You",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        participantId: "participant_agent",
        kind: "agent",
        state: "active",
        displayName: "Researcher",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    messages: [
      {
        messageId: "team_message_existing",
        authorParticipantId: "participant_user",
        kind: "message",
        status: "sent",
        content: [
          {
            type: "text",
            partId: "team_part_existing",
            text: "Public Team history",
          },
        ],
        revision: 1,
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    rounds: [],
    deliveries: [],
    observedAt: 2,
  };
}

function transcript(
  rows: ConversationHistoryReadModel["rows"],
): ConversationHistoryReadModel {
  return transcriptFor("session_product_tui", rows);
}

function transcriptFor(
  sessionId: string,
  rows: ConversationHistoryReadModel["rows"],
): ConversationHistoryReadModel {
  return {
    sessionId,
    rows,
    page: {
      limit: Math.max(rows.length, 1),
      hasMore: false,
      liveRowsTruncated: false,
    },
  };
}

function modelEndpoint(
  id: string,
  providerId: string,
  modelId: string,
  active: boolean,
): ModelEndpointReadModel {
  return {
    id,
    connection: { id: `${id}_connection`, providerId },
    protocol: { id: "openai-compatible" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: { source: "custom", catalogId: id, revision: "1" },
    },
    credentialConfigured: true,
    active,
  };
}

function planProposal(
  overrides: Partial<PlanProposalReadModel> = {},
): PlanProposalReadModel {
  return {
    kind: "product.plan-proposal",
    proposalId: "opaque-plan-proposal",
    revision: 1,
    state: "open",
    title: "Review the implementation Plan",
    summary: "Confirm the bounded steps before execution.",
    steps: [
      { id: "opaque-step-one", title: "Inspect the current state" },
      {
        id: "opaque-step-two",
        title: "Apply the reviewed change",
        detail: "Keep the existing Product authority.",
      },
    ],
    references: [],
    source: { sessionId: "session_product_tui", headSequence: 1 },
    generation: {
      endpointId: "endpoint_product_tui",
      providerId: "deepseek",
      modelId: "deepseek-chat",
      generatedAt: 10,
    },
    createdAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

function goalReadModel(
  overrides: Partial<GoalReadModel>,
): GoalReadModel {
  return {
    kind: "product.goal",
    goalId: "opaque-goal-id",
    sessionId: "session_product_tui",
    revision: 1,
    state: "active",
    objective: "Deliver the verified Goal",
    boundaries: ["Keep the Product boundary"],
    constraints: ["Do not add polling"],
    successCriteria: [
      { id: "opaque-criterion-id", description: "All checks pass" },
    ],
    stopPolicy: {
      maxAttempts: 4,
      maxConsecutiveBlockedAttempts: 2,
    },
    reason: { code: "created", detail: "Goal is running" },
    attemptCount: 1,
    activeAttemptId: "opaque-attempt-id",
    attempts: [
      {
        attemptId: "opaque-attempt-id",
        attemptNumber: 1,
        inputId: "opaque-input-id",
        turnId: "opaque-turn-id",
        jobId: "opaque-job-id",
        trigger: "initial",
        boundAt: 10,
        review: {
          disposition: "continue",
          reason: "more verified work remains",
          createdAt: 11,
        },
        verifications: [
          {
            requirementId: "opaque-requirement-id",
            result: "inconclusive",
            reason: "waiting for final evidence",
            createdAt: 11,
          },
        ],
      },
    ],
    canPause: true,
    canResume: false,
    canCancel: true,
    createdAt: 10,
    updatedAt: 11,
    ...overrides,
  };
}

function historyRow(
  role: "user" | "assistant",
  text: string,
  id: string,
): ConversationHistoryReadModel["rows"][number] {
  return {
    id,
    kind: "message",
    role,
    status: "completed",
    createdAt: 1,
    updatedAt: 1,
    parts: [{ key: `${id}_text`, type: "text", text }],
    capabilityRequests: [],
  };
}

function operation(options: {
  readonly terminal: boolean;
  readonly state?: ConversationOperationReadModel["state"];
  readonly approval?: boolean;
  readonly operationId?: string;
  readonly sessionId?: string;
  readonly updatedAt?: number;
}): ConversationOperationReadModel {
  return {
    kind: "product.conversation-operation",
    operationId: options.operationId ?? "operation_product_tui",
    sessionId: options.sessionId ?? "session_product_tui",
    state: options.state ?? (options.terminal ? "succeeded" : "running"),
    createdAt: 1,
    updatedAt: options.updatedAt ?? 2,
    transcript: { rows: [], totalRows: 0, truncated: false },
    capabilities: {
      cancellable: !options.terminal,
      regeneratable: options.terminal,
      steerable: !options.terminal,
      terminal: options.terminal,
    },
    ...(options.approval
      ? {
          approvals: {
            items: [
              {
                approvalId: "approval_product_tui",
                approvalRevision: 3,
                tool: {
                  name: "publish",
                  title: "Publish result",
                  risk: "external" as const,
                  idempotent: false,
                },
                presentation: {
                  summary: "Publish the generated result?",
                  summaryTruncated: false,
                  details: [
                    {
                      label: "Destination",
                      labelTruncated: false,
                      value: "Configured service",
                      valueTruncated: false,
                    },
                  ],
                  detailsTruncated: false,
                },
                attemptCount: 0,
                createdAt: 1,
                updatedAt: 2,
                availableDecisions: ["approve_once" as const, "deny" as const],
              },
            ],
            truncated: false,
          },
        }
      : {}),
  };
}

function recoveryOperation(
  options: { readonly approval?: boolean; readonly updatedAt?: number } = {},
): ConversationOperationReadModel {
  const base = operation({
    terminal: false,
    state: "recovery_required",
    ...(options.approval === undefined ? {} : { approval: options.approval }),
    ...(options.updatedAt === undefined ? {} : { updatedAt: options.updatedAt }),
  });
  return {
    ...base,
    capabilities: {
      cancellable: false,
      regeneratable: false,
      steerable: false,
      terminal: false,
    },
    error: {
      code: "conversation_operation_recovery_required",
      category: "runtime",
      message: "remote Tool outcome requires operator review",
    },
    recovery: {
      items: [
        {
          recoveryId: "opaque-recovery-product-tui",
          recoveryRevision: 7,
          tool: {
            name: "remote_deployment",
            title: "Remote deployment",
            risk: "external",
            idempotent: false,
          },
          evidence: {
            message: "The remote request was sent but its result was not observed.",
            messageTruncated: false,
            reconciliationRef: "opaque-reconciliation-product-tui",
          },
          attemptCount: 1,
          attempts: [
            {
              attemptNumber: 1,
              state: "recovery_required",
              startedAt: 1,
              updatedAt: 2,
              finishedAt: 2,
            },
          ],
          attemptsTruncated: false,
          availableDecisions: [
            "confirm_succeeded",
            "confirm_failed",
            "abandon_turn",
          ],
        },
      ],
      truncated: false,
    },
  };
}

function recoveryOperationWithRevision(
  recoveryRevision: number,
): ConversationOperationReadModel {
  const current = recoveryOperation({ updatedAt: 3 });
  const recovery = current.recovery;
  if (recovery === undefined) throw new Error("recovery fixture is required");
  return {
    ...current,
    recovery: {
      ...recovery,
      items: recovery.items.map((item) => ({ ...item, recoveryRevision })),
    },
  };
}

async function eventually(
  condition: () => boolean | Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition did not become true");
}

async function terminalTextContains(
  terminal: TuiVirtualTerminal,
  text: string,
): Promise<boolean> {
  return (await terminal.text()).includes(text);
}

async function settleEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}
