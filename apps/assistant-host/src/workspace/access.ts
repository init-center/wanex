import { isAbsolute } from "node:path"
import type { JsonValue } from "@wanex/protocol"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import { digest, json, opaque } from "./store.js"
import type { RootIdentity, WorkspaceFileEffect } from "./model.js"

export type WorkspaceAccessScope = "turn" | "session"
export type WorkspaceAccessRequestState = "pending" | "approved" | "denied" | "cancelled" | "expired"
export type WorkspaceAccessGrantState = "active" | "revoked" | "expired"
export type WorkspaceAccessDecision = "approve" | "deny" | "cancel"

export interface WorkspaceAccessRequestRecord {
  readonly id: string
  readonly hostId: string
  readonly principalId: string
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId?: string
  readonly scope: WorkspaceAccessScope
  readonly root: RootIdentity
  readonly reason: string
  readonly idempotencyKey: string
  readonly state: WorkspaceAccessRequestState
  readonly decision?: WorkspaceAccessDecisionRecord
  readonly grantId?: string
  readonly expiresAt?: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly revision: number
}

export interface WorkspaceAccessDecisionRecord {
  readonly actorId: string
  readonly decision: WorkspaceAccessDecision
  readonly reason: string
  readonly idempotencyKey: string
  readonly decidedAt: number
}

export interface WorkspaceAccessGrantRecord {
  readonly id: string
  /** Present for grants approved from a model access request; absent for folders the user granted directly. */
  readonly requestId?: string
  readonly hostId: string
  readonly principalId: string
  readonly sessionId: string
  readonly turnId?: string
  readonly scope: WorkspaceAccessScope
  readonly root: RootIdentity
  readonly state: WorkspaceAccessGrantState
  readonly effects: readonly WorkspaceFileEffect[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly expiresAt?: number
  readonly revocation?: WorkspaceAccessRevocationRecord
  readonly revision: number
}

export interface WorkspaceAccessRevocationRecord {
  readonly actorId: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly revokedAt: number
}

export interface WorkspaceAccessStore {
  createRequest(input: CreateWorkspaceAccessRequestInput): Promise<WorkspaceAccessRequestRecord>
  getRequest(requestId: string): Promise<WorkspaceAccessRequestRecord | null>
  listRequests(input?: ListWorkspaceAccessRequestsInput): Promise<WorkspaceAccessRequestRecord[]>
  decideRequest(input: DecideWorkspaceAccessRequestInput): Promise<{
    readonly request: WorkspaceAccessRequestRecord
    readonly grant?: WorkspaceAccessGrantRecord
  }>
  getGrant(grantId: string): Promise<WorkspaceAccessGrantRecord | null>
  createUserGrant(input: CreateWorkspaceUserGrantInput): Promise<WorkspaceAccessGrantRecord>
  listGrants(input?: ListWorkspaceAccessGrantsInput): Promise<WorkspaceAccessGrantRecord[]>
  revokeGrant(input: RevokeWorkspaceAccessGrantInput): Promise<WorkspaceAccessGrantRecord>
  expire(now?: number): Promise<{ readonly requests: number; readonly grants: number }>
}

export interface CreateWorkspaceAccessRequestInput {
  readonly id: string
  readonly hostId: string
  readonly principalId: string
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId?: string
  readonly scope: WorkspaceAccessScope
  readonly root: RootIdentity
  readonly reason: string
  readonly idempotencyKey: string
  readonly expiresAt?: number
  readonly now?: number
}

/** A folder the user granted to one conversation from a trusted Host picker. */
export interface CreateWorkspaceUserGrantInput {
  readonly sessionId: string
  readonly actorId: string
  readonly root: RootIdentity
  readonly idempotencyKey: string
  readonly now?: number
}

export interface ListWorkspaceAccessRequestsInput {
  readonly sessionId?: string
  readonly state?: WorkspaceAccessRequestState
  readonly limit?: number
}

export interface DecideWorkspaceAccessRequestInput {
  readonly requestId: string
  readonly expectedRevision: number
  readonly actorId: string
  readonly decision: WorkspaceAccessDecision
  readonly reason: string
  readonly idempotencyKey: string
  readonly now?: number
}

export interface ListWorkspaceAccessGrantsInput {
  readonly sessionId?: string
  readonly state?: WorkspaceAccessGrantState
  readonly limit?: number
}

export interface RevokeWorkspaceAccessGrantInput {
  readonly grantId: string
  readonly expectedRevision: number
  readonly actorId: string
  readonly reason: string
  readonly idempotencyKey: string
  readonly now?: number
}

const MAX_LIST = 200
const MAX_REASON_BYTES = 4_096
const MAX_IDEMPOTENCY_BYTES = 512

export function createWorkspaceAccessStore(coreStore: CoreStore, options: { readonly hostId: string }): WorkspaceAccessStore {
  const hostId = opaque(options.hostId)
  const prefix = `assistant.workspace.${hostId}.access.`
  const requestPrefix = `${prefix}request.`
  const grantPrefix = `${prefix}grant.`
  const requestIdempotencyPrefix = `${prefix}request-idempotency.`

  const requestKey = (id: string) => `${requestPrefix}${digest(opaque(id))}`
  const grantKey = (id: string) => `${grantPrefix}${digest(opaque(id))}`
  const requestIdempotencyKey = (sessionId: string, idempotencyKey: string) =>
    `${requestIdempotencyPrefix}${digest(`${opaque(sessionId)}\0${boundedString(idempotencyKey, "idempotency key", MAX_IDEMPOTENCY_BYTES)}`)}`

  async function readRequestByEntry(entry: ConfigEntryRecord, expectedKey?: string): Promise<WorkspaceAccessRequestRecord> {
    if (expectedKey !== undefined && entry.key !== expectedKey) throw new Error("workspace access request key mismatch")
    try {
      const request = parseRequest(entry.value, entry.revision)
      if (request.hostId !== hostId) throw new Error("workspace access request Host mismatch")
      return request
    } catch (error) {
      throw new Error(`workspace access request is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function readGrantByEntry(entry: ConfigEntryRecord, expectedKey?: string): Promise<WorkspaceAccessGrantRecord> {
    if (expectedKey !== undefined && entry.key !== expectedKey) throw new Error("workspace access grant key mismatch")
    try {
      const grant = parseGrant(entry.value, entry.revision)
      if (grant.hostId !== hostId) throw new Error("workspace access grant Host mismatch")
      return grant
    } catch (error) {
      throw new Error(`workspace access grant is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function getRequest(requestId: string): Promise<WorkspaceAccessRequestRecord | null> {
    const id = opaque(requestId)
    const key = requestKey(id)
    const entry = await coreStore.getConfigEntry(key)
    return entry === null ? null : await readRequestByEntry(entry, key)
  }

  async function getGrant(grantId: string): Promise<WorkspaceAccessGrantRecord | null> {
    const id = opaque(grantId)
    const key = grantKey(id)
    const entry = await coreStore.getConfigEntry(key)
    return entry === null ? null : await readGrantByEntry(entry, key)
  }

  async function createRequest(input: CreateWorkspaceAccessRequestInput): Promise<WorkspaceAccessRequestRecord> {
    const id = opaque(input.id)
    const request = normalizeCreateInput({ ...input, id, hostId })
    const key = requestKey(id)
    const idempotencyKey = requestIdempotencyKey(request.sessionId, request.idempotencyKey)
    const existingIndex = await coreStore.getConfigEntry(idempotencyKey)
    if (existingIndex !== null) {
      const indexedId = parseRequestIndex(existingIndex.value)
      const existing = await getRequest(indexedId)
      if (existing === null) throw new Error("workspace access request idempotency index is dangling")
      assertSameRequest(existing, request)
      return existing
    }
    const existingRequest = await coreStore.getConfigEntry(key)
    if (existingRequest !== null) throw new Error("workspace access request already exists")

    const result = await coreStore.compareAndApplyConfigMutations({
      conditions: [
        { key, expectedRevision: null },
        { key: idempotencyKey, expectedRevision: null }
      ],
      puts: [
        { key, value: json(request) },
        { key: idempotencyKey, value: json({ requestId: id }) }
      ],
      deletes: []
    })
    if (result.kind === "conflict") {
      const winner = await coreStore.getConfigEntry(idempotencyKey)
      if (winner !== null) {
        const winnerId = parseRequestIndex(winner.value)
        const existing = await getRequest(winnerId)
        if (existing === null) throw new Error("workspace access request idempotency index is dangling")
        assertSameRequest(existing, request)
        return existing
      }
      throw new Error("workspace access request creation conflicted")
    }
    const saved = result.entries.find((entry) => entry.key === key)
    if (saved === undefined) throw new Error("workspace access request write returned no record")
    return await readRequestByEntry(saved, key)
  }

  async function listRequests(input: ListWorkspaceAccessRequestsInput = {}): Promise<WorkspaceAccessRequestRecord[]> {
    const entries = await coreStore.listConfigEntries({ prefix: requestPrefix, limit: boundedLimit(input.limit) })
    return (await Promise.all(entries.map((entry) => readRequestByEntry(entry)))).filter((request) =>
      (input.sessionId === undefined || request.sessionId === opaque(input.sessionId)) &&
      (input.state === undefined || request.state === input.state)
    )
  }

  async function decideRequest(input: DecideWorkspaceAccessRequestInput): Promise<{
    readonly request: WorkspaceAccessRequestRecord
    readonly grant?: WorkspaceAccessGrantRecord
  }> {
    const requestId = opaque(input.requestId)
    const actorId = opaque(input.actorId)
    const decision = normalizeDecision(input)
    const key = requestKey(requestId)
    const currentEntry = await coreStore.getConfigEntry(key)
    if (currentEntry === null) throw new Error("workspace access request is missing")
    const current = await readRequestByEntry(currentEntry, key)
    if (current.state !== "pending") {
      if (current.decision !== undefined && sameDecision(current.decision, decision)) {
        return { request: current, ...(current.grantId === undefined ? {} : { grant: await requireGrant(current.grantId) }) }
      }
      throw new Error("workspace access request is already decided")
    }
    if (current.revision !== input.expectedRevision) throw new Error("workspace access request revision conflict")
    const now = timestamp(input.now)
    const nextState: WorkspaceAccessRequestState = decision.decision === "approve" ? "approved" : decision.decision === "deny" ? "denied" : "cancelled"
    const grantId = decision.decision === "approve" ? `wgrant_${digest(requestId).slice(0, 48)}` : undefined
    const nextRequest = {
      ...current,
      state: nextState,
      ...(grantId === undefined ? {} : { grantId }),
      decision,
      updatedAt: now
    }
    const puts: { readonly key: string; readonly value: JsonValue }[] = [{ key, value: json(stripRevision(nextRequest)) }]
    if (grantId !== undefined) {
      const existingGrant = await coreStore.getConfigEntry(grantKey(grantId))
      if (existingGrant !== null) throw new Error("workspace access grant already exists for request")
      puts.push({
        key: grantKey(grantId),
        value: json({
          id: grantId,
          requestId: current.id,
          hostId: current.hostId,
          principalId: current.principalId,
          sessionId: current.sessionId,
          ...(current.scope === "turn" ? { turnId: current.turnId } : {}),
          scope: current.scope,
          root: current.root,
          state: "active",
          effects: current.root.effects,
          createdAt: now,
          updatedAt: now,
          ...(current.expiresAt === undefined ? {} : { expiresAt: current.expiresAt })
        })
      })
    }
    const result = await coreStore.compareAndApplyConfigMutations({
      conditions: [
        { key, expectedRevision: current.revision },
        ...(grantId === undefined ? [] : [{ key: grantKey(grantId), expectedRevision: null }])
      ],
      puts,
      deletes: []
    })
    if (result.kind === "conflict") throw new Error("workspace access request decision conflicted")
    const savedRequest = result.entries.find((entry) => entry.key === key)
    if (savedRequest === undefined) throw new Error("workspace access request decision returned no request")
    const request = await readRequestByEntry(savedRequest, key)
    return { request, ...(grantId === undefined ? {} : { grant: await requireGrant(grantId) }) }
  }

  async function createUserGrant(input: CreateWorkspaceUserGrantInput): Promise<WorkspaceAccessGrantRecord> {
    const sessionId = opaque(input.sessionId)
    const actorId = opaque(input.actorId)
    const root = normalizeRoot(input.root)
    const idempotency = boundedString(input.idempotencyKey, "idempotency key", MAX_IDEMPOTENCY_BYTES)
    const grantId = `wgrant_${digest({ kind: "user", hostId, sessionId, idempotency }).slice(0, 48)}`
    const key = grantKey(grantId)
    const existing = await coreStore.getConfigEntry(key)
    if (existing !== null) {
      const current = await readGrantByEntry(existing, key)
      if (current.requestId !== undefined || current.sessionId !== sessionId || JSON.stringify(current.root) !== JSON.stringify(root)) {
        throw new Error("workspace grant idempotency key was reused with different input")
      }
      return current
    }
    const now = timestamp(input.now ?? Date.now())
    const grant = {
      id: grantId, hostId, principalId: actorId, sessionId, scope: "session",
      root, state: "active", effects: root.effects, createdAt: now, updatedAt: now
    }
    const result = await coreStore.compareAndApplyConfigMutations({
      conditions: [{ key, expectedRevision: null }],
      puts: [{ key, value: json(grant) }],
      deletes: []
    })
    if (result.kind === "conflict") {
      const winner = await getGrant(grantId)
      if (winner === null) throw new Error("workspace user grant creation conflicted")
      return winner
    }
    const saved = result.entries.find((entry) => entry.key === key)
    if (saved === undefined) throw new Error("workspace user grant write returned no record")
    return await readGrantByEntry(saved, key)
  }

  async function listGrants(input: ListWorkspaceAccessGrantsInput = {}): Promise<WorkspaceAccessGrantRecord[]> {
    const entries = await coreStore.listConfigEntries({ prefix: grantPrefix, limit: boundedLimit(input.limit) })
    return (await Promise.all(entries.map((entry) => readGrantByEntry(entry)))).filter((grant) =>
      (input.sessionId === undefined || grant.sessionId === opaque(input.sessionId)) &&
      (input.state === undefined || grant.state === input.state)
    )
  }

  async function revokeGrant(input: RevokeWorkspaceAccessGrantInput): Promise<WorkspaceAccessGrantRecord> {
    const grantId = opaque(input.grantId)
    const actorId = opaque(input.actorId)
    const key = grantKey(grantId)
    const entry = await coreStore.getConfigEntry(key)
    if (entry === null) throw new Error("workspace access grant is missing")
    const current = await readGrantByEntry(entry, key)
    const idempotencyKey = boundedString(input.idempotencyKey, "idempotency key", MAX_IDEMPOTENCY_BYTES)
    if (current.state === "revoked" && current.revocation !== undefined && current.revocation.idempotencyKey === idempotencyKey && current.revocation.actorId === actorId) return current
    if (current.revision !== input.expectedRevision) throw new Error("workspace access grant revision conflict")
    if (current.state !== "active") throw new Error(`workspace access grant is already ${current.state}`)
    const now = timestamp(input.now)
    const next = {
      ...current,
      state: "revoked" as const,
      updatedAt: now,
      revocation: { actorId, reason: boundedString(input.reason, "revocation reason", MAX_REASON_BYTES), idempotencyKey, revokedAt: now }
    }
    const result = await coreStore.compareAndApplyConfigMutations({
      conditions: [{ key, expectedRevision: current.revision }],
      puts: [{ key, value: json(stripRevision(next)) }],
      deletes: []
    })
    if (result.kind === "conflict") throw new Error("workspace access grant revocation conflicted")
    const saved = result.entries.find((item) => item.key === key)
    if (saved === undefined) throw new Error("workspace access grant revocation returned no grant")
    return await readGrantByEntry(saved, key)
  }

  async function expire(nowInput = Date.now()): Promise<{ readonly requests: number; readonly grants: number }> {
    const now = timestamp(nowInput)
    let requests = 0
    let grants = 0
    for (const request of await listRequests({ state: "pending", limit: MAX_LIST })) {
      if (request.expiresAt === undefined || request.expiresAt > now) continue
      const result = await coreStore.compareAndApplyConfigMutations({
        conditions: [{ key: requestKey(request.id), expectedRevision: request.revision }],
        puts: [{ key: requestKey(request.id), value: json(stripRevision({ ...request, state: "expired", updatedAt: now })) }],
        deletes: []
      })
      if (result.kind === "applied") requests += 1
    }
    for (const grant of await listGrants({ state: "active", limit: MAX_LIST })) {
      if (grant.expiresAt === undefined || grant.expiresAt > now) continue
      const result = await coreStore.compareAndApplyConfigMutations({
        conditions: [{ key: grantKey(grant.id), expectedRevision: grant.revision }],
        puts: [{ key: grantKey(grant.id), value: json(stripRevision({ ...grant, state: "expired", updatedAt: now })) }],
        deletes: []
      })
      if (result.kind === "applied") grants += 1
    }
    return { requests, grants }
  }

  async function requireGrant(grantId: string): Promise<WorkspaceAccessGrantRecord> {
    const grant = await getGrant(grantId)
    if (grant === null) throw new Error("workspace access grant is missing")
    return grant
  }

  return { createRequest, getRequest, listRequests, decideRequest, getGrant, createUserGrant, listGrants, revokeGrant, expire }
}

function normalizeCreateInput(input: CreateWorkspaceAccessRequestInput & { readonly hostId: string }): Omit<WorkspaceAccessRequestRecord, "revision"> {
  const principalId = opaque(input.principalId)
  const sessionId = opaque(input.sessionId)
  const turnId = opaque(input.turnId)
  const root = normalizeRoot(input.root)
  const now = timestamp(input.now)
  const expiresAt = input.expiresAt === undefined ? undefined : futureTimestamp(input.expiresAt, now)
  return {
    id: opaque(input.id), hostId: opaque(input.hostId), principalId, sessionId, turnId,
    ...(input.attemptId === undefined ? {} : { attemptId: opaque(input.attemptId) }),
    scope: normalizeScope(input.scope), root,
    reason: boundedString(input.reason, "request reason", MAX_REASON_BYTES),
    idempotencyKey: boundedString(input.idempotencyKey, "idempotency key", MAX_IDEMPOTENCY_BYTES),
    state: "pending", ...(expiresAt === undefined ? {} : { expiresAt }), createdAt: now, updatedAt: now
  }
}

function normalizeDecision(input: DecideWorkspaceAccessRequestInput): WorkspaceAccessDecisionRecord {
  const now = timestamp(input.now)
  if (!(["approve", "deny", "cancel"] as const).includes(input.decision)) throw new Error("workspace access decision is invalid")
  return {
    actorId: opaque(input.actorId), decision: input.decision,
    reason: boundedString(input.reason, "decision reason", MAX_REASON_BYTES),
    idempotencyKey: boundedString(input.idempotencyKey, "idempotency key", MAX_IDEMPOTENCY_BYTES), decidedAt: now
  }
}

function normalizeRoot(root: RootIdentity): RootIdentity {
  if (!isPlainObject(root) || !isAbsolute(root.path) || root.path.includes("\0") || typeof root.device !== "string" || root.device.length === 0 || typeof root.inode !== "string" || root.inode.length === 0) {
    throw new Error("workspace access root identity is invalid")
  }
  const effects = normalizeEffects(root.effects)
  return { id: opaque(root.id), path: root.path, effects, device: root.device, inode: root.inode }
}

function normalizeEffects(input: readonly WorkspaceFileEffect[]): readonly WorkspaceFileEffect[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 4) throw new Error("workspace access effects are invalid")
  const allowed = new Set<WorkspaceFileEffect>(["read", "write", "create", "remove"])
  if (input.some((effect) => !allowed.has(effect)) || new Set(input).size !== input.length || !input.includes("read")) throw new Error("workspace access effects must include read")
  return (["read", "write", "create", "remove"] as const).filter((effect) => input.includes(effect))
}

function parseRequest(value: JsonValue, revision: number): WorkspaceAccessRequestRecord {
  const object = record(value, "workspace access request")
  const request = {
    id: opaque(string(object.id, "request id")), hostId: opaque(string(object.hostId, "host id")), principalId: opaque(string(object.principalId, "principal id")),
    sessionId: opaque(string(object.sessionId, "session id")), turnId: opaque(string(object.turnId, "turn id")),
    ...(object.attemptId === undefined ? {} : { attemptId: opaque(string(object.attemptId, "attempt id")) }),
    scope: normalizeScope(object.scope), root: normalizeRoot(object.root as unknown as RootIdentity),
    reason: boundedString(string(object.reason, "request reason"), "request reason", MAX_REASON_BYTES),
    idempotencyKey: boundedString(string(object.idempotencyKey, "idempotency key"), "idempotency key", MAX_IDEMPOTENCY_BYTES),
    state: normalizeRequestState(object.state),
    ...(object.decision === undefined ? {} : { decision: parseDecision(object.decision) }),
    ...(object.grantId === undefined ? {} : { grantId: opaque(string(object.grantId, "grant id")) }),
    ...(object.expiresAt === undefined ? {} : { expiresAt: timestamp(object.expiresAt) }),
    createdAt: timestamp(object.createdAt), updatedAt: timestamp(object.updatedAt), revision
  }
  if (request.state === "pending" && request.decision !== undefined) throw new Error("workspace access request decision state is invalid")
  if ((request.state === "approved" || request.state === "denied" || request.state === "cancelled") && request.decision === undefined) throw new Error("workspace access request decision is missing")
  if (request.state === "approved" && request.grantId === undefined) throw new Error("approved workspace access request has no grant")
  return request
}

function parseGrant(value: JsonValue, revision: number): WorkspaceAccessGrantRecord {
  const object = record(value, "workspace access grant")
  return {
    id: opaque(string(object.id, "grant id")),
    ...(object.requestId === undefined ? {} : { requestId: opaque(string(object.requestId, "request id")) }),
    hostId: opaque(string(object.hostId, "host id")), principalId: opaque(string(object.principalId, "principal id")), sessionId: opaque(string(object.sessionId, "session id")),
    ...(object.turnId === undefined ? {} : { turnId: opaque(string(object.turnId, "turn id")) }),
    scope: normalizeScope(object.scope), root: normalizeRoot(object.root as unknown as RootIdentity), state: normalizeGrantState(object.state), effects: normalizeEffects(object.effects as unknown as WorkspaceFileEffect[]),
    createdAt: timestamp(object.createdAt), updatedAt: timestamp(object.updatedAt),
    ...(object.expiresAt === undefined ? {} : { expiresAt: timestamp(object.expiresAt) }),
    ...(object.revocation === undefined ? {} : { revocation: parseRevocation(object.revocation) }), revision
  }
}

function parseDecision(value: JsonValue): WorkspaceAccessDecisionRecord {
  const object = record(value, "workspace access decision")
  return { actorId: opaque(string(object.actorId, "decision actor")), decision: normalizeDecisionKind(object.decision), reason: boundedString(string(object.reason, "decision reason"), "decision reason", MAX_REASON_BYTES), idempotencyKey: boundedString(string(object.idempotencyKey, "idempotency key"), "idempotency key", MAX_IDEMPOTENCY_BYTES), decidedAt: timestamp(object.decidedAt) }
}

function parseRevocation(value: JsonValue): WorkspaceAccessRevocationRecord {
  const object = record(value, "workspace access revocation")
  return { actorId: opaque(string(object.actorId, "revocation actor")), reason: boundedString(string(object.reason, "revocation reason"), "revocation reason", MAX_REASON_BYTES), idempotencyKey: boundedString(string(object.idempotencyKey, "idempotency key"), "idempotency key", MAX_IDEMPOTENCY_BYTES), revokedAt: timestamp(object.revokedAt) }
}

function parseRequestIndex(value: JsonValue): string {
  const object = record(value, "workspace access request index")
  return opaque(string(object.requestId, "request index id"))
}

function assertSameRequest(existing: WorkspaceAccessRequestRecord, requested: Omit<WorkspaceAccessRequestRecord, "revision">): void {
  const current = stripRequestTimestamps(existing)
  const next = stripRequestTimestamps(requested)
  if (JSON.stringify(current) !== JSON.stringify(next)) throw new Error("workspace access idempotency key was reused with different input")
}

function stripRequestTimestamps(value: unknown): JsonValue {
  if (!isPlainObject(value)) throw new Error("workspace access request is invalid")
  const { revision: _revision, createdAt: _createdAt, updatedAt: _updatedAt, ...immutable } = value
  return json(immutable)
}

function stripRevision(value: unknown): JsonValue {
  if (!isPlainObject(value)) throw new Error("workspace access record is invalid")
  const { revision: _revision, ...withoutRevision } = value
  return json(withoutRevision)
}

function sameDecision(left: WorkspaceAccessDecisionRecord, right: WorkspaceAccessDecisionRecord): boolean {
  return left.actorId === right.actorId && left.decision === right.decision && left.idempotencyKey === right.idempotencyKey
}

function record(value: JsonValue, label: string): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} is invalid`)
  return value as Record<string, JsonValue>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function string(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`)
  return value
}

function boundedString(value: string, label: string, maxBytes: number): string {
  if (Buffer.byteLength(value) === 0 || Buffer.byteLength(value) > maxBytes || value.includes("\0")) throw new Error(`${label} is invalid`)
  return value
}

function timestamp(value: JsonValue | undefined): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("workspace access timestamp is invalid")
  return value
}

function futureTimestamp(value: number, now: number): number {
  const timestampValue = timestamp(value)
  if (timestampValue <= now) throw new Error("workspace access expiration must be in the future")
  return timestampValue
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return MAX_LIST
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIST) throw new Error("workspace access list limit is invalid")
  return value
}

function normalizeScope(value: JsonValue | undefined): WorkspaceAccessScope {
  if (value !== "turn" && value !== "session") throw new Error("workspace access scope is invalid")
  return value
}

function normalizeRequestState(value: JsonValue | undefined): WorkspaceAccessRequestState {
  if (value !== "pending" && value !== "approved" && value !== "denied" && value !== "cancelled" && value !== "expired") throw new Error("workspace access request state is invalid")
  return value
}

function normalizeGrantState(value: JsonValue | undefined): WorkspaceAccessGrantState {
  if (value !== "active" && value !== "revoked" && value !== "expired") throw new Error("workspace access grant state is invalid")
  return value
}

function normalizeDecisionKind(value: JsonValue | undefined): WorkspaceAccessDecision {
  if (value !== "approve" && value !== "deny" && value !== "cancel") throw new Error("workspace access decision is invalid")
  return value
}
