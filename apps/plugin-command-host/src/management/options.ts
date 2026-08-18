import type { LocalPluginPackageLimits } from "@wanex/plugin"

export interface PluginCommandManagementOptions {
  readonly installBaseDir: string
  readonly actorId: string
  readonly selectLocalPackage: () =>
    | Promise<string | undefined>
    | string
    | undefined
  readonly limits?: Partial<LocalPluginPackageLimits>
  readonly reviewTtlMs?: number
  readonly maxPendingReviews?: number
  readonly now?: () => number
}

export interface ResolvedPluginCommandManagementOptions {
  readonly installBaseDir: string
  readonly actorId: string
  readonly selectLocalPackage: PluginCommandManagementOptions["selectLocalPackage"]
  readonly limits?: Partial<LocalPluginPackageLimits>
  readonly reviewTtlMs: number
  readonly maxPendingReviews: number
  readonly now: () => number
}

const DEFAULT_REVIEW_TTL_MS = 10 * 60_000
const MAX_REVIEW_TTL_MS = 60 * 60_000
const DEFAULT_PENDING_REVIEWS = 8
const MAX_PENDING_REVIEWS = 32

export function resolvePluginCommandManagementOptions(
  options: PluginCommandManagementOptions
): ResolvedPluginCommandManagementOptions {
  const installBaseDir = required(options.installBaseDir, "installBaseDir")
  const actorId = required(options.actorId, "actorId")
  if (typeof options.selectLocalPackage !== "function") {
    throw new Error("selectLocalPackage must be a function")
  }
  const reviewTtlMs = boundedInteger(
    options.reviewTtlMs ?? DEFAULT_REVIEW_TTL_MS,
    1_000,
    MAX_REVIEW_TTL_MS,
    "reviewTtlMs"
  )
  const maxPendingReviews = boundedInteger(
    options.maxPendingReviews ?? DEFAULT_PENDING_REVIEWS,
    1,
    MAX_PENDING_REVIEWS,
    "maxPendingReviews"
  )
  return {
    installBaseDir,
    actorId,
    selectLocalPackage: options.selectLocalPackage,
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    reviewTtlMs,
    maxPendingReviews,
    now: safeClock(options.now ?? Date.now)
  }
}

function safeClock(clock: () => number): () => number {
  return () => {
    const value = clock()
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("now must return a non-negative safe integer")
    }
    return value
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} must not be empty`)
  return normalized
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}
