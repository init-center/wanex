import {
  projectProductAppLocalCliStartupSummary,
  type ProductAppLocalCliJsonStartupSummary
} from "./cli-summary.js"
import type {
  ProductAppLocalCliOptions
} from "./cli-options.js"
import type {
  ProductAppLocalConfigureProviderProfileResult,
  ProductAppLocalWebApp
} from "./types.js"

export interface ProductAppLocalCliProviderSetupInput {
  readonly app: ProductAppLocalWebApp
  readonly options: ProductAppLocalCliOptions
}

export interface ProductAppLocalCliProviderSetupResult {
  readonly kind: "product-app-local.cli.provider-setup-result"
  readonly ok: boolean
  readonly configuredProfiles: readonly ProductAppLocalConfigureProviderProfileResult[]
  readonly startup: ProductAppLocalCliJsonStartupSummary
}

export async function runProductAppLocalCliProviderSetup(
  input: ProductAppLocalCliProviderSetupInput
): Promise<ProductAppLocalCliProviderSetupResult> {
  const configuredProfiles: ProductAppLocalConfigureProviderProfileResult[] = []
  for (const profile of input.options.providerProfiles.profiles) {
    configuredProfiles.push(
      await input.app.providerSetup.configureProviderProfile({
        ...profile,
        makeActive:
          input.options.providerProfiles.activeProfileId === profile.id
      })
    )
  }
  const snapshot = await input.app.readSnapshot()
  return {
    kind: "product-app-local.cli.provider-setup-result",
    ok: configuredProfiles.length > 0 && snapshot.web.view.settings.profile.readiness.canRun,
    configuredProfiles,
    startup: projectProductAppLocalCliStartupSummary({
      options: input.options,
      snapshot
    })
  }
}

export function formatProductAppLocalCliProviderSetupResult(
  result: ProductAppLocalCliProviderSetupResult
): string {
  return JSON.stringify(result)
}
