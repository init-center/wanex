import { join, resolve } from "node:path"

export interface LocalStoreLocatorOptions {
  readonly rootDir: string
  readonly profileId?: string
}

export interface LocalStoreLocation {
  readonly kind: "local-store"
  readonly rootDir: string
  readonly profileId: string
  readonly storeDir: string
}

const DEFAULT_LOCAL_PROFILE_ID = "default"
const SAFE_PROFILE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
])

export function resolveLocalStore(
  options: LocalStoreLocatorOptions
): LocalStoreLocation {
  const profileId = normalizeLocalStoreProfileId(options.profileId)
  const rootDir = resolve(options.rootDir)
  return {
    kind: "local-store",
    rootDir,
    profileId,
    storeDir: join(rootDir, "profiles", profileId)
  }
}

export function normalizeLocalStoreProfileId(profileId?: string): string {
  const value = profileId ?? DEFAULT_LOCAL_PROFILE_ID
  if (!SAFE_PROFILE_ID.test(value)) {
    throw new Error(
      "local store profile id must start with an ASCII letter or digit and contain only ASCII letters, digits, '_' or '-'"
    )
  }
  if (WINDOWS_RESERVED_NAMES.has(value.toLowerCase())) {
    throw new Error(`local store profile id is reserved: ${value}`)
  }
  return value
}
