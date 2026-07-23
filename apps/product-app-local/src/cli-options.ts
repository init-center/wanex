import { resolve } from "node:path"
import {
  parseProductAppLocalCliProviderProfiles
} from "./cli-provider-options.js"
import type {
  ProductAppLocalProviderProfilesOptions,
  ProductAppLocalStorageConfig
} from "./types.js"

export interface ProductAppLocalCliEnvironment {
  readonly [name: string]: string | undefined
  readonly WANEX_PRODUCT_APP_LOCAL_OPEN?: string
  readonly WANEX_PRODUCT_APP_LOCAL_SMOKE?: string
  readonly WANEX_PRODUCT_APP_LOCAL_SETUP_PROVIDER?: string
  readonly WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT?: string
  readonly WANEX_PRODUCT_APP_LOCAL_HOSTNAME?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PORT?: string
  readonly WANEX_PRODUCT_APP_LOCAL_STORE_DIR?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROFILE_ROOT?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROFILE_ID?: string
  readonly WANEX_PRODUCT_APP_LOCAL_SERVICE_BIN?: string
  readonly WANEX_PRODUCT_APP_LOCAL_POLL_INTERVAL_MS?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILE_ID?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_KIND?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_ID?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_MODEL_ID?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_INPUT_MODALITIES?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_OUTPUT_MODALITIES?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_BASE_URL?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_SECRET_REF?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_FILE?: string
  readonly WANEX_PRODUCT_APP_LOCAL_PROVIDER_PROFILES_JSON?: string
  readonly WANEX_PRODUCT_APP_LOCAL_ACTIVE_PROVIDER_PROFILE_ID?: string
  readonly WANEX_STORE_DIR?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
  readonly WANEX_PROVIDER_PROFILE_ID?: string
  readonly WANEX_PROVIDER_KIND?: string
  readonly WANEX_PROVIDER_ID?: string
  readonly WANEX_PROVIDER_MODEL_ID?: string
  readonly WANEX_PROVIDER_INPUT_MODALITIES?: string
  readonly WANEX_PROVIDER_OUTPUT_MODALITIES?: string
  readonly WANEX_PROVIDER_BASE_URL?: string
  readonly WANEX_PROVIDER_SECRET_REF?: string
  readonly WANEX_PROVIDER_PROFILES_FILE?: string
  readonly WANEX_PROVIDER_PROFILES_JSON?: string
  readonly WANEX_ACTIVE_PROVIDER_PROFILE_ID?: string
}

export interface ParseProductAppLocalCliOptionsInput {
  readonly cwd: string
  readonly artifactRoot: string
  readonly args: readonly string[]
  readonly env?: ProductAppLocalCliEnvironment
}

export interface ProductAppLocalCliOptions {
  readonly open: boolean
  readonly smoke: boolean
  readonly setupProvider: boolean
  readonly summaryFormat: ProductAppLocalCliSummaryFormat
  readonly hostname: string
  readonly port?: number
  readonly pollIntervalMs?: number
  readonly serviceBin: string
  readonly storage: ProductAppLocalStorageConfig
  readonly providerProfiles: ProductAppLocalProviderProfilesOptions
}

export type ProductAppLocalCliSummaryFormat = "text" | "json"

const knownFlags = new Set([
  "open",
  "smoke",
  "setup-provider",
  "summary-format",
  "hostname",
  "port",
  "store-dir",
  "profile-root",
  "profile-id",
  "service-bin",
  "poll-interval-ms",
  "provider-profile-id",
  "provider-kind",
  "provider-id",
  "provider-model-id",
  "provider-input-modalities",
  "provider-output-modalities",
  "provider-base-url",
  "provider-secret-ref",
  "provider-profiles-file",
  "provider-profiles-json",
  "active-provider-profile-id"
])

export function parseProductAppLocalCliOptions(
  input: ParseProductAppLocalCliOptionsInput
): ProductAppLocalCliOptions {
  const env = input.env ?? {}
  const flags = parseFlags(input.args)
  const open =
    flags.has("open") ||
    parseProductAppLocalCliBoolean(
      env.WANEX_PRODUCT_APP_LOCAL_OPEN,
      "WANEX_PRODUCT_APP_LOCAL_OPEN"
    )
  const smoke =
    flags.has("smoke") ||
    parseProductAppLocalCliBoolean(
      env.WANEX_PRODUCT_APP_LOCAL_SMOKE,
      "WANEX_PRODUCT_APP_LOCAL_SMOKE"
    )
  const setupProvider =
    flags.has("setup-provider") ||
    parseProductAppLocalCliBoolean(
      env.WANEX_PRODUCT_APP_LOCAL_SETUP_PROVIDER,
      "WANEX_PRODUCT_APP_LOCAL_SETUP_PROVIDER"
    )
  if (smoke && setupProvider) {
    throw new Error("setup-provider cannot be combined with smoke")
  }
  const summaryFormat = parseProductAppLocalCliSummaryFormat(
    flags.get("summary-format") ??
      env.WANEX_PRODUCT_APP_LOCAL_SUMMARY_FORMAT ??
      "text"
  )
  const hostname =
    flags.get("hostname") ?? env.WANEX_PRODUCT_APP_LOCAL_HOSTNAME ?? "127.0.0.1"
  const port = optionalPort(
    flags.get("port") ?? env.WANEX_PRODUCT_APP_LOCAL_PORT
  )
  const pollIntervalMs = optionalPollIntervalMs(
    flags.get("poll-interval-ms") ??
      env.WANEX_PRODUCT_APP_LOCAL_POLL_INTERVAL_MS
  )
  const serviceBinInput =
    flags.get("service-bin") ??
    env.WANEX_PRODUCT_APP_LOCAL_SERVICE_BIN ??
    env.WANEX_SYSTEM_SERVICE_BIN
  const serviceBin =
    serviceBinInput === undefined
      ? resolvePath(input.artifactRoot, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
      : resolvePath(input.cwd, serviceBinInput)
  const storage = parseStorage({
    cwd: input.cwd,
    storeDir:
      flags.get("store-dir") ??
      env.WANEX_PRODUCT_APP_LOCAL_STORE_DIR ??
      env.WANEX_STORE_DIR,
    profileRoot:
      flags.get("profile-root") ?? env.WANEX_PRODUCT_APP_LOCAL_PROFILE_ROOT,
    profileId:
      flags.get("profile-id") ?? env.WANEX_PRODUCT_APP_LOCAL_PROFILE_ID
  })
  const providerProfiles = parseProductAppLocalCliProviderProfiles({
    cwd: input.cwd,
    flags,
    env
  })

  return {
    open,
    smoke,
    setupProvider,
    summaryFormat,
    hostname,
    ...(port === undefined ? {} : { port }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    serviceBin,
    storage,
    providerProfiles
  }
}

export function parseProductAppLocalCliSummaryFormat(
  value: string
): ProductAppLocalCliSummaryFormat {
  switch (value.trim().toLowerCase()) {
    case "text":
      return "text"
    case "json":
      return "json"
    default:
      throw new Error(`invalid summary format: ${value}`)
  }
}

export function parseProductAppLocalCliBoolean(
  value: string | undefined,
  name: string
): boolean {
  if (value === undefined || value.trim().length === 0) {
    return false
  }
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      throw new Error(`invalid boolean for ${name}: ${value}`)
  }
}

export function parseProductAppLocalCliPort(value: string): number {
  const port = parseBoundedInteger(value)
  if (port === undefined || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${value}`)
  }
  return port
}

export function parseProductAppLocalCliPollIntervalMs(value: string): number {
  const interval = parseBoundedInteger(value)
  if (interval === undefined || interval < 0 || interval > 60_000) {
    throw new Error(`invalid poll interval: ${value}`)
  }
  return interval
}

function parseStorage(input: {
  readonly cwd: string
  readonly storeDir: string | undefined
  readonly profileRoot: string | undefined
  readonly profileId: string | undefined
}): ProductAppLocalStorageConfig {
  if (
    input.storeDir !== undefined &&
    (input.profileRoot !== undefined || input.profileId !== undefined)
  ) {
    throw new Error("store-dir storage cannot be combined with profile options")
  }
  if (input.storeDir !== undefined) {
    return {
      kind: "store-dir",
      storeDir: resolvePath(input.cwd, input.storeDir)
    }
  }
  return {
    kind: "profile",
    rootDir: resolvePath(
      input.cwd,
      input.profileRoot ?? ".wanex-product-app-local"
    ),
    profileId: input.profileId ?? "default"
  }
}

function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--") {
      continue
    }
    if (arg === undefined || !arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg ?? "<missing>"}`)
    }
    const key = arg.slice(2)
    if (!knownFlags.has(key)) {
      throw new Error(`unknown option: --${key}`)
    }
    if (key === "open" || key === "smoke" || key === "setup-provider") {
      flags.set(key, "true")
      continue
    }
    const value = args[index + 1]
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`)
    }
    flags.set(key, value)
    index += 1
  }
  return flags
}

function optionalPort(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parseProductAppLocalCliPort(value)
}

function optionalPollIntervalMs(value: string | undefined): number | undefined {
  return value === undefined
    ? undefined
    : parseProductAppLocalCliPollIntervalMs(value)
}

function parseBoundedInteger(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    return undefined
  }
  return parsed
}

function resolvePath(root: string, path: string): string {
  return resolve(root, path)
}
