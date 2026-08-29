import type { MessagePart, SessionMessageRecord } from "@wanex/protocol";
import type { CodingRepository } from "../host/types.js";
import { decodeTranscriptCursor, encodeTranscriptCursor } from "./cursor.js";
import { CodingApplicationError } from "./errors.js";
import type {
  CodingTranscriptMessageReadModel,
  CodingTranscriptPage,
  CodingTranscriptPartReadModel,
  ReadCodingTranscriptRequest,
} from "./model.js";

const DEFAULT_TRANSCRIPT_PAGE_SIZE = 50;
const MAX_TRANSCRIPT_PAGE_SIZE = 100;
const MAX_TRANSCRIPT_UTF8_BYTES = 512 * 1024;
const MAX_TEXT_PART_UTF8_BYTES = 64 * 1024;
const MAX_PROJECTED_PARTS = 1_024;
const MAX_ID_CHARS = 512;
const MAX_TOOL_NAME_CHARS = 256;

export async function readApplicationTranscript(request: {
  readonly repository: CodingRepository;
  readonly input: ReadCodingTranscriptRequest;
}): Promise<CodingTranscriptPage | null> {
  const projectId = request.repository.repositoryId;
  const sessionId = request.input.sessionId;
  const limit = transcriptLimit(request.input.limit);
  const window = await request.repository.readTranscript({
    sessionId,
    ...(request.input.cursor === undefined
      ? {}
      : {
          beforeSequence: decodeTranscriptCursor(
            request.input.cursor,
            projectId,
            sessionId,
          ),
        }),
    limit: limit + 1,
  });
  if (window === null) return null;

  const selected =
    window.messages.length > limit ? window.messages.slice(1) : window.messages;
  const hasMore = window.messages.length > limit || window.hasMore;
  const continuation =
    window.messages.length > limit
      ? selected[0]?.sequence
      : window.continuation;
  const projection = projectMessages(selected);
  return {
    projectId,
    sessionId,
    messages: projection.messages,
    returnedCount: projection.messages.length,
    hasMore,
    contentTruncated: projection.contentTruncated,
    omittedPartCount: projection.omittedPartCount,
    ...(hasMore && continuation !== undefined
      ? {
          nextCursor: encodeTranscriptCursor(
            projectId,
            sessionId,
            continuation,
          ),
        }
      : {}),
  };
}

function projectMessages(records: readonly SessionMessageRecord[]): {
  readonly messages: readonly CodingTranscriptMessageReadModel[];
  readonly contentTruncated: boolean;
  readonly omittedPartCount: number;
} {
  const budget = new TranscriptBudget();
  let partCount = 0;
  let omittedPartCount = 0;
  const messages = records.map((message): CodingTranscriptMessageReadModel => {
    const parts: CodingTranscriptPartReadModel[] = [];
    for (const part of message.content) {
      const remaining = MAX_PROJECTED_PARTS - partCount;
      if (remaining <= 0) {
        omittedPartCount += projectedPartCount(part);
        continue;
      }
      const projected = projectPart(part, budget, remaining);
      omittedPartCount += projected.omittedCount;
      for (const item of projected.parts) {
        parts.push(item);
        partCount += 1;
      }
    }
    return {
      messageId: boundedIdentity(message.id),
      sequence: message.sequence,
      turnId: boundedIdentity(message.turnId),
      role: message.role,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      parts,
    };
  });
  return {
    messages,
    contentTruncated: budget.truncated || omittedPartCount > 0,
    omittedPartCount,
  };
}

function projectPart(
  part: MessagePart,
  budget: TranscriptBudget,
  limit: number,
): {
  readonly parts: readonly CodingTranscriptPartReadModel[];
  readonly omittedCount: number;
} {
  const visibility = part.visibility ?? "default";
  const partId = boundedIdentity(part.id);
  if (visibility === "internal" || visibility === "provider_replay_only") {
    return {
      parts: [
        {
          partId,
          type: "hidden",
          sourceType: part.type,
          visibility,
          hidden: true,
        },
      ],
      omittedCount: 0,
    };
  }
  switch (part.type) {
    case "text": {
      const text = budget.take(part.text, MAX_TEXT_PART_UTF8_BYTES);
      return {
        parts: [{ partId, type: "text", visibility, ...text }],
        omittedCount: 0,
      };
    }
    case "reasoning": {
      const text =
        part.text === undefined
          ? undefined
          : budget.take(part.text, MAX_TEXT_PART_UTF8_BYTES);
      return {
        parts: [
          {
            partId,
            type: "reasoning",
            visibility,
            ...(text === undefined ? { truncated: false } : text),
          },
        ],
        omittedCount: 0,
      };
    }
    case "tool_call":
      return {
        parts: [
          {
            partId,
            type: "tool_call",
            visibility,
            toolCallId: boundedIdentity(part.toolCallId),
            toolName: boundedValue(part.toolName, MAX_TOOL_NAME_CHARS),
          },
        ],
        omittedCount: 0,
      };
    case "tool_result": {
      const resources = part.content.flatMap((content, index) =>
        content.type === "resource" ? [{ content, index }] : [],
      );
      const selected = resources.slice(0, Math.max(0, limit - 1));
      return {
        parts: [
          {
            partId,
            type: "tool_result",
            visibility,
            toolCallId: boundedIdentity(part.toolCallId),
            isError: part.isError,
          },
          ...selected.map(({ content, index }) =>
            projectResource(`${partId}:resource:${index}`, visibility, content),
          ),
        ],
        omittedCount: resources.length - selected.length,
      };
    }
    case "resource":
      return {
        parts: [projectResource(partId, visibility, part)],
        omittedCount: 0,
      };
  }
}

function projectedPartCount(part: MessagePart): number {
  if (
    part.visibility === "internal" ||
    part.visibility === "provider_replay_only"
  )
    return 1;
  return part.type === "tool_result"
    ? 1 + part.content.filter((content) => content.type === "resource").length
    : 1;
}

function projectResource(
  partId: string,
  visibility: CodingTranscriptPartReadModel["visibility"],
  resource:
    | Extract<MessagePart, { readonly type: "resource" }>
    | {
        readonly resourceId: string;
        readonly sha256: string;
        readonly sizeBytes: number;
        readonly kind: Extract<
          MessagePart,
          { readonly type: "resource" }
        >["kind"];
        readonly mediaType?: string;
      },
): Extract<CodingTranscriptPartReadModel, { readonly type: "resource" }> {
  return {
    partId,
    type: "resource",
    visibility,
    resourceId: boundedIdentity(resource.resourceId),
    sha256: boundedValue(resource.sha256, 128),
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined
      ? {}
      : { mediaType: boundedValue(resource.mediaType, 256) }),
  };
}

class TranscriptBudget {
  #remaining = MAX_TRANSCRIPT_UTF8_BYTES;
  truncated = false;

  take(
    value: string,
    perPartLimit: number,
  ): {
    readonly text: string;
    readonly truncated: boolean;
  } {
    const limit = Math.min(this.#remaining, perPartLimit);
    const text = truncateUtf8(value, limit);
    const used = utf8Length(text);
    this.#remaining -= used;
    const truncated = text !== value;
    if (truncated) this.truncated = true;
    return { text, truncated };
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Length(value) <= maxBytes) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const end = safeCodePointBoundary(value, middle);
    if (utf8Length(value.slice(0, end)) <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return value.slice(0, safeCodePointBoundary(value, low));
}

function safeCodePointBoundary(value: string, index: number): number {
  if (
    index > 0 &&
    index < value.length &&
    /[\uD800-\uDBFF]/.test(value[index - 1]!) &&
    /[\uDC00-\uDFFF]/.test(value[index]!)
  ) {
    return index - 1;
  }
  return index;
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function boundedIdentity(value: string): string {
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_ID_CHARS) {
    throw new Error("Coding transcript contains an invalid identity");
  }
  return value;
}

function boundedValue(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function transcriptLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_TRANSCRIPT_PAGE_SIZE;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_TRANSCRIPT_PAGE_SIZE
  ) {
    throw new CodingApplicationError(
      "invalid_request",
      `Coding transcript limit must be between 1 and ${MAX_TRANSCRIPT_PAGE_SIZE}`,
    );
  }
  return limit;
}
