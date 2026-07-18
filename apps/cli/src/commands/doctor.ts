import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import type { CoreStore } from "@wanex/storage"
import type { GlobalOptions } from "../types.js"

export async function doctorValue(
  storage: CoreStore,
  command: "doctor" | "init",
  options: GlobalOptions
): Promise<unknown> {
  const [report, serviceBinaryExists] = await Promise.all([
    storage.doctor(),
    pathExists(options.serviceBin)
  ])
  return {
    command,
    runtime: {
      store: runtimeStoreProjection(options),
      serviceBinary: {
        path: options.serviceBin,
        exists: serviceBinaryExists
      }
    },
    storePath: report.storePath,
    schemaVersion: report.schemaVersion,
    checks: report.checks
  }
}

function runtimeStoreProjection(options: GlobalOptions): unknown {
  if (options.store.kind === "local-profile") {
    return {
      kind: options.store.kind,
      rootDir: options.store.rootDir,
      profileId: options.store.profileId,
      storeDir: join(options.store.rootDir, "profiles", options.store.profileId)
    }
  }
  return {
    kind: options.store.kind,
    storeDir: options.store.storeDir
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}
