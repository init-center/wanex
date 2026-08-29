import type {
  MessagePart,
  SessionRecord,
  SessionInputOriginKind,
  SessionInputRecord,
  SessionMessageRecord,
  SessionTurnRecord,
  ToolActivityRecord,
} from "@wanex/protocol";
import { normalizeModelCapabilityRequirement } from "@wanex/runtime/provider";
import { WANEX_APP_CAPABILITY_REQUEST_TOOL_NAME } from "./capability-request-tool.js";
import type {
  WanexAppRecentSessionRow,
  WanexAppRecentSessionsReadModel,
  WanexAppSessionTranscriptPart,
  WanexAppSessionTranscriptReadModel,
  WanexAppSessionTranscriptRow,
  WanexAppSessionTranscriptCapabilityRequestPart,
  WanexAppSessionInputProvenanceReadModel,
  WanexAppSessionInputProvenanceRow,
} from "./types-read-model.js";

const provenanceLabels: Record<string, string> = {
  interactive: "Interactive",
  scheduler: "Scheduled",
  connector: "Channel",
  agent: "Agent",
  system: "System",
  objective: "Objective",
  plan: "Plan",
};

export function projectWanexAppSessionInputProvenance(
  input: SessionInputRecord,
): WanexAppSessionInputProvenanceRow {
  const origin = input.origin;
  const kind = origin?.kind ?? "interactive";
  return {
    inputId: input.id,
    sessionId: input.sessionId,
    kind,
    label: provenanceLabels[kind] ?? kind,
    ...(origin?.sourceRef === undefined ? {} : { sourceRef: origin.sourceRef }),
    ...(origin?.parentRef === undefined ? {} : { parentRef: origin.parentRef }),
    ...(input.intent === undefined ? {} : { intent: input.intent }),
    ...(input.runControlPolicy === undefined
      ? {}
      : { runControlPolicy: input.runControlPolicy }),
    ...(input.expectedTurnId === undefined
      ? {}
      : { expectedTurnId: input.expectedTurnId }),
    metadataKeys: Object.keys(origin?.metadata ?? {}).sort(),
  };
}

export function projectWanexAppSessionInputProvenanceReadModel(
  sessionId: string,
  inputs: readonly SessionInputRecord[],
): WanexAppSessionInputProvenanceReadModel {
  return {
    sessionId,
    rows: inputs.map(projectWanexAppSessionInputProvenance),
    hasClientField: JSON.stringify(inputs).includes('"client"'),
  };
}

export function projectWanexAppRecentSessionsReadModel(
  sessions: readonly SessionRecord[],
  limit: number,
): WanexAppRecentSessionsReadModel {
  return {
    kind: "wanex-app.recent_sessions",
    limit,
    rows: sessions.map(projectWanexAppSessionRow),
  };
}

export function projectWanexAppSessionRow(
  session: SessionRecord,
): WanexAppRecentSessionRow {
  return {
    sessionId: session.id,
    ...(session.title === undefined ? {} : { title: session.title }),
    kind: session.kind,
    status: session.status,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.archivedAt === undefined
      ? {}
      : { archivedAt: session.archivedAt }),
  };
}

export function projectWanexAppSessionTranscriptReadModel(
  sessionId: string,
  records: {
    readonly inputs: readonly SessionInputRecord[];
    readonly messages: readonly SessionMessageRecord[];
    readonly turns?: readonly SessionTurnRecord[];
    readonly toolActivities?: readonly ToolActivityRecord[];
  },
  page: WanexAppSessionTranscriptReadModel["page"] = {
    limit: records.messages.length,
    hasMore: false,
    liveInputsTruncated: false,
  },
): WanexAppSessionTranscriptReadModel {
  const toolNames = toolNamesByTurnAndCallId(records.messages);
  const turns = new Map(
    (records.turns ?? []).map((turn) => [turn.id, turn] as const),
  );
  const toolActivities = new Map(
    (records.toolActivities ?? []).flatMap((record) =>
      record.sessionId !== sessionId
        ? []
        : [[
            toolActivityKey(record.sourceMessageId, record.toolCallId),
            record,
          ] as const],
    ),
  );
  return {
    sessionId,
    page,
    rows: [
      ...records.inputs
        .filter(
          (input) =>
            input.status !== "promoted" && input.status !== "completed",
        )
        .map(projectSessionInputTranscriptRow),
      ...records.messages.map((message) =>
        projectSessionMessageTranscriptRow(
          message,
          toolNames,
          turns,
          toolActivities,
        ),
      ),
    ].sort(compareTranscriptRows),
  };
}

function projectSessionInputTranscriptRow(
  input: SessionInputRecord,
): WanexAppSessionTranscriptRow {
  const parts = input.content.flatMap((part) =>
    projectTranscriptParts(part, undefined),
  );
  return {
    id: `input:${input.id}`,
    kind: "input",
    recordId: input.id,
    sessionId: input.sessionId,
    role: input.inputType,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    text: transcriptText(parts),
    parts,
    inputId: input.id,
  };
}

function projectSessionMessageTranscriptRow(
  message: SessionMessageRecord,
  toolNames: ReadonlyMap<string, string>,
  turns: ReadonlyMap<string, SessionTurnRecord>,
  toolActivities: ReadonlyMap<string, ToolActivityRecord>,
): WanexAppSessionTranscriptRow {
  const parts = message.content.flatMap((part) =>
    projectTranscriptParts(
      part,
      message.role === "tool"
        ? toolNames.get(toolCallKey(message.turnId, toolCallId(part)))
        : undefined,
      part.type === "tool_call"
        ? toolActivities.get(toolActivityKey(message.id, part.toolCallId))
        : undefined,
    ),
  );
  const regeneratesTurnId =
    message.role === "user" && message.turnId !== undefined
      ? turns.get(message.turnId)?.regeneratesTurnId
      : undefined;
  return {
    id: `message:${message.id}`,
    kind: "message",
    recordId: message.id,
    sessionId: message.sessionId,
    role: message.role,
    status: message.status,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    text: transcriptText(parts),
    parts,
    sequence: message.sequence,
    turnId: message.turnId,
    ...(regeneratesTurnId === undefined ? {} : { regeneratesTurnId }),
    ...(message.inputId === undefined ? {} : { inputId: message.inputId }),
    ...(message.attemptId === undefined
      ? {}
      : { attemptId: message.attemptId }),
  };
}

function projectTranscriptPart(
  part: MessagePart,
  toolActivity: ToolActivityRecord | undefined,
): WanexAppSessionTranscriptPart {
  const visibility = part.visibility ?? "default";
  if (visibility === "internal" || visibility === "provider_replay_only") {
    return {
      partId: part.id,
      type: "hidden",
      sourceType: part.type,
      visibility,
      hidden: true,
    };
  }

  switch (part.type) {
    case "text":
      return {
        partId: part.id,
        type: "text",
        visibility,
        text: part.text,
      };
    case "reasoning":
      return {
        partId: part.id,
        type: "reasoning",
        visibility,
        ...(part.text === undefined ? {} : { text: part.text }),
        hidden: false,
      };
    case "tool_call":
      return {
        partId: part.id,
        type: "tool_call",
        visibility,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        ...(toolActivity === undefined
          ? {}
          : { executionState: toolActivity.state }),
        ...(toolActivity?.activity === undefined
          ? {}
          : { activity: toolActivity.activity }),
      };
    case "tool_result":
      return {
        partId: part.id,
        type: "tool_result",
        visibility,
        toolCallId: part.toolCallId,
        isError: part.isError,
      };
    case "resource":
      return {
        partId: part.id,
        type: "resource",
        visibility,
        resourceId: part.resourceId,
        sha256: part.sha256,
        sizeBytes: part.sizeBytes,
        kind: part.kind,
        ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType }),
      };
  }
}

function projectTranscriptParts(
  part: MessagePart,
  toolName: string | undefined,
  toolActivity?: ToolActivityRecord,
): readonly WanexAppSessionTranscriptPart[] {
  const projected = projectTranscriptPart(part, toolActivity);
  if (part.type !== "tool_result") return [projected];
  const capabilityRequest = projectCapabilityRequestPart(part, toolName);
  return [
    projected,
    ...part.content.flatMap((content, index) =>
      content.type !== "resource"
        ? []
        : [
            {
              partId: `${part.id}:resource:${index}`,
              type: "resource" as const,
              visibility: projected.visibility,
              resourceId: content.resourceId,
              sha256: content.sha256,
              sizeBytes: content.sizeBytes,
              kind: content.kind,
              ...(content.mediaType === undefined
                ? {}
                : { mediaType: content.mediaType }),
            },
          ],
    ),
    ...(capabilityRequest === undefined ? [] : [capabilityRequest]),
  ];
}

function projectCapabilityRequestPart(
  part: Extract<MessagePart, { readonly type: "tool_result" }>,
  toolName: string | undefined,
): WanexAppSessionTranscriptCapabilityRequestPart | undefined {
  if (
    toolName !== WANEX_APP_CAPABILITY_REQUEST_TOOL_NAME ||
    part.isError ||
    part.content.length !== 1 ||
    part.content[0]?.type !== "json"
  ) {
    return undefined;
  }
  const value = part.content[0].value;
  if (!isRecord(value) || value.kind !== "capability.request") {
    return undefined;
  }
  const operation = routableOperation(value.operation);
  if (operation === undefined || !Array.isArray(value.requirements)) {
    return undefined;
  }
  const requirements = value.requirements.map(projectCapabilityRequirement);
  if (
    requirements.length === 0 ||
    requirements.length > 64 ||
    requirements.some((requirement) => requirement === undefined) ||
    requirements.some((item) => item?.requirement.operation !== operation)
  ) {
    return undefined;
  }
  const projected = requirements as NonNullable<
    (typeof requirements)[number]
  >[];
  return {
    partId: `${part.id}:capability-request`,
    type: "capability_request",
    visibility: part.visibility ?? "default",
    toolCallId: part.toolCallId,
    operation,
    requirements: projected,
    setupRequired: projected.some((item) => item.status !== "ready"),
  };
}

function projectCapabilityRequirement(
  value: unknown,
):
  | WanexAppSessionTranscriptCapabilityRequestPart["requirements"][number]
  | undefined {
  if (!isRecord(value)) return undefined;
  const status = capabilityReadinessStatus(value.status);
  if (
    status === undefined ||
    typeof value.reason !== "string" ||
    value.reason.length > 512 ||
    !isRecord(value.requirement)
  ) {
    return undefined;
  }
  try {
    return {
      requirement: normalizeModelCapabilityRequirement(
        value.requirement as never,
      ),
      status,
      reason: value.reason,
    };
  } catch {
    return undefined;
  }
}

function capabilityReadinessStatus(
  value: unknown,
):
  | WanexAppSessionTranscriptCapabilityRequestPart["requirements"][number]["status"]
  | undefined {
  return value === "ready" ||
    value === "unconfigured" ||
    value === "selection_required" ||
    value === "configured_endpoint_missing" ||
    value === "configured_endpoint_ineligible" ||
    value === "configured_endpoint_unavailable" ||
    value === "executor_unavailable"
    ? value
    : undefined;
}

function routableOperation(
  value: unknown,
): WanexAppSessionTranscriptCapabilityRequestPart["operation"] | undefined {
  return value === "image.generate" ||
    value === "image.edit" ||
    value === "video.generate" ||
    value === "audio.transcribe" ||
    value === "audio.synthesize"
    ? value
    : undefined;
}

function toolNamesByTurnAndCallId(
  messages: readonly SessionMessageRecord[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type === "tool_call") {
        const key = toolCallKey(message.turnId, part.toolCallId);
        const existing = result.get(key);
        if (existing !== undefined && existing !== part.toolName) {
          ambiguous.add(key);
          result.delete(key);
        } else if (!ambiguous.has(key)) {
          result.set(key, part.toolName);
        }
      }
    }
  }
  return result;
}

function toolCallKey(turnId: string, toolCallId: string): string {
  return `${turnId}\u0000${toolCallId}`;
}

function toolActivityKey(sourceMessageId: string, toolCallId: string): string {
  return `${sourceMessageId}\u0000${toolCallId}`;
}

function toolCallId(part: MessagePart): string {
  return part.type === "tool_call" || part.type === "tool_result"
    ? part.toolCallId
    : "";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transcriptText(
  parts: readonly WanexAppSessionTranscriptPart[],
): string {
  return parts.map(transcriptPartText).filter(Boolean).join("\n");
}

function transcriptPartText(part: WanexAppSessionTranscriptPart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "reasoning":
      return part.hidden ? "" : (part.text ?? "");
    case "resource":
      return `[resource:${part.resourceId}]`;
    case "tool_call":
      return `[tool_call:${part.toolName}]`;
    case "tool_result":
      return part.isError ? "[tool_result:error]" : "[tool_result]";
    case "capability_request":
      return "";
    case "hidden":
      return "";
  }
}

function compareTranscriptRows(
  left: WanexAppSessionTranscriptRow,
  right: WanexAppSessionTranscriptRow,
): number {
  return (
    (left.sequence ?? Number.MAX_SAFE_INTEGER) -
      (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt - right.createdAt ||
    rowKindOrder(left.kind) - rowKindOrder(right.kind) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function rowKindOrder(kind: WanexAppSessionTranscriptRow["kind"]): number {
  return kind === "input" ? 0 : 1;
}
