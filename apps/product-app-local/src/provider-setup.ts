import type {
  ProductAppShell
} from "@wanex/product-app"
import type {
  ProductAppLocalConfigureProviderProfileResult,
  ProductAppLocalProviderSetupCommands
} from "./types.js"
import {
  normalizeProductAppLocalProviderProfile
} from "./provider-profiles.js"

export function createProductAppLocalProviderSetupCommands(
  productApp: ProductAppShell
): ProductAppLocalProviderSetupCommands {
  return {
    async configureProviderProfile(request) {
      const profile = await productApp.providerProfiles.upsertProviderProfile({
        profile: normalizeProductAppLocalProviderProfile(request),
        ...(request.makeActive === undefined
          ? {}
          : { makeActive: request.makeActive })
      })
      return projectProviderSetupResult({
        profile,
        readiness: (await productApp.readHome()).providerReadiness
      })
    }
  }
}

function projectProviderSetupResult(
  result: Omit<ProductAppLocalConfigureProviderProfileResult, "kind">
): ProductAppLocalConfigureProviderProfileResult {
  return {
    kind: "product-app-local.provider-setup.configured",
    profile: result.profile,
    readiness: result.readiness
  }
}
