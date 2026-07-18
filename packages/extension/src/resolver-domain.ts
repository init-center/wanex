import { APP_EXTENSION_DOMAINS } from "./resolver-constants.js"
import type {
  AppExtensionContribution,
  AppExtensionContributionDomain,
  AppExtensionResolvedDomain
} from "./types.js"

export function isAppExtensionContributionDomain(
  domain: string
): domain is AppExtensionContributionDomain {
  return APP_EXTENSION_DOMAINS.includes(
    domain as AppExtensionContributionDomain
  )
}

export function domainView<Domain extends AppExtensionContributionDomain>(
  contributions: readonly AppExtensionContribution[],
  domain: Domain
): AppExtensionResolvedDomain<Extract<AppExtensionContribution, { domain: Domain }>> {
  const all = contributions.filter(
    (contribution): contribution is Extract<AppExtensionContribution, { domain: Domain }> =>
      contribution.domain === domain
  )
  return {
    all,
    byId: new Map(all.map((contribution) => [contribution.id, contribution]))
  }
}
