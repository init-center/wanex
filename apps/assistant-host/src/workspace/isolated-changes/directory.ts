import { mkdir, realpath } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { WorkspaceGeneration } from "../model.js"
import { contains } from "../store.js"

export async function prepareIsolationDirectory(generation: WorkspaceGeneration): Promise<string> {
  if (generation.worktreeDirectory === undefined) throw new Error("workspace isolation directory is not configured")
  let ancestor = resolve(generation.worktreeDirectory)
  const missing: string[] = []
  let canonical: string
  for (;;) {
    try { canonical = await realpath(ancestor); break }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(ancestor) === ancestor) throw error
      missing.unshift(basename(ancestor))
      ancestor = dirname(ancestor)
    }
  }
  const target = join(canonical, ...missing)
  const assertSeparate = (path: string) => {
    if (generation.roots.some(({ root }) => contains(root.path, path) || contains(path, root.path))) {
      throw new Error("workspace isolation directory must not overlap authorized roots")
    }
  }
  assertSeparate(target)
  await mkdir(target, { recursive: true })
  const directory = await realpath(target)
  assertSeparate(directory)
  return directory
}
