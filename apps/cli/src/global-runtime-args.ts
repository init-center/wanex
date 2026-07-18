import { join, resolve } from "node:path"
import { defaultServiceBin } from "./paths.js"
import { requireValue } from "./parse-helpers.js"
import type { CliEnvironment, GlobalOptions } from "./types.js"

export interface GlobalRuntimeParseState {
  storeDir: string | undefined
  storeProfile: string | undefined
  storeRoot: string | undefined
  serviceBin: string | undefined
}

export interface GlobalRuntimeParseResult {
  readonly handled: boolean
  readonly nextIndex: number
}

export function createGlobalRuntimeParseState(
  env: CliEnvironment
): GlobalRuntimeParseState {
  return {
    storeDir: env.WANEX_STORE_DIR,
    storeProfile: env.WANEX_STORE_PROFILE,
    storeRoot: env.WANEX_STORE_ROOT,
    serviceBin: env.WANEX_SYSTEM_SERVICE_BIN
  }
}

export function parseGlobalRuntimeOption(
  args: readonly string[],
  index: number,
  state: GlobalRuntimeParseState
): GlobalRuntimeParseResult {
  const arg = args[index]
  if (arg === "--store") {
    state.storeDir = requireValue(args, index + 1, "--store")
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--store-profile") {
    state.storeProfile = requireValue(args, index + 1, "--store-profile")
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--store-root") {
    state.storeRoot = requireValue(args, index + 1, "--store-root")
    return { handled: true, nextIndex: index + 1 }
  }
  if (arg === "--service-bin") {
    state.serviceBin = requireValue(args, index + 1, "--service-bin")
    return { handled: true, nextIndex: index + 1 }
  }
  return { handled: false, nextIndex: index }
}

export function buildGlobalRuntimeOptions(
  state: GlobalRuntimeParseState,
  env: CliEnvironment
): GlobalOptions {
  const homeDir = env.HOME ?? env.USERPROFILE
  if (
    state.storeDir !== undefined &&
    (state.storeProfile !== undefined || state.storeRoot !== undefined)
  ) {
    throw new Error("--store cannot be combined with --store-profile or --store-root")
  }
  if (state.storeDir === undefined && state.storeRoot === undefined) {
    if (homeDir === undefined || homeDir.length === 0) {
      throw new Error("cannot resolve store directory without HOME or USERPROFILE")
    }
    state.storeRoot = join(homeDir, ".wanex")
  }

  const serviceBin = state.serviceBin ?? defaultServiceBin()
  return {
    store:
      state.storeDir === undefined
        ? {
            kind: "local-profile",
            rootDir: resolve(state.storeRoot!),
            profileId: state.storeProfile ?? "default"
          }
        : {
            kind: "local-system-service",
            storeDir: resolve(state.storeDir)
          },
    serviceBin: resolve(serviceBin)
  }
}
