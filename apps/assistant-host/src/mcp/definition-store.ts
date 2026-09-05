import { createHash } from "node:crypto"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import { decodeLocalMcpServerEntry } from "./codec.js"
import { LOCAL_MCP_SERVER_PREFIX } from "./identity.js"
import type {
  LocalMcpFailureCategory,
  LocalMcpServerDefinition,
  LocalMcpServerStatus,
} from "./model.js"

export const MAX_LOCAL_MCP_SERVERS = 32

export interface LocalMcpDefinitionLoadResult {
  readonly fingerprint: string
  readonly definitions: readonly LocalMcpServerDefinition[]
  readonly failures: readonly LocalMcpServerStatus[]
}

export async function loadLocalMcpServerDefinitions(
  storage: Pick<CoreStore, "listConfigEntries">
): Promise<LocalMcpDefinitionLoadResult> {
  const entries = await storage.listConfigEntries({
    prefix: LOCAL_MCP_SERVER_PREFIX,
    limit: MAX_LOCAL_MCP_SERVERS + 1,
  })
  const selected = entries.slice(0, MAX_LOCAL_MCP_SERVERS)
  const definitions: LocalMcpServerDefinition[] = []
  const failures: LocalMcpServerStatus[] = []
  for (const entry of selected) {
    try {
      definitions.push(decodeLocalMcpServerEntry(entry))
    } catch {
      failures.push(invalidStatus(entry, "invalid_definition"))
    }
  }
  if (entries.length > MAX_LOCAL_MCP_SERVERS) {
    failures.push({
      state: "failed",
      toolCount: 0,
      failure: "server_limit_exceeded",
    })
  }
  return {
    fingerprint: definitionFingerprint(entries),
    definitions: Object.freeze(definitions),
    failures: Object.freeze(failures),
  }
}

function definitionFingerprint(entries: readonly ConfigEntryRecord[]): string {
  return createHash("sha256")
    .update(stableJson(entries.map((entry) => ({
      key: entry.key,
      revision: entry.revision,
      value: entry.value,
    }))))
    .digest("hex")
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`
}

function invalidStatus(
  entry: ConfigEntryRecord,
  failure: LocalMcpFailureCategory
): LocalMcpServerStatus {
  const suffix = entry.key.slice(LOCAL_MCP_SERVER_PREFIX.length)
  return {
    ...(suffix.length === 0 ? {} : { serverId: suffix }),
    state: "failed",
    toolCount: 0,
    failure,
  }
}
