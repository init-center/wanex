import { mkdtemp, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export interface ProductAppLocalDemoOptions {
  readonly hostname: string
  readonly port?: number
  readonly storeDir?: string
  readonly serviceBin: string
  readonly sessionId: string
  readonly seedText: string
  readonly seed: boolean
  readonly open: boolean
  readonly pollIntervalMs?: number
}

export function parseProductAppLocalDemoOptions(
  rootDir: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): ProductAppLocalDemoOptions {
  const flags = new Map<string, string>()
  const booleanFlags = new Set(["no-seed", "open"])
  const valueFlags = new Set([
    "hostname",
    "port",
    "store-dir",
    "service-bin",
    "session-id",
    "seed-text",
    "poll-interval-ms"
  ])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--") {
      continue
    }
    if (arg === undefined || !arg.startsWith("--")) {
      throw new Error(`unexpected argument: ${arg ?? "<missing>"}`)
    }
    const key = arg.slice(2)
    if (booleanFlags.has(key)) {
      flags.set(key, "true")
      continue
    }
    if (!valueFlags.has(key)) {
      throw new Error(`unknown demo option: --${key}`)
    }
    const value = args[index + 1]
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`)
    }
    flags.set(key, value)
    index += 1
  }

  const hostname =
    flags.get("hostname") ?? env.WANEX_PRODUCT_APP_WEB_HOSTNAME ?? "127.0.0.1"
  const portText = flags.get("port") ?? env.WANEX_PRODUCT_APP_WEB_PORT
  const port = portText === undefined ? undefined : parseProductAppLocalDemoPort(portText)
  const storeDir = flags.get("store-dir") ?? env.WANEX_PRODUCT_APP_WEB_STORE_DIR
  const serviceBin = resolve(
    rootDir,
    flags.get("service-bin") ??
      env.WANEX_SERVICE_BIN ??
      "target/debug/wanex-system-service"
  )
  const sessionId =
    flags.get("session-id") ??
    env.WANEX_PRODUCT_APP_WEB_SESSION_ID ??
    "ses_local_web_demo"
  const seedText =
    flags.get("seed-text") ??
    env.WANEX_PRODUCT_APP_WEB_SEED_TEXT ??
    "hello from product-app-web demo"
  const seed = !(
    flags.has("no-seed") ||
    isTruthyEnv(env.WANEX_PRODUCT_APP_WEB_NO_SEED)
  )
  const open = flags.has("open") || isTruthyEnv(env.WANEX_PRODUCT_APP_WEB_OPEN)
  const pollIntervalText =
    flags.get("poll-interval-ms") ?? env.WANEX_PRODUCT_APP_WEB_POLL_INTERVAL_MS
  const pollIntervalMs =
    pollIntervalText === undefined
      ? undefined
      : parseProductAppLocalDemoPollIntervalMs(pollIntervalText)

  return {
    hostname,
    ...(port === undefined ? {} : { port }),
    ...(storeDir === undefined ? {} : { storeDir: resolve(rootDir, storeDir) }),
    serviceBin,
    sessionId,
    seedText,
    seed,
    open,
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs })
  }
}

export function parseProductAppLocalDemoPort(value: string): number {
  const port = parseBoundedInteger(value)
  if (port === undefined || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${value}`)
  }
  return port
}

export function parseProductAppLocalDemoPollIntervalMs(value: string): number {
  const interval = parseBoundedInteger(value)
  if (interval === undefined || interval < 0 || interval > 60_000) {
    throw new Error(`invalid poll interval: ${value}`)
  }
  return interval
}

export async function ensureProductAppLocalDemoStoreDir(
  storeDir: string | undefined
): Promise<string> {
  if (storeDir === undefined) {
    return await mkdtemp(join(tmpdir(), "wanex-product-app-web-demo-"))
  }
  await mkdir(storeDir, { recursive: true })
  return storeDir
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

function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}
