import { TUI_CONTRIBUTION_DOMAINS } from "./resolver-constants.js"
import type {
  TuiContribution,
  TuiContributionDomain,
  TuiResolvedDomain
} from "./types.js"

export function isTuiContributionDomain(
  domain: string
): domain is TuiContributionDomain {
  return TUI_CONTRIBUTION_DOMAINS.includes(domain as TuiContributionDomain)
}

export function domainView<Domain extends TuiContributionDomain>(
  contributions: readonly TuiContribution[],
  domain: Domain
): TuiResolvedDomain<Extract<TuiContribution, { domain: Domain }>> {
  const all = contributions.filter(
    (contribution): contribution is Extract<TuiContribution, { domain: Domain }> =>
      contribution.domain === domain
  )
  return {
    all,
    byId: new Map(all.map((contribution) => [contribution.id, contribution]))
  }
}
