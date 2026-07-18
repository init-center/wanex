import {
  DEFAULT_APP_EXTENSION_SOURCE_ORDER
} from "./resolver-constants.js"
import {
  addContributionToBucket,
  contributionsFromBuckets,
  type ContributionBucket
} from "./resolver-conflicts.js"
import { domainView } from "./resolver-domain.js"
import {
  buildSourceRank,
  compareContributions,
  contributionKey,
  stableSortContributions
} from "./resolver-order.js"
import { validateContribution } from "./resolver-validation.js"
import type {
  AppExtensionContribution,
  AppExtensionDiagnostic,
  AppExtensionResolutionOptions,
  AppExtensionResolvedSnapshot
} from "./types.js"

export function resolveAppExtensionContributions(
  contributions: readonly AppExtensionContribution[],
  options: AppExtensionResolutionOptions = {}
): AppExtensionResolvedSnapshot {
  const sourceOrder = options.sourceOrder ?? DEFAULT_APP_EXTENSION_SOURCE_ORDER
  const sourceRank = buildSourceRank(sourceOrder)
  const buckets = new Map<string, ContributionBucket>()
  const diagnostics: AppExtensionDiagnostic[] = []

  for (const contribution of stableSortContributions(contributions, sourceRank)) {
    const validation = validateContribution(contribution, options)
    diagnostics.push(...validation.diagnostics)
    if (
      validation.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error"
      )
    ) {
      continue
    }

    const normalized = validation.contribution
    const key = contributionKey(normalized)
    const bucket = buckets.get(key) ?? { values: [] }
    buckets.set(
      key,
      addContributionToBucket({
        bucket,
        contribution: normalized,
        diagnostics
      })
    )
  }

  const resolved = contributionsFromBuckets(buckets.values()).sort((left, right) =>
    compareContributions(left, right, sourceRank)
  )

  diagnostics.push(
    ...resolved.flatMap((contribution) => contribution.diagnostics ?? [])
  )

  return {
    contributions: resolved,
    byDomain: {
      instruction: domainView(resolved, "instruction"),
      skill: domainView(resolved, "skill"),
      command: domainView(resolved, "command"),
      agent: domainView(resolved, "agent"),
      tool: domainView(resolved, "tool"),
      provider_catalog: domainView(resolved, "provider_catalog"),
      lifecycle_hook: domainView(resolved, "lifecycle_hook")
    },
    diagnostics
  }
}
