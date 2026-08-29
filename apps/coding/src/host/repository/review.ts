import { createHash } from "node:crypto"
import type {
  JsonValue,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeProposalOperationKind,
  WorkspaceChangeProposalOperationRecord,
  WorkspaceFileChange
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { WorkspaceRuntime } from "@wanex/workspace"
import {
  WorkspaceProposalApplyRuntime,
  WorkspaceProposalRuntime
} from "@wanex/workspace/review"
import { CodingHostError } from "../errors.js"
import type {
  CodingProposalActionReceipt,
  CodingProposalActionRequest,
  CodingProposalApplyReceipt,
  CodingProposalDecisionRequest,
  CodingProposalMutationOperation,
  CodingProposalSnapshot,
  CodingProposalUndoReceipt,
  UndoCodingProposalRequest
} from "../types.js"

const MAX_PROJECTED_FILES = 200
const MAX_FILE_PREVIEW_BYTES = 32 * 1024
const MAX_TOTAL_PREVIEW_BYTES = 256 * 1024
const MAX_REASON_BYTES = 1_024
const MAX_IDEMPOTENCY_KEY_BYTES = 512

export class CodingRepositoryReview {
  readonly #repositoryId: string
  readonly #workspaceId: string
  readonly #principalId: string
  readonly #storage: WorkspaceStore
  readonly #workspace: WorkspaceRuntime
  readonly #proposals: WorkspaceProposalRuntime
  readonly #apply: WorkspaceProposalApplyRuntime

  constructor(options: {
    readonly repositoryId: string
    readonly workspaceId: string
    readonly principalId: string
    readonly storage: WorkspaceStore
    readonly workspace: WorkspaceRuntime
  }) {
    this.#repositoryId = options.repositoryId
    this.#workspaceId = options.workspaceId
    this.#principalId = options.principalId
    this.#storage = options.storage
    this.#workspace = options.workspace
    this.#proposals = new WorkspaceProposalRuntime({
      storage: options.storage,
      workspaceId: options.workspaceId,
      principalId: options.principalId
    })
    this.#apply = new WorkspaceProposalApplyRuntime({
      storage: options.storage,
      workspace: options.workspace,
      actorId: options.principalId
    })
  }

  async getProposal(proposalId: string): Promise<CodingProposalSnapshot | null> {
    const history = await this.#proposals.getHistory(requireOpaqueId(proposalId))
    if (!this.owns(history)) return null
    return projectProposal(history)
  }

  async decideProposal(
    request: CodingProposalDecisionRequest
  ): Promise<CodingProposalActionReceipt> {
    const operation = request.decision === "approve"
      ? "approve"
      : request.decision === "reject"
        ? "reject"
        : "withdraw"
    return await this.recordAction(request, operation)
  }

  async requestApply(
    request: CodingProposalActionRequest
  ): Promise<CodingProposalActionReceipt> {
    return await this.recordAction(request, "request_apply")
  }

  async applyProposal(proposalId: string): Promise<CodingProposalApplyReceipt> {
    const history = await this.requireOwnedHistory(proposalId)
    const result = await this.#apply.applyProposal({
      proposalId: history.proposal.id,
      actorId: this.#principalId,
      metadata: { source: "coding", repositoryId: this.#repositoryId }
    })
    if (
      result.proposal.workspaceId !== this.#workspaceId ||
      result.changeSet.workspaceId !== this.#workspaceId
    ) {
      throw proposalUnavailable()
    }
    return {
      status: result.status,
      proposal: await this.requireSnapshot(proposalId),
      ...(result.workspaceOperation === undefined
        ? {}
        : { operation: projectMutationOperation(result.workspaceOperation) }),
      ...(result.error === undefined ? {} : { error: result.error })
    }
  }

  async undoProposal(
    request: UndoCodingProposalRequest
  ): Promise<CodingProposalUndoReceipt> {
    const history = await this.requireOwnedHistory(request.proposalId)
    const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey)
    const durableKey = codingActionKey(
      this.#repositoryId,
      history.proposal.id,
      "undo",
      idempotencyKey
    )
    const replay = await this.findUndoReplay(history.changeSet.id, durableKey)
    if (replay !== undefined) {
      return {
        status: replay.status,
        replayed: true,
        proposal: await this.requireSnapshot(request.proposalId),
        operation: projectMutationOperation(replay)
      }
    }
    const result = await this.#workspace.undoChangeSet({
      changeSetId: history.changeSet.id,
      mutation: {
        sourceKind: "host",
        sourceId: `coding-proposal:${history.proposal.id}`,
        idempotencyKey: durableKey,
        ownerId: this.#principalId
      }
    })
    return {
      status: result.receipt.status,
      replayed: false,
      proposal: await this.requireSnapshot(request.proposalId),
      operation: projectMutationOperation(result.operation)
    }
  }

  private async recordAction(
    request: CodingProposalActionRequest,
    operation: WorkspaceChangeProposalOperationKind
  ): Promise<CodingProposalActionReceipt> {
    const history = await this.requireOwnedHistory(request.proposalId)
    const reason = normalizeReason(request.reason)
    const idempotencyKey = normalizeIdempotencyKey(request.idempotencyKey)
    const operationId = reviewOperationId(
      this.#repositoryId,
      history.proposal.id,
      operation,
      idempotencyKey
    )
    let recorded: WorkspaceChangeProposalOperationRecord
    try {
      recorded = await this.invokeReviewOperation(operation, {
        proposalId: history.proposal.id,
        actorId: this.#principalId,
        operationId,
        reason
      })
    } catch (error) {
      const replay = await this.findReviewReplay(
        history.proposal.id,
        operationId,
        operation,
        reason
      )
      if (replay === undefined) throw error
      recorded = replay
    }
    return {
      action: operation,
      operationId: recorded.id,
      proposal: await this.requireSnapshot(history.proposal.id)
    }
  }

  private async invokeReviewOperation(
    operation: WorkspaceChangeProposalOperationKind,
    request: Parameters<WorkspaceProposalRuntime["approveProposal"]>[0]
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    if (operation === "approve") {
      return await this.#proposals.approveProposal(request)
    }
    if (operation === "reject") {
      return await this.#proposals.rejectProposal(request)
    }
    if (operation === "withdraw") {
      return await this.#proposals.withdrawProposal(request)
    }
    return await this.#proposals.requestApply(request)
  }

  private async findReviewReplay(
    proposalId: string,
    operationId: string,
    operation: WorkspaceChangeProposalOperationKind,
    reason: string
  ): Promise<WorkspaceChangeProposalOperationRecord | undefined> {
    const history = await this.requireOwnedHistory(proposalId)
    const replay = history.operations.find((candidate) => candidate.id === operationId)
    if (replay === undefined) return undefined
    if (
      replay.operation !== operation ||
      replay.actorId !== this.#principalId ||
      replay.reason !== reason
    ) {
      throw new Error("coding Proposal action identity was reused with different content")
    }
    return replay
  }

  private async findUndoReplay(
    changeSetId: string,
    idempotencyKey: string
  ): Promise<WorkspaceChangeOperationRecord | undefined> {
    const transactionId = `wtx_${createHash("sha256")
      .update(idempotencyKey, "utf8")
      .digest("hex")
      .slice(0, 40)}`
    const transaction = await this.#storage.getWorkspaceChangeTransaction({
      transactionId
    })
    if (
      transaction?.transaction.workspaceId !== this.#workspaceId ||
      transaction.transaction.changeSetId !== changeSetId ||
      transaction.transaction.operation !== "undo" ||
      transaction.transaction.idempotencyKey !== idempotencyKey ||
      transaction.transaction.state !== "applied" ||
      transaction.transaction.workspaceOperationId === undefined
    ) return undefined
    const operations = await this.#storage.listWorkspaceChangeOperations({ changeSetId })
    return operations.find((candidate) =>
      candidate.id === transaction.transaction.workspaceOperationId &&
      candidate.operation === "undo"
    )
  }

  private async requireSnapshot(proposalId: string): Promise<CodingProposalSnapshot> {
    const snapshot = await this.getProposal(proposalId)
    if (snapshot === null) throw proposalUnavailable()
    return snapshot
  }

  private async requireOwnedHistory(proposalId: string) {
    const history = await this.#proposals.getHistory(requireOpaqueId(proposalId))
    if (!this.owns(history)) throw proposalUnavailable()
    return history
  }

  private owns(
    history: Awaited<ReturnType<WorkspaceProposalRuntime["getHistory"]>>
  ): history is NonNullable<typeof history> & {
    readonly changeSet: NonNullable<NonNullable<typeof history>["changeSet"]>
  } {
    return history !== null &&
      history.changeSet !== null &&
      history.proposal.workspaceId === this.#workspaceId &&
      history.changeSet.workspaceId === this.#workspaceId &&
      history.proposal.changeSetId === history.changeSet.id
  }
}

function projectProposal(history: {
  readonly proposal: NonNullable<Awaited<ReturnType<WorkspaceProposalRuntime["getProposal"]>>>
  readonly changeSet: NonNullable<Awaited<ReturnType<WorkspaceStore["getWorkspaceChangeSet"]>>>
  readonly operations: readonly WorkspaceChangeProposalOperationRecord[]
}): CodingProposalSnapshot {
  let remainingBytes = MAX_TOTAL_PREVIEW_BYTES
  const sourceFiles = history.changeSet.changeSet.changes
  const files = sourceFiles.slice(0, MAX_PROJECTED_FILES).map((change) => {
    const projected = projectFile(change, remainingBytes)
    remainingBytes -= projected.previewBytes
    return projected.file
  })
  const metadata = recordValue(history.proposal.metadata)
  const operations = history.operations.slice(-16)
  return {
    proposalId: history.proposal.id,
    changeSetId: history.changeSet.id,
    state: history.proposal.state,
    changeSetState: history.changeSet.currentState,
    ...(history.proposal.title === undefined ? {} : { title: history.proposal.title }),
    ...(history.proposal.summary === undefined ? {} : { summary: history.proposal.summary }),
    incomplete: metadata?.incomplete === true,
    ...(metadata?.executionOutcome === "failed"
      ? { executionOutcome: "failed" as const }
      : {}),
    totalFileCount: sourceFiles.length,
    returnedFileCount: files.length,
    omittedFileCount: sourceFiles.length - files.length,
    files,
    totalOperationCount: history.operations.length,
    returnedOperationCount: operations.length,
    omittedOperationCount: history.operations.length - operations.length,
    operations: operations.map((operation) => ({
      operationId: operation.id,
      action: operation.operation,
      fromState: operation.fromState,
      toState: operation.toState,
      ...(operation.reason === undefined ? {} : { reason: operation.reason }),
      createdAt: operation.createdAt
    }))
  }
}

function projectFile(
  change: WorkspaceFileChange,
  remainingBytes: number
): {
  readonly file: CodingProposalSnapshot["files"][number]
  readonly previewBytes: number
} {
  const path = portableRelativePath(change.path)
  const before = projectText(change.baseText, change.baseSha256, remainingBytes)
  const after = projectText(
    change.targetText,
    undefined,
    Math.max(0, remainingBytes - before.previewBytes)
  )
  return {
    file: {
      path,
      kind: change.kind,
      ...(before.value === undefined ? {} : { before: before.value }),
      ...(after.value === undefined ? {} : { after: after.value })
    },
    previewBytes: before.previewBytes + after.previewBytes
  }
}

function projectText(
  text: string | undefined,
  knownSha256: string | undefined,
  remainingBytes: number
): {
  readonly value?: { readonly sha256: string; readonly text?: string; readonly truncated: boolean }
  readonly previewBytes: number
} {
  if (text === undefined && knownSha256 === undefined) return { previewBytes: 0 }
  const sha256 = knownSha256 ?? createHash("sha256").update(text!, "utf8").digest("hex")
  if (text === undefined) {
    return { value: { sha256, truncated: false }, previewBytes: 0 }
  }
  const limit = Math.min(MAX_FILE_PREVIEW_BYTES, remainingBytes)
  const preview = utf8Prefix(text, limit)
  return {
    value: {
      sha256,
      text: preview,
      truncated: preview !== text
    },
    previewBytes: Buffer.byteLength(preview, "utf8")
  }
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value
  let bytes = 0
  let result = ""
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8")
    if (bytes + size > maxBytes) break
    bytes += size
    result += character
  }
  return result
}

function projectMutationOperation(
  operation: WorkspaceChangeOperationRecord
): CodingProposalMutationOperation {
  const files = operation.receipt.files.slice(0, MAX_PROJECTED_FILES)
  const conflicts = operation.receipt.conflicts.slice(0, MAX_PROJECTED_FILES)
  return {
    operationId: operation.id,
    kind: operation.operation,
    status: operation.status,
    totalFileCount: operation.receipt.files.length,
    returnedFileCount: files.length,
    omittedFileCount: operation.receipt.files.length - files.length,
    files: files.map((file) => ({
      path: portableRelativePath(file.path),
      kind: file.kind,
      ...(file.beforeSha256 === undefined ? {} : { beforeSha256: file.beforeSha256 }),
      ...(file.afterSha256 === undefined ? {} : { afterSha256: file.afterSha256 })
    })),
    totalConflictCount: operation.receipt.conflicts.length,
    returnedConflictCount: conflicts.length,
    omittedConflictCount: operation.receipt.conflicts.length - conflicts.length,
    conflicts: conflicts.map((conflict) => ({
      path: portableRelativePath(conflict.path),
      reason: conflict.reason,
      ...(conflict.currentSha256 === undefined
        ? {}
        : { currentSha256: conflict.currentSha256 }),
      ...(conflict.expectedSha256 === undefined
        ? {}
        : { expectedSha256: conflict.expectedSha256 })
    }))
  }
}

function reviewOperationId(
  repositoryId: string,
  proposalId: string,
  operation: WorkspaceChangeProposalOperationKind,
  idempotencyKey: string
): string {
  return `wcpo_coding_${digest([repositoryId, proposalId, operation, idempotencyKey]).slice(0, 32)}`
}

function codingActionKey(
  repositoryId: string,
  proposalId: string,
  operation: string,
  idempotencyKey: string
): string {
  return `coding:${digest([repositoryId, proposalId, operation, idempotencyKey])}`
}

function digest(parts: readonly string[]): string {
  const hash = createHash("sha256")
  for (const part of parts) hash.update(part).update("\0")
  return hash.digest("hex")
}

function portableRelativePath(value: string): string {
  const path = value.replaceAll("\\", "/")
  const segments = path.split("/")
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//u.test(path) ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("coding Proposal contains an invalid relative path")
  }
  return path
}

function normalizeReason(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || Buffer.byteLength(normalized, "utf8") > MAX_REASON_BYTES) {
    throw new Error("coding Proposal reason must contain 1 to 1024 UTF-8 bytes")
  }
  return normalized
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > MAX_IDEMPOTENCY_KEY_BYTES
  ) {
    throw new Error("coding Proposal idempotency key must contain 1 to 512 UTF-8 bytes")
  }
  return normalized
}

function requireOpaqueId(value: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw proposalUnavailable()
  }
  return value
}

function recordValue(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
    : undefined
}

function proposalUnavailable(): CodingHostError {
  return new CodingHostError(
    "proposal_unavailable",
    "coding Proposal is unavailable in this repository"
  )
}
