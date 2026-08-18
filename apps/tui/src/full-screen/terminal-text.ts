import stripAnsi from "strip-ansi";
import { truncateToWidth } from "@earendil-works/pi-tui";

const BIDI_CONTROL_CHARACTERS =
  /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu;

const BRACKETED_PASTE_START = "\u001b[200~";
const BRACKETED_PASTE_END = "\u001b[201~";

export function terminalSingleLineText(
  value: string,
  options: {
    readonly maxWidth?: number;
    readonly fallback?: string;
  } = {},
): string {
  const maxWidth = Math.max(1, options.maxWidth ?? 160);
  const fallback = options.fallback ?? "(unnamed)";
  const plain = terminalPlainText(value)
    .replace(/[\r\n\u2028\u2029]+/gu, " ")
    .replace(/[\p{Cc}\p{Cs}]/gu, " ");
  if (plain.trim().length === 0) return fallback;
  return truncateToWidth(plain, maxWidth, "");
}

export function terminalMultilineText(value: string): string {
  return terminalPlainText(value)
    .replace(/\r\n|\r|\u2028|\u2029/gu, "\n")
    .replace(/[\p{Cc}\p{Cs}]/gu, (character) =>
      character === "\n" ? "\n" : " ",
    );
}

export function terminalBracketedPasteInput(value: string): string {
  let cursor = 0;
  let sanitized = "";
  let changed = false;

  while (cursor < value.length) {
    const start = value.indexOf(BRACKETED_PASTE_START, cursor);
    if (start === -1) {
      sanitized += value.slice(cursor);
      break;
    }
    const contentStart = start + BRACKETED_PASTE_START.length;
    const end = value.indexOf(BRACKETED_PASTE_END, contentStart);
    if (end === -1) return value;
    const content = value.slice(contentStart, end);
    const safeContent = terminalMultilineText(content);
    sanitized +=
      value.slice(cursor, contentStart) + safeContent + BRACKETED_PASTE_END;
    changed ||= safeContent !== content;
    cursor = end + BRACKETED_PASTE_END.length;
  }

  return changed ? sanitized : value;
}

function terminalPlainText(value: string): string {
  return stripAnsi(value).replace(BIDI_CONTROL_CHARACTERS, "");
}
