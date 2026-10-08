import { createHash } from "node:crypto"
import { realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, sep } from "node:path"
import type { JsonValue, SessionTurnAdmissionCondition } from "@wanex/protocol"
import type { CoreStore, ConfigEntryRecord } from "@wanex/storage"
import type { RootIdentity, WorkspaceContext, WorkspaceFileEffect, WorkspaceRoot } from "./model.js"

export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex")
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

export function condition(key: string, entry: ConfigEntryRecord | null): SessionTurnAdmissionCondition {
  return { key, expectedRevision: entry?.revision ?? null, expectedValueDigest: entry === null ? null : digest(entry.value) }
}

export function contains(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`))
}

export function opaque(value: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(value)) throw new Error("workspace identifier is invalid")
  return value
}

export async function normalizeRoots(input: readonly WorkspaceRoot[]): Promise<readonly RootIdentity[]> {
  if (!Array.isArray(input) || input.length > 16) throw new Error("workspace supports at most 16 authority roots")
  const roots: RootIdentity[] = []
  const ids = new Set<string>()
  for (const root of [...input].sort((a, b) => a.id.localeCompare(b.id))) {
    opaque(root.id)
    if (ids.has(root.id)) throw new Error("workspace root IDs must be unique")
    ids.add(root.id)
    if (!isAbsolute(root.path) || root.path.includes("\0")) throw new Error("workspace authority path must be absolute")
    const path = await realpath(root.path)
    const metadata = await stat(path, { bigint: true })
    if (!metadata.isDirectory()) throw new Error("workspace authority root is not a directory")
    const effects = normalizeEffects(root.effects)
    const alias = roots.find((other) => other.path === path)
    if (alias !== undefined) {
      if (JSON.stringify(alias.effects) !== JSON.stringify(effects)) {
        throw new Error("workspace aliases must use identical effects")
      }
      continue
    }
    if (roots.some((other) => contains(other.path, path) || contains(path, other.path))) {
      throw new Error("workspace authority roots must be distinct and non-overlapping")
    }
    roots.push({ id: root.id, path, effects, device: String(metadata.dev), inode: String(metadata.ino) })
  }
  return roots.sort((a, b) => a.id.localeCompare(b.id))
}

export function authorityRoots(entry: ConfigEntryRecord): readonly RootIdentity[] {
  const value = entry.value as { roots?: readonly RootIdentity[] } | null
  if (value === null || !Array.isArray(value.roots) || value.roots.length > 16) throw new Error("workspace authority record is invalid")
  for (const root of value.roots) {
    opaque(root.id)
    if (typeof root.path !== "string" || !isAbsolute(root.path) || typeof root.device !== "string" || typeof root.inode !== "string" || !Array.isArray(root.effects)) {
      throw new Error("workspace authority identity is invalid")
    }
    normalizeEffects(root.effects)
  }
  return value.roots
}

function normalizeEffects(input: readonly WorkspaceFileEffect[] | undefined): readonly WorkspaceFileEffect[] {
  const effects: WorkspaceFileEffect[] = input === undefined ? ["read"] : [...input]
  const allowed = new Set<WorkspaceFileEffect>(["read", "write", "create", "remove"])
  if (effects.length === 0 || effects.length > 4 || effects.some((effect) => !allowed.has(effect)) || new Set(effects).size !== effects.length || !effects.includes("read")) {
    throw new Error("workspace root effects must include unique read/write/create/remove values")
  }
  const order: WorkspaceFileEffect[] = ["read", "write", "create", "remove"]
  return order.filter((effect) => effects.includes(effect))
}

export function selectedContext(value: JsonValue | null): WorkspaceContext {
  if (value === null) return { rootIds: [] }
  if (Array.isArray(value) || typeof value !== "object") throw new Error("workspace context record is invalid")
  const object = value as Record<string, JsonValue>
  if (
    Object.keys(value).some((key) => key !== "rootIds" && key !== "cwd") ||
    !Array.isArray(object.rootIds) || object.rootIds.length > 16 ||
    object.rootIds.some((id) => typeof id !== "string") ||
    new Set(object.rootIds).size !== object.rootIds.length ||
    (object.cwd !== undefined && (typeof object.cwd !== "string" || !isAbsolute(object.cwd)))) {
    throw new Error("workspace context record is invalid")
  }
  return value as unknown as WorkspaceContext
}

export async function putChecked(storage: CoreStore, key: string, value: JsonValue, expectedRevision: number | null, other: readonly { key: string; expectedRevision: number | null }[] = []): Promise<ConfigEntryRecord> {
  const result = await storage.compareAndApplyConfigMutations({
    conditions: [{ key, expectedRevision }, ...other], puts: [{ key, value }], deletes: []
  })
  if (result.kind !== "applied") throw new Error("workspace configuration revision conflict")
  const entry = result.entries.find((item) => item.key === key)
  if (entry === undefined) throw new Error("workspace config write returned no entry")
  return entry
}
