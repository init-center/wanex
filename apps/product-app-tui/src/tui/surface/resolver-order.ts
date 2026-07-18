import type {
  TuiContribution,
  TuiContributionSourceKind
} from "./types.js"

export function buildSourceRank(
  sourceOrder: readonly TuiContributionSourceKind[]
): ReadonlyMap<TuiContributionSourceKind, number> {
  return new Map(sourceOrder.map((source, index) => [source, index] as const))
}

export function stableSortContributions(
  contributions: readonly TuiContribution[],
  sourceRank: ReadonlyMap<TuiContributionSourceKind, number>
): TuiContribution[] {
  return contributions
    .map((contribution, index) => ({ contribution, index }))
    .sort(
      (left, right) =>
        compareContributions(left.contribution, right.contribution, sourceRank) ||
        left.index - right.index
    )
    .map((entry) => entry.contribution)
}

export function compareContributions(
  left: TuiContribution,
  right: TuiContribution,
  sourceRank: ReadonlyMap<TuiContributionSourceKind, number>
): number {
  return (
    rankSource(left, sourceRank) - rankSource(right, sourceRank) ||
    (left.priority ?? 0) - (right.priority ?? 0) ||
    (left.order ?? 0) - (right.order ?? 0) ||
    left.domain.localeCompare(right.domain) ||
    left.id.localeCompare(right.id) ||
    left.provenance.source.id.localeCompare(right.provenance.source.id)
  )
}

export function contributionKey(contribution: TuiContribution): string {
  return `${contribution.domain}:${contribution.id}`
}

function rankSource(
  contribution: TuiContribution,
  sourceRank: ReadonlyMap<TuiContributionSourceKind, number>
): number {
  return (
    sourceRank.get(contribution.provenance.source.kind) ??
    Number.MAX_SAFE_INTEGER
  )
}
