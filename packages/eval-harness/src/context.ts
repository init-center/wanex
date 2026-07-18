import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createStorageHandle } from "@wanex/storage"
import { createEvalStore } from "./eval-storage.js"
import type { EvalHarnessContext } from "./types.js"

export async function createEvalHarnessContext(options: {
  readonly serviceBin: string
  readonly pluginHostFixture: string
  readonly storeDir?: string
  readonly workspaceRootDir?: string
  readonly prefix?: string
}): Promise<{
  readonly context: EvalHarnessContext
  cleanup(): Promise<void>
}> {
  const baseDir = await mkdtemp(join(tmpdir(), options.prefix ?? "wanex-eval-"))
  const storeDir = options.storeDir ?? join(baseDir, "store")
  const workspaceRootDir = options.workspaceRootDir ?? join(baseDir, "workspace")
  await mkdir(storeDir, { recursive: true })
  await mkdir(workspaceRootDir, { recursive: true })
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin: options.serviceBin
  })
  const storage = createEvalStore(handle.core, handle.transport)
  return {
    context: {
      storage,
      handle,
      storeDir,
      workspaceRootDir,
      serviceBin: options.serviceBin,
      pluginHostFixture: options.pluginHostFixture
    },
    async cleanup() {
      await handle.dispose()
      if (options.storeDir === undefined && options.workspaceRootDir === undefined) {
        await rm(baseDir, { recursive: true, force: true })
        return
      }
      if (options.storeDir === undefined) {
        await rm(storeDir, { recursive: true, force: true })
      }
      if (options.workspaceRootDir === undefined) {
        await rm(workspaceRootDir, { recursive: true, force: true })
      }
      await rm(baseDir, { recursive: true, force: true })
    }
  }
}
