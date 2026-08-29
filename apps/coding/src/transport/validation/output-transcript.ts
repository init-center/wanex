import type { CodingTranscriptPage } from "../../application/model.js";
import {
  boundedString,
  exactObject,
  id,
  isRecord,
  literal,
  nonNegativeInteger,
  positiveInteger,
  timestamp,
} from "./output-utils.js";

const PART_VISIBILITIES = [
  "default",
  "user",
  "assistant",
  "internal",
  "provider_replay_only",
] as const;
const RESOURCE_KINDS = [
  "file",
  "image",
  "video",
  "audio",
  "document",
  "artifact",
  "log",
  "patch",
  "url",
] as const;
const SOURCE_TYPES = [
  "text",
  "reasoning",
  "tool_call",
  "tool_result",
  "resource",
] as const;

export function isCodingTranscript(
  value: unknown,
): value is CodingTranscriptPage {
  return (
    exactObject(
      value,
      [
        "projectId",
        "sessionId",
        "messages",
        "returnedCount",
        "hasMore",
        "contentTruncated",
        "omittedPartCount",
      ],
      ["nextCursor"],
    ) &&
    id(value.projectId) &&
    id(value.sessionId) &&
    Array.isArray(value.messages) &&
    value.messages.length <= 100 &&
    value.messages.every(isMessage) &&
    partCount(value.messages) <= 1024 &&
    textBytes(value.messages) <= 512 * 1024 &&
    nonNegativeInteger(value.returnedCount) &&
    value.returnedCount === value.messages.length &&
    typeof value.hasMore === "boolean" &&
    typeof value.contentTruncated === "boolean" &&
    nonNegativeInteger(value.omittedPartCount) &&
    (value.nextCursor === undefined || boundedString(value.nextCursor, 2048))
  );
}

function isMessage(value: unknown): boolean {
  return (
    exactObject(value, [
      "messageId",
      "sequence",
      "turnId",
      "role",
      "status",
      "createdAt",
      "updatedAt",
      "parts",
    ]) &&
    id(value.messageId) &&
    positiveInteger(value.sequence) &&
    id(value.turnId) &&
    literal(value.role, ["user", "assistant", "tool", "system"] as const) &&
    literal(value.status, ["completed", "failed", "partial"] as const) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    Array.isArray(value.parts) &&
    value.parts.every(isPart)
  );
}

function isPart(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !id(value.partId) ||
    typeof value.type !== "string" ||
    !literal(value.visibility, PART_VISIBILITIES)
  )
    return false;
  switch (value.type) {
    case "text":
      return (
        exactObject(value, [
          "partId",
          "type",
          "visibility",
          "text",
          "truncated",
        ]) &&
        boundedString(value.text, 64 * 1024, true) &&
        typeof value.truncated === "boolean"
      );
    case "reasoning":
      return (
        exactObject(
          value,
          ["partId", "type", "visibility", "truncated"],
          ["text"],
        ) &&
        (value.text === undefined ||
          boundedString(value.text, 64 * 1024, true)) &&
        typeof value.truncated === "boolean"
      );
    case "tool_call":
      return (
        exactObject(value, [
          "partId",
          "type",
          "visibility",
          "toolCallId",
          "toolName",
        ]) &&
        id(value.toolCallId) &&
        boundedString(value.toolName, 1024, true)
      );
    case "tool_result":
      return (
        exactObject(value, [
          "partId",
          "type",
          "visibility",
          "toolCallId",
          "isError",
        ]) &&
        id(value.toolCallId) &&
        typeof value.isError === "boolean"
      );
    case "resource":
      return (
        exactObject(
          value,
          [
            "partId",
            "type",
            "visibility",
            "resourceId",
            "sha256",
            "sizeBytes",
            "kind",
          ],
          ["mediaType"],
        ) &&
        id(value.resourceId) &&
        sha256(value.sha256) &&
        nonNegativeInteger(value.sizeBytes) &&
        literal(value.kind, RESOURCE_KINDS) &&
        (value.mediaType === undefined ||
          boundedString(value.mediaType, 256, true))
      );
    case "hidden":
      return (
        exactObject(value, [
          "partId",
          "type",
          "visibility",
          "sourceType",
          "hidden",
        ]) &&
        literal(value.sourceType, SOURCE_TYPES) &&
        value.hidden === true
      );
    default:
      return false;
  }
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function partCount(messages: readonly unknown[]): number {
  return messages.reduce<number>(
    (total, message) =>
      total +
      (isRecord(message) && Array.isArray(message.parts)
        ? message.parts.length
        : 0),
    0,
  );
}

function textBytes(messages: readonly unknown[]): number {
  let total = 0;
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (
        !isRecord(part) ||
        (part.type !== "text" && part.type !== "reasoning") ||
        typeof part.text !== "string"
      )
        continue;
      total += new TextEncoder().encode(part.text).byteLength;
    }
  }
  return total;
}
