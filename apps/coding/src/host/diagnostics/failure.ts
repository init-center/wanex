import type {
  CodingDiagnosticFailure,
  CodingDiagnosticFailureCategory,
  CodingDiagnosticFailureSignal,
} from "./types.js";

const MAX_SCAN_NODES = 256;
const MAX_STRING_LENGTH = 4_096;

const SIGNAL_PATTERNS: ReadonlyArray<{
  readonly signal: CodingDiagnosticFailureSignal;
  readonly pattern: RegExp;
}> = [
  { signal: "eperm", pattern: /\beperm\b|operation not permitted/i },
  { signal: "eacces", pattern: /\beacces\b|permission denied|access denied/i },
  { signal: "enoent", pattern: /\benoent\b|no such file|cannot find (?:the )?(?:file|path)/i },
  { signal: "eexist", pattern: /\beexist\b|already exists/i },
  { signal: "timeout", pattern: /\btimeout\b|timed out/i },
  { signal: "cancelled", pattern: /\bcancel(?:led|ed|lation)?\b|\babort(?:ed)?\b/i },
  { signal: "lease", pattern: /\blease\b/i },
  { signal: "rename", pattern: /\brename\b/i },
  { signal: "worktree", pattern: /\bworktree\b/i },
  { signal: "transaction", pattern: /\btransaction\b/i },
  { signal: "conflict", pattern: /\bconflict(?:ed|ing)?\b/i },
  { signal: "invalid_argument", pattern: /invalid argument|\beinvalid\b|\binvalid_input\b/i },
  { signal: "sqlite", pattern: /\bsqlite\b/i },
  { signal: "storage", pattern: /\bstorage\b|\bdatabase\b/i },
  { signal: "rpc", pattern: /\brpc\b/i },
  { signal: "pipe", pattern: /\bpipe\b/i },
  { signal: "spawn", pattern: /\bspawn\b/i },
  { signal: "process", pattern: /\bprocess\b|command failed|exited with/i },
  { signal: "provider", pattern: /\bprovider\b/i },
  { signal: "tool", pattern: /\btool\b/i },
  { signal: "git", pattern: /\bgit\b/i },
  { signal: "path", pattern: /\bpath\b|outside (?:the )?(?:root|workspace)/i },
];

export function diagnosticFailure(
  ...values: readonly unknown[]
): CodingDiagnosticFailure | undefined {
  const strings = collectStrings(values);
  if (strings.length === 0) return undefined;
  const signals = SIGNAL_PATTERNS
    .filter(({ pattern }) => strings.some((value) => pattern.test(value)))
    .map(({ signal }) => signal);
  const type = failureIdentifier(values, "type");
  const name = failureIdentifier(values, "name");
  const code = failureIdentifier(values, "code");
  return {
    category: failureCategory(signals),
    signals,
    ...(type === undefined ? {} : { type }),
    ...(name === undefined ? {} : { name }),
    ...(code === undefined ? {} : { code }),
  };
}

function collectStrings(values: readonly unknown[]): string[] {
  const strings: string[] = [];
  const pending = [...values];
  const visited = new Set<object>();
  let scanned = 0;
  while (pending.length > 0 && scanned < MAX_SCAN_NODES) {
    const value = pending.shift();
    scanned += 1;
    if (typeof value === "string") {
      strings.push(value.slice(0, MAX_STRING_LENGTH));
      continue;
    }
    if (value instanceof Error) {
      strings.push(value.name, value.message.slice(0, MAX_STRING_LENGTH));
      const code = (value as Error & { readonly code?: unknown }).code;
      if (typeof code === "string") strings.push(code);
      continue;
    }
    if (value === null || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    pending.push(...Object.values(value));
  }
  return strings;
}

function failureIdentifier(
  values: readonly unknown[],
  key: "type" | "name" | "code",
): string | undefined {
  const pending = [...values];
  const visited = new Set<object>();
  let scanned = 0;
  while (pending.length > 0 && scanned < MAX_SCAN_NODES) {
    const value = pending.shift();
    scanned += 1;
    if (value instanceof Error) {
      const candidate = key === "name"
        ? value.name
        : key === "code"
          ? (value as Error & { readonly code?: unknown }).code
          : undefined;
      if (isSafeIdentifier(candidate)) return candidate;
      continue;
    }
    if (value === null || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    const candidate = (value as Record<string, unknown>)[key];
    if (isSafeIdentifier(candidate)) return candidate;
    pending.push(...Object.values(value));
  }
  return undefined;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}

function failureCategory(
  signals: readonly CodingDiagnosticFailureSignal[],
): CodingDiagnosticFailureCategory {
  const has = (...candidates: readonly CodingDiagnosticFailureSignal[]): boolean =>
    candidates.some((candidate) => signals.includes(candidate));
  if (has("cancelled")) return "cancelled";
  if (has("timeout")) return "timeout";
  if (has("lease")) return "lease_lost";
  if (has("eperm", "eacces")) return "permission_denied";
  if (has("enoent")) return "not_found";
  if (has("eexist")) return "already_exists";
  if (has("conflict")) return "conflict";
  if (has("invalid_argument", "path")) return "invalid_path";
  if (has("spawn", "process", "pipe")) return "process_failure";
  if (has("sqlite", "storage", "rpc")) return "storage_failure";
  if (has("tool")) return "tool_failure";
  if (has("provider")) return "provider_failure";
  return "unknown";
}
