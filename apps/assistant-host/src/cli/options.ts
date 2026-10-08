import { resolve } from "node:path"
import type { WorkspaceHostOptions, WorkspaceRoot } from "../workspace/model.js"
import {
  parseLocalCliModelEndpoints
} from "./provider-options.js"
import type {
  LocalModelEndpointsOptions,
  LocalStorageConfig
} from "../model.js"

export interface LocalCliEnvironment {
  readonly [name: string]: string | undefined
  readonly WANEX_ASSISTANT_HOST_OPEN?: string
  readonly WANEX_ASSISTANT_HOST_SMOKE?: string
  readonly WANEX_ASSISTANT_HOST_SETUP_PROVIDER?: string
  readonly WANEX_ASSISTANT_HOST_SUMMARY_FORMAT?: string
  readonly WANEX_ASSISTANT_HOST_HOSTNAME?: string
  readonly WANEX_ASSISTANT_HOST_PORT?: string
  readonly WANEX_ASSISTANT_HOST_STORE_DIR?: string
  readonly WANEX_ASSISTANT_HOST_PROFILE_ROOT?: string
  readonly WANEX_ASSISTANT_HOST_PROFILE_ID?: string
  readonly WANEX_ASSISTANT_HOST_SERVICE_BIN?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_ENDPOINT_ID?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_CONNECTION_ID?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_PROTOCOL?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_ID?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_MODEL_ID?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_OPERATIONS?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_INPUT_MODALITIES?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_OUTPUT_MODALITIES?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_FEATURES?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_REASONING_REPLAY?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_BASE_URL?: string
  readonly WANEX_ASSISTANT_HOST_PROVIDER_SECRET_REF?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_ENDPOINTS_FILE?: string
  readonly WANEX_ASSISTANT_HOST_MODEL_ENDPOINTS_JSON?: string
  readonly WANEX_ASSISTANT_HOST_ACTIVE_MODEL_ENDPOINT_ID?: string
  readonly WANEX_ASSISTANT_HOST_WORKSPACE_HOST_ID?: string
  readonly WANEX_ASSISTANT_HOST_WORKSPACE_ROOTS_JSON?: string
  readonly WANEX_STORE_DIR?: string
  readonly WANEX_SYSTEM_SERVICE_BIN?: string
  readonly WANEX_MODEL_ENDPOINT_ID?: string
  readonly WANEX_PROVIDER_CONNECTION_ID?: string
  readonly WANEX_PROVIDER_PROTOCOL?: string
  readonly WANEX_PROVIDER_ID?: string
  readonly WANEX_PROVIDER_MODEL_ID?: string
  readonly WANEX_MODEL_OPERATIONS?: string
  readonly WANEX_MODEL_INPUT_MODALITIES?: string
  readonly WANEX_MODEL_OUTPUT_MODALITIES?: string
  readonly WANEX_MODEL_FEATURES?: string
  readonly WANEX_MODEL_REASONING_REPLAY?: string
  readonly WANEX_PROVIDER_BASE_URL?: string
  readonly WANEX_PROVIDER_SECRET_REF?: string
  readonly WANEX_MODEL_ENDPOINTS_FILE?: string
  readonly WANEX_MODEL_ENDPOINTS_JSON?: string
  readonly WANEX_ACTIVE_MODEL_ENDPOINT_ID?: string
}

export interface ParseLocalCliOptionsInput {
  readonly cwd: string
  readonly artifactRoot: string
  readonly args: readonly string[]
  readonly env?: LocalCliEnvironment
}

export interface LocalCliOptions {
  readonly workspace?: WorkspaceHostOptions
  readonly open: boolean
  readonly smoke: boolean
  readonly setupProvider: boolean
  readonly summaryFormat: LocalCliSummaryFormat
  readonly hostname: string
  readonly port?: number
  readonly serviceBin: string
  readonly storage: LocalStorageConfig
  readonly modelEndpoints: LocalModelEndpointsOptions
}

export type LocalCliSummaryFormat = "text" | "json"

const DEFAULT_LOCAL_WORKSPACE_HOST_ID = "local-assistant"

const knownFlags = new Set([
  "workspace-host-id",
  "workspace-roots-json",
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
  "model-endpoint-id",
  "provider-connection-id",
  "provider-protocol",
  "provider-id",
  "provider-model-id",
  "model-operations",
  "model-input-modalities",
  "model-output-modalities",
  "model-features",
  "model-reasoning-replay",
  "provider-base-url",
  "provider-secret-ref",
  "model-endpoints-file",
  "model-endpoints-json",
  "active-model-endpoint-id"
])

export function parseLocalCliOptions(
  input: ParseLocalCliOptionsInput
): LocalCliOptions {
  const env = input.env ?? {}
  const flags = parseFlags(input.args)
  const open =
    flags.has("open") ||
    parseLocalCliBoolean(
      env.WANEX_ASSISTANT_HOST_OPEN,
      "WANEX_ASSISTANT_HOST_OPEN"
    )
  const smoke =
    flags.has("smoke") ||
    parseLocalCliBoolean(
      env.WANEX_ASSISTANT_HOST_SMOKE,
      "WANEX_ASSISTANT_HOST_SMOKE"
    )
  const setupProvider =
    flags.has("setup-provider") ||
    parseLocalCliBoolean(
      env.WANEX_ASSISTANT_HOST_SETUP_PROVIDER,
      "WANEX_ASSISTANT_HOST_SETUP_PROVIDER"
    )
  if (smoke && setupProvider) {
    throw new Error("setup-provider cannot be combined with smoke")
  }
  const summaryFormat = parseLocalCliSummaryFormat(
    flags.get("summary-format") ??
      env.WANEX_ASSISTANT_HOST_SUMMARY_FORMAT ??
      "text"
  )
  const hostname =
    flags.get("hostname") ?? env.WANEX_ASSISTANT_HOST_HOSTNAME ?? "127.0.0.1"
  const port = optionalPort(
    flags.get("port") ?? env.WANEX_ASSISTANT_HOST_PORT
  )
  const serviceBinInput =
    flags.get("service-bin") ??
    env.WANEX_ASSISTANT_HOST_SERVICE_BIN ??
    env.WANEX_SYSTEM_SERVICE_BIN
  const serviceBin =
    serviceBinInput === undefined
      ? resolvePath(input.artifactRoot, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)
      : resolvePath(input.cwd, serviceBinInput)
  const storage = parseStorage({
    cwd: input.cwd,
    storeDir:
      flags.get("store-dir") ??
      env.WANEX_ASSISTANT_HOST_STORE_DIR ??
      env.WANEX_STORE_DIR,
    profileRoot:
      flags.get("profile-root") ?? env.WANEX_ASSISTANT_HOST_PROFILE_ROOT,
    profileId:
      flags.get("profile-id") ?? env.WANEX_ASSISTANT_HOST_PROFILE_ID
  })
  const modelEndpoints = parseLocalCliModelEndpoints({
    cwd: input.cwd,
    flags,
    env
  })
  const configuredWorkspaceHostId = flags.get("workspace-host-id") ?? env.WANEX_ASSISTANT_HOST_WORKSPACE_HOST_ID
  const rootsJson = flags.get("workspace-roots-json") ?? env.WANEX_ASSISTANT_HOST_WORKSPACE_ROOTS_JSON
  if (rootsJson !== undefined && configuredWorkspaceHostId === undefined) throw new Error("workspace roots require an explicit workspace-host-id")
  const workspaceHostId = configuredWorkspaceHostId ?? DEFAULT_LOCAL_WORKSPACE_HOST_ID
  if (!/^[A-Za-z0-9_.:-]{1,128}$/u.test(workspaceHostId)) throw new Error("workspace-host-id is invalid")
  const initialRoots = rootsJson === undefined ? undefined : parseWorkspaceRoots(rootsJson, input.cwd)

  return {
    open,
    smoke,
    setupProvider,
    summaryFormat,
    hostname,
    ...(port === undefined ? {} : { port }),
    serviceBin,
    storage,
    modelEndpoints,
    workspace: { hostId: workspaceHostId, ...(initialRoots === undefined ? {} : { initialRoots }) }
  }
}

function parseWorkspaceRoots(value: string, cwd: string): readonly WorkspaceRoot[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.length > 16) throw new Error("workspace-roots-json must be an array of at most 16 roots")
  return parsed.map((item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new Error("workspace root must be an object")
    const root = item as Record<string, unknown>
    if ((Object.keys(root).length !== 2 && Object.keys(root).length !== 3) || typeof root.id !== "string" || typeof root.path !== "string" || root.path.trim() === "") throw new Error("workspace root requires id and path")
    if (root.effects !== undefined && (!Array.isArray(root.effects) || root.effects.some((effect) => typeof effect !== "string"))) throw new Error("workspace root effects must be an array of strings")
    const path = resolve(cwd, root.path)
    if (root.effects === undefined) return { id: root.id, path }
    return { id: root.id, path, effects: root.effects as NonNullable<WorkspaceRoot["effects"]> }
  })
}

export function parseLocalCliSummaryFormat(
  value: string
): LocalCliSummaryFormat {
  switch (value.trim().toLowerCase()) {
    case "text":
      return "text"
    case "json":
      return "json"
    default:
      throw new Error(`invalid summary format: ${value}`)
  }
}

export function parseLocalCliBoolean(
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

export function parseLocalCliPort(value: string): number {
  const port = parseBoundedInteger(value)
  if (port === undefined || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${value}`)
  }
  return port
}

function parseStorage(input: {
  readonly cwd: string
  readonly storeDir: string | undefined
  readonly profileRoot: string | undefined
  readonly profileId: string | undefined
}): LocalStorageConfig {
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
      input.profileRoot ?? ".wanex-assistant-host"
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
  return value === undefined ? undefined : parseLocalCliPort(value)
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
