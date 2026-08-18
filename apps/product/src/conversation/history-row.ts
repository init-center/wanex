import { createHash } from "node:crypto";

export function conversationHistoryRowId(
  sessionId: string,
  rowId: string,
): string {
  const digest = createHash("sha256")
    .update(`${sessionId}\u0000${rowId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `product_conversation_history_${digest}`;
}

export function conversationPartKey(
  sessionId: string,
  rowId: string,
  partIndex: number,
): string {
  const digest = createHash("sha256")
    .update(`${sessionId}\u0000${rowId}\u0000${partIndex}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `product_conversation_part_${digest}`;
}

export function conversationHistoryCursor(
  sessionId: string,
  beforeSequence: number,
): string {
  if (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1) {
    throw new Error("conversation history sequence must be a positive safe integer");
  }
  const checksum = historyCursorChecksum(sessionId, beforeSequence);
  return Buffer.from(`${beforeSequence}:${checksum}`, "utf8").toString("base64url");
}

export function parseConversationHistoryCursor(
  sessionId: string,
  cursor: string,
): number {
  if (cursor.length === 0 || cursor.length > 128) {
    throw new Error("conversation history cursor is invalid");
  }
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("conversation history cursor is invalid");
  }
  const match = /^(\d+):([a-f0-9]{24})$/u.exec(decoded);
  if (match === null) throw new Error("conversation history cursor is invalid");
  const beforeSequence = Number(match[1]);
  if (
    !Number.isSafeInteger(beforeSequence) ||
    beforeSequence < 1 ||
    match[2] !== historyCursorChecksum(sessionId, beforeSequence)
  ) {
    throw new Error("conversation history cursor does not belong to this session");
  }
  return beforeSequence;
}

function historyCursorChecksum(sessionId: string, beforeSequence: number): string {
  return createHash("sha256")
    .update(`${sessionId}\u0000${beforeSequence}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}
