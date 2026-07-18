import { resolve } from "node:path"
import type {
  ProductAppShellOptions
} from "@wanex/product-app"
import type {
  ProductAppTuiCliEnvironment
} from "./cli-types.js"

export function productAppTuiCliAppOptions(
  env: ProductAppTuiCliEnvironment
): ProductAppShellOptions {
  return {
    storage: {
      kind: "local-system-service",
      storeDir: env.WANEX_STORE_DIR ?? defaultStoreDir()
    },
    artifacts: {
      ...(env.WANEX_SYSTEM_SERVICE_BIN === undefined
        ? {}
        : { explicitPath: env.WANEX_SYSTEM_SERVICE_BIN })
    },
    providerProfile: {
      id: env.WANEX_PROVIDER_PROFILE_ID ?? "product-app-tui-cli",
      modelId: env.WANEX_PROVIDER_MODEL_ID ?? "product-app-tui-model"
    }
  }
}

function defaultStoreDir(): string {
  return resolve(process.cwd(), ".wanex-product-app-tui")
}
