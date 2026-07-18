import {
  DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER
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
  TuiContribution,
  TuiContributionDiagnostic,
  TuiContributionResolutionOptions,
  TuiResolvedSnapshot
} from "./types.js"

export function resolveTuiContributions(
  contributions: readonly TuiContribution[],
  options: TuiContributionResolutionOptions = {}
): TuiResolvedSnapshot {
  const sourceOrder = options.sourceOrder ?? DEFAULT_TUI_CONTRIBUTION_SOURCE_ORDER
  const sourceRank = buildSourceRank(sourceOrder)
  const buckets = new Map<string, ContributionBucket>()
  const diagnostics: TuiContributionDiagnostic[] = []

  for (const contribution of stableSortContributions(contributions, sourceRank)) {
    const validation = validateContribution(contribution, options)
    diagnostics.push(...validation)
    if (validation.some((diagnostic) => diagnostic.severity === "error")) {
      continue
    }

    const key = contributionKey(contribution)
    const bucket = buckets.get(key) ?? { values: [] }
    buckets.set(
      key,
      addContributionToBucket({
        bucket,
        contribution,
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
      command_palette: domainView(resolved, "command_palette"),
      keybinding: domainView(resolved, "keybinding"),
      panel: domainView(resolved, "panel"),
      status_item: domainView(resolved, "status_item"),
      prompt_decoration: domainView(resolved, "prompt_decoration"),
      theme: domainView(resolved, "theme"),
      notification: domainView(resolved, "notification")
    },
    diagnostics
  }
}
