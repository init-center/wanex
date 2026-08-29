import type { TeamConversationPageCursor } from "@wanex/protocol"

const MAX_CURSOR_LENGTH = 512

export function encodeTeamPageCursor(
  cursor: TeamConversationPageCursor
): string {
  return Buffer.from(JSON.stringify({
    createdAt: cursor.createdAt,
    messageId: cursor.messageId
  }), "utf8").toString("base64url")
}

export function decodeTeamPageCursor(
  cursor: string | undefined
): TeamConversationPageCursor | undefined {
  if (cursor === undefined) return undefined
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new Error("Team conversation cursor is invalid")
  }
  let value: unknown
  try {
    const bytes = Buffer.from(cursor, "base64url")
    if (bytes.toString("base64url") !== cursor) {
      throw new Error("non-canonical base64url")
    }
    value = JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error("Team conversation cursor is invalid")
  }
  if (!isRecord(value)) {
    throw new Error("Team conversation cursor is invalid")
  }
  const keys = Object.keys(value).sort()
  if (keys.join(",") !== "createdAt,messageId") {
    throw new Error("Team conversation cursor is invalid")
  }
  if (
    !Number.isSafeInteger(value.createdAt) ||
    (value.createdAt as number) < 0 ||
    typeof value.messageId !== "string" ||
    value.messageId.length === 0
  ) {
    throw new Error("Team conversation cursor is invalid")
  }
  return {
    createdAt: value.createdAt as number,
    messageId: value.messageId
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
