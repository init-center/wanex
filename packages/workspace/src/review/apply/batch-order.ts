import type { JsonValue, PrincipalId } from "@wanex/protocol"
import type { ApplyProposalBatchItem } from "./types.js"

export interface PlannedBatchItem {
  readonly proposalId: string
  readonly dependsOn: readonly string[]
  readonly actorId?: PrincipalId
  readonly metadata?: JsonValue
}

export interface ProposalBatchPlan {
  readonly orderedItems: readonly PlannedBatchItem[]
}

export function planProposalBatch(
  items: readonly ApplyProposalBatchItem[]
): ProposalBatchPlan {
  if (items.length === 0) {
    throw new Error("proposal batch items must not be empty")
  }

  const byProposalId = new Map<string, PlannedBatchItem>()
  const originalIndex = new Map<string, number>()
  for (const [index, item] of items.entries()) {
    validateBatchItem(item)
    if (byProposalId.has(item.proposalId)) {
      throw new Error(`duplicate proposal batch item: ${item.proposalId}`)
    }
    const dependsOn = [...(item.dependsOn ?? [])]
    byProposalId.set(item.proposalId, {
      proposalId: item.proposalId,
      dependsOn,
      ...(item.actorId === undefined ? {} : { actorId: item.actorId }),
      ...(item.metadata === undefined ? {} : { metadata: item.metadata })
    })
    originalIndex.set(item.proposalId, index)
  }

  for (const item of byProposalId.values()) {
    const seenDependencies = new Set<string>()
    for (const dependencyId of item.dependsOn) {
      if (dependencyId.length === 0) {
        throw new Error(
          `proposal batch dependency id must not be empty: ${item.proposalId}`
        )
      }
      if (dependencyId === item.proposalId) {
        throw new Error(`proposal batch item depends on itself: ${item.proposalId}`)
      }
      if (seenDependencies.has(dependencyId)) {
        throw new Error(
          `duplicate proposal batch dependency: ${item.proposalId} -> ${dependencyId}`
        )
      }
      seenDependencies.add(dependencyId)
      if (!byProposalId.has(dependencyId)) {
        throw new Error(
          `proposal batch dependency not found: ${item.proposalId} -> ${dependencyId}`
        )
      }
    }
  }

  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const item of byProposalId.values()) {
    outgoing.set(item.proposalId, [])
    indegree.set(item.proposalId, 0)
  }
  for (const item of byProposalId.values()) {
    for (const dependencyId of item.dependsOn) {
      outgoing.get(dependencyId)?.push(item.proposalId)
      indegree.set(item.proposalId, (indegree.get(item.proposalId) ?? 0) + 1)
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([proposalId]) => proposalId)
    .sort((left, right) => compareByOriginalIndex(left, right, originalIndex))
  const orderedItems: PlannedBatchItem[] = []

  while (ready.length > 0) {
    const proposalId = ready.shift()
    if (proposalId === undefined) {
      break
    }
    const item = byProposalId.get(proposalId)
    if (item === undefined) {
      throw new Error(`proposal batch item disappeared: ${proposalId}`)
    }
    orderedItems.push(item)

    const dependents = outgoing.get(proposalId) ?? []
    dependents.sort((left, right) =>
      compareByOriginalIndex(left, right, originalIndex)
    )
    for (const dependentId of dependents) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(dependentId)
        ready.sort((left, right) =>
          compareByOriginalIndex(left, right, originalIndex)
        )
      }
    }
  }

  if (orderedItems.length !== items.length) {
    throw new Error("proposal batch dependency cycle detected")
  }

  return { orderedItems }
}

function validateBatchItem(item: ApplyProposalBatchItem): void {
  if (item.proposalId.length === 0) {
    throw new Error("proposal batch proposalId must not be empty")
  }
  if (item.actorId === "") {
    throw new Error("proposal batch actorId must not be empty")
  }
}

function compareByOriginalIndex(
  left: string,
  right: string,
  originalIndex: ReadonlyMap<string, number>
): number {
  return (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0)
}
