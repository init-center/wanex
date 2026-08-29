import { createHash, timingSafeEqual } from "node:crypto";
import type { SessionPageCursor, SessionTurnPageCursor } from "@wanex/protocol";
import { CodingApplicationError } from "./errors.js";

const CURSOR_DOMAIN = "wanex.coding.application.cursor.v1";

interface SessionCursorPayload {
  readonly version: 1;
  readonly kind: "sessions";
  readonly projectId: string;
  readonly updatedAt: number;
  readonly sessionId: string;
}

interface TurnCursorPayload {
  readonly version: 1;
  readonly kind: "turns";
  readonly projectId: string;
  readonly sessionId: string;
  readonly createdAt: number;
  readonly turnId: string;
}

interface TranscriptCursorPayload {
  readonly version: 1;
  readonly kind: "transcript";
  readonly projectId: string;
  readonly sessionId: string;
  readonly beforeSequence: number;
}

type CursorPayload =
  | SessionCursorPayload
  | TurnCursorPayload
  | TranscriptCursorPayload;

export function encodeSessionCursor(
  projectId: string,
  cursor: SessionPageCursor,
): string {
  return encode({
    version: 1,
    kind: "sessions",
    projectId,
    updatedAt: cursor.updatedAt,
    sessionId: cursor.sessionId,
  });
}

export function decodeSessionCursor(
  value: string,
  projectId: string,
): SessionPageCursor {
  const payload = decode(value);
  if (
    payload.kind !== "sessions" ||
    payload.projectId !== projectId ||
    !validTimestamp(payload.updatedAt) ||
    !validId(payload.sessionId)
  ) {
    invalidCursor();
  }
  return { updatedAt: payload.updatedAt, sessionId: payload.sessionId };
}

export function encodeTurnCursor(
  projectId: string,
  sessionId: string,
  cursor: SessionTurnPageCursor,
): string {
  return encode({
    version: 1,
    kind: "turns",
    projectId,
    sessionId,
    createdAt: cursor.createdAt,
    turnId: cursor.turnId,
  });
}

export function decodeTurnCursor(
  value: string,
  projectId: string,
  sessionId: string,
): SessionTurnPageCursor {
  const payload = decode(value);
  if (
    payload.kind !== "turns" ||
    payload.projectId !== projectId ||
    payload.sessionId !== sessionId ||
    !validTimestamp(payload.createdAt) ||
    !validId(payload.turnId)
  ) {
    invalidCursor();
  }
  return { createdAt: payload.createdAt, turnId: payload.turnId };
}

export function encodeTranscriptCursor(
  projectId: string,
  sessionId: string,
  beforeSequence: number,
): string {
  return encode({
    version: 1,
    kind: "transcript",
    projectId,
    sessionId,
    beforeSequence,
  });
}

export function decodeTranscriptCursor(
  value: string,
  projectId: string,
  sessionId: string,
): number {
  const payload = decode(value);
  if (
    payload.kind !== "transcript" ||
    payload.projectId !== projectId ||
    payload.sessionId !== sessionId ||
    !validPositiveInteger(payload.beforeSequence)
  ) {
    invalidCursor();
  }
  return payload.beforeSequence;
}

function encode(payload: CursorPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${checksum(encoded)}`;
}

function decode(value: string): CursorPayload {
  if (value.length === 0 || value.length > 2_048) invalidCursor();
  const parts = value.split(".");
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    invalidCursor();
  }
  const expected = Buffer.from(checksum(parts[0]), "utf8");
  const actual = Buffer.from(parts[1], "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    invalidCursor();
  }
  try {
    const payloadBytes = Buffer.from(parts[0], "base64url");
    if (payloadBytes.toString("base64url") !== parts[0]) invalidCursor();
    const payload = JSON.parse(payloadBytes.toString("utf8")) as unknown;
    if (!validPayload(payload)) invalidCursor();
    return payload;
  } catch {
    invalidCursor();
  }
}

function validPayload(value: unknown): value is CursorPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const record = value as Readonly<Record<string, unknown>>;
  if (record.version !== 1 || !validId(record.projectId)) return false;
  if (record.kind === "sessions") {
    return (
      Object.keys(record).length === 5 &&
      validTimestamp(record.updatedAt) &&
      validId(record.sessionId)
    );
  }
  if (record.kind === "turns") {
    return (
      Object.keys(record).length === 6 &&
      validId(record.sessionId) &&
      validTimestamp(record.createdAt) &&
      validId(record.turnId)
    );
  }
  if (record.kind === "transcript") {
    return (
      Object.keys(record).length === 5 &&
      validId(record.sessionId) &&
      validPositiveInteger(record.beforeSequence)
    );
  }
  return false;
}

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function checksum(value: string): string {
  return createHash("sha256")
    .update(`${CURSOR_DOMAIN}\0${value}`)
    .digest("base64url");
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 512
  );
}

function invalidCursor(): never {
  throw new CodingApplicationError(
    "invalid_request",
    "Coding page cursor is invalid",
  );
}
