import type {
  ProductAppDensityPreference,
  ProductAppInitialState,
  ProductAppLayout,
  ProductAppMode,
  ProductAppStateSnapshot,
  ProductAppStateStore,
  ProductAppStateStoreLoadResult,
  ProductAppThemePreference
} from "@wanex/product-app"
import type { JsonValue } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export const PRODUCT_APP_STATE_CONFIG_KEY = "product-app.state.v1" as const

export interface CreateStorageProductAppStateStoreOptions {
  readonly storage: Pick<CoreStore, "getConfig" | "putConfig">
  readonly key?: string
}

const layouts: readonly ProductAppLayout[] = [
  "single",
  "split",
  "diagnostics"
]
const modes: readonly ProductAppMode[] = [
  "chat",
  "workbench",
  "diagnostics"
]
const themes: readonly ProductAppThemePreference[] = [
  "system",
  "light",
  "dark"
]
const densities: readonly ProductAppDensityPreference[] = [
  "comfortable",
  "compact"
]

export function createStorageProductAppStateStore(
  options: CreateStorageProductAppStateStoreOptions
): ProductAppStateStore {
  const key = options.key ?? PRODUCT_APP_STATE_CONFIG_KEY
  return {
    async load(): Promise<ProductAppStateStoreLoadResult> {
      const value = await options.storage.getConfig(key)
      if (value === null) {
        return { found: false }
      }
      return {
        found: true,
        state: persistedStateFromJson(value)
      }
    },
    async save(state): Promise<void> {
      await options.storage.putConfig(key, persistedStateToJson(state))
    }
  }
}

function persistedStateToJson(state: ProductAppStateSnapshot): JsonValue {
  return {
    ...(state.selectedSessionId === undefined
      ? {}
      : { selectedSessionId: state.selectedSessionId }),
    layout: state.layout,
    mode: state.mode,
    preferences: {
      theme: state.preferences.theme,
      density: state.preferences.density
    }
  }
}

function persistedStateFromJson(value: JsonValue): ProductAppInitialState {
  if (!isRecord(value)) {
    throw new Error("product app persisted state must be an object")
  }
  const selectedSessionId = optionalNonEmptyString(
    value.selectedSessionId,
    "selectedSessionId"
  )
  const layout = optionalEnum(value.layout, layouts, "layout")
  const mode = optionalEnum(value.mode, modes, "mode")
  const preferences = persistedPreferencesFromJson(value.preferences)

  return {
    ...(selectedSessionId === undefined ? {} : { selectedSessionId }),
    ...(layout === undefined ? {} : { layout }),
    ...(mode === undefined ? {} : { mode }),
    ...(preferences === undefined ? {} : { preferences })
  }
}

function persistedPreferencesFromJson(
  value: JsonValue | undefined
): ProductAppInitialState["preferences"] | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (!isRecord(value)) {
    throw new Error("product app persisted preferences must be an object")
  }
  const theme = optionalEnum(value.theme, themes, "preferences.theme")
  const density = optionalEnum(
    value.density,
    densities,
    "preferences.density"
  )
  return {
    ...(theme === undefined ? {} : { theme }),
    ...(density === undefined ? {} : { density })
  }
}

function optionalNonEmptyString(
  value: JsonValue | undefined,
  field: string
): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`product app persisted ${field} must be a non-empty string`)
  }
  return value
}

function optionalEnum<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`product app persisted ${field} is not supported`)
  }
  return value as T
}

function isRecord(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
