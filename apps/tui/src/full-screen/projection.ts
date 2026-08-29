import type {
  ConversationApprovalItem,
  ConversationAttachmentsReadModel,
  ConversationHistoryReadModel,
  ConversationHistoryRow,
  ConversationOperationReadModel,
  ConversationSelection,
  HomeReadModel,
  TeamConversationPageReadModel,
} from "@wanex/assistant";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { TuiComposerMode } from "../application/conversation-actions.js";
import { sessionIdFromSelection } from "../selection.js";
import {
  terminalMultilineText,
  terminalSingleLineText,
} from "./terminal-text.js";
import { projectTuiTeamTimeline } from "./team/projection.js";
import { teamComposerAvailability } from "./team/composer.js";

export interface TuiFullScreenProjection {
  readonly title: string;
  readonly status: string;
  readonly sessionLabel: string;
  readonly timeline: string;
  readonly attachmentSummary?: string;
  readonly footer: string;
  readonly approval?: ConversationApprovalItem;
}

export function projectTuiFullScreen(options: {
  readonly home: HomeReadModel | undefined;
  readonly selection: ConversationSelection | undefined;
  readonly transcript: ConversationHistoryReadModel | undefined;
  readonly attachments: ConversationAttachmentsReadModel | undefined;
  readonly operation: ConversationOperationReadModel | undefined;
  readonly team: TeamConversationPageReadModel | undefined;
  readonly transientAssistantText: string | undefined;
  readonly mode: TuiComposerMode;
  readonly busy: boolean;
  readonly statusMessage: string | undefined;
  readonly errorMessage: string | undefined;
}): TuiFullScreenProjection {
  const selectedSessionId = sessionIdFromSelection(options.selection);
  const selected = options.home?.assistant.sessions.recent.find(
    (session) => session.sessionId === selectedSessionId,
  );
  const selectedTeam =
    options.selection?.kind === "team" ? options.team?.conversation : undefined;
  const readiness = options.home?.providerReadiness;
  const statusMessage =
    options.errorMessage ??
    options.statusMessage ??
    (options.selection?.kind === "team"
      ? teamStatus(options.team, readiness?.canRun === true)
      : undefined) ??
    (readiness === undefined
      ? "Connecting"
      : readiness.canRun
        ? "Ready"
        : readiness.requiresCredential
          ? "Provider credential required"
          : "Select a model provider");
  const modelId = readiness?.activeEndpoint?.model.id;
  return {
    title: "Wanex",
    status:
      modelId === undefined ? statusMessage : `${statusMessage} | ${modelId}`,
    sessionLabel:
      selectedTeam?.title ??
      selected?.title ??
      (options.selection?.kind === "team"
        ? "Group"
        : selectedSessionId === undefined
          ? "New conversation"
          : "Conversation"),
    timeline:
      options.selection?.kind === "team"
        ? projectTuiTeamTimeline(options.team)
        : timelineText({
            transcript: options.transcript,
            operation: options.operation,
            transientAssistantText: options.transientAssistantText,
          }),
    ...attachmentSummary(options.attachments),
    footer: footerText(
      options.selection,
      options.mode,
      options.operation,
      options.busy,
      options.team,
      readiness?.canRun === true,
    ),
    ...(options.operation?.approvals?.items[0] === undefined
      ? {}
      : { approval: options.operation.approvals.items[0] }),
  };
}

function teamStatus(
  team: TeamConversationPageReadModel | undefined,
  providerCanRun: boolean,
): string {
  const availability = teamComposerAvailability({
    page: team,
    providerCanRun,
  });
  return availability.message;
}

function attachmentSummary(
  value: ConversationAttachmentsReadModel | undefined,
): { readonly attachmentSummary?: string } {
  if (value === undefined || value.attachments.length === 0) return {};
  return {
    attachmentSummary: `Attachments (${value.attachments.length}): ${value.attachments
      .map(
        (attachment) =>
          `${attachment.label ?? "unnamed"} [${attachment.previewKind}]`,
      )
      .join(", ")}`,
  };
}

export function boundedTuiLines(
  text: string,
  width: number,
  maxLines: number,
): readonly string[] {
  if (width <= 0 || maxLines <= 0) return [];
  const wrapped = terminalMultilineText(text)
    .split("\n")
    .flatMap((line) => wrapTextWithAnsi(line, width))
    .map((line) =>
      visibleWidth(line) > width ? truncateToWidth(line, width) : line,
    );
  return wrapped.slice(Math.max(0, wrapped.length - maxLines));
}

function timelineText(options: {
  readonly transcript: ConversationHistoryReadModel | undefined;
  readonly operation: ConversationOperationReadModel | undefined;
  readonly transientAssistantText: string | undefined;
}): string {
  const sections = (options.transcript?.rows ?? []).map(renderHistoryRow);
  if (options.transientAssistantText !== undefined) {
    sections.push(`Wanex | Streaming\n${options.transientAssistantText}`);
  }
  for (const pending of options.operation?.steering?.pending ?? []) {
    sections.push(`Guiding current response | Pending\n${pending.text}`);
  }
  if (sections.length === 0) {
    return "Start with a question, a file, or a task.";
  }
  return sections.join("\n\n");
}

function renderHistoryRow(row: ConversationHistoryRow): string {
  const label =
    row.role === "user" ? "You" : row.role === "assistant" ? "Wanex" : row.role;
  const parts = row.parts.flatMap((part) => {
    if (part.type === "text") return [part.text];
    if (part.type === "reasoning") return [`Thinking: ${part.text}`];
    if (part.type === "tool") {
      const summary = part.presentation?.summary ?? part.name;
      return [
        `Tool: ${inlineTerminalMetadata(summary)} | ${part.state}`,
        ...(part.presentation?.details ?? []).map(
          (detail) =>
            `  ${inlineTerminalMetadata(detail.label)}: ${inlineTerminalMetadata(detail.value)}`,
        ),
      ];
    }
    return [
      `Resource: ${part.kind}${
        part.mediaType === undefined
          ? ""
          : ` | ${inlineTerminalMetadata(part.mediaType)}`
      }`,
    ];
  });
  return `${label} | ${inlineTerminalMetadata(row.status)}\n${
    parts.length === 0 ? "No visible content" : parts.join("\n")
  }`;
}

function inlineTerminalMetadata(value: string): string {
  return terminalSingleLineText(value, { maxWidth: 1_024, fallback: "" });
}

function footerText(
  selection: ConversationSelection | undefined,
  mode: TuiComposerMode,
  operation: ConversationOperationReadModel | undefined,
  busy: boolean,
  team: TeamConversationPageReadModel | undefined,
  providerCanRun: boolean,
): string {
  if (selection?.kind === "team") {
    const availability = teamComposerAvailability({ page: team, providerCanRun });
    return `${busy ? "Working" : availability.canSubmit ? "Send" : availability.message} | Enter send | F2 models | F3 group | Ctrl+O conversations | Ctrl+Q quit`;
  }
  const modeLabel =
    mode === "queue"
      ? "Queue after current"
      : mode === "guide"
        ? "Guide current"
        : "Send";
  const controls = [
    "Enter submit",
    "Shift+Enter newline",
    "Ctrl+O conversations",
    "Ctrl+P commands",
    "F2 models",
    "F3 attachments",
    "F4 plan",
    "F5 goal",
    "F6 side query",
    "F8 providers",
    "Ctrl+Q quit",
  ];
  if ((operation?.recovery?.items.length ?? 0) > 0) {
    controls.unshift("F7 recovery");
  } else if (operation?.capabilities.regeneratable === true) {
    controls.unshift("F7 regenerate");
  }
  if (operation?.capabilities.cancellable) controls.unshift("Ctrl+X stop");
  if (operation !== undefined && !operation.capabilities.terminal) {
    controls.unshift("Ctrl+G guide", "Ctrl+N queue");
  }
  return `${busy ? "Working" : modeLabel} | ${controls.join(" | ")}`;
}
