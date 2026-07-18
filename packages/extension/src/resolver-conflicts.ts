import { mergeContribution } from "./resolver-merge.js"
import type {
  AppExtensionContribution,
  AppExtensionDiagnostic
} from "./types.js"

export interface ContributionBucket {
  winner?: AppExtensionContribution
  values: AppExtensionContribution[]
}

export function addContributionToBucket(options: {
  readonly bucket: ContributionBucket
  readonly contribution: AppExtensionContribution
  readonly diagnostics: AppExtensionDiagnostic[]
}): ContributionBucket {
  const { bucket, contribution, diagnostics } = options
  bucket.values.push(contribution)
  const current = bucket.winner

  if (current === undefined) {
    bucket.winner = contribution
    return bucket
  }

  const policy = contribution.conflictPolicy ?? "replace"
  if (policy === "error" || current.conflictPolicy === "error") {
    diagnostics.push({
      code: "extension.duplicate_error",
      severity: "error",
      message: `duplicate contribution id ${contribution.id} for ${contribution.domain}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
    return bucket
  }

  if (policy === "append") {
    diagnostics.push({
      code: "extension.appended",
      severity: "info",
      message: `appended duplicate contribution id ${contribution.id} for ${contribution.domain}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
    return bucket
  }

  if (policy === "merge") {
    bucket.winner = mergeContribution(current, contribution)
    diagnostics.push({
      code: "extension.merged",
      severity: "info",
      message: `merged duplicate contribution id ${contribution.id} for ${contribution.domain}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
    return bucket
  }

  bucket.winner = contribution
  diagnostics.push({
    code: "extension.duplicate_replaced",
    severity: "warning",
    message: `replaced duplicate contribution id ${current.id} for ${current.domain}`,
    contributionId: current.id,
    domain: current.domain,
    sourceId: current.provenance.source.id,
    replacedBy: contribution.provenance.source.id
  })
  return bucket
}

export function contributionsFromBuckets(
  buckets: Iterable<ContributionBucket>
): AppExtensionContribution[] {
  return [...buckets].flatMap((bucket) => {
    const winner = bucket.winner
    if (winner === undefined) {
      return bucket.values.filter(
        (contribution) => contribution.conflictPolicy === "append"
      )
    }
    const appended = bucket.values.filter(
      (contribution) =>
        contribution !== winner && contribution.conflictPolicy === "append"
    )
    return [winner, ...appended]
  })
}
