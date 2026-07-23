import { readdir, readFile, stat } from "node:fs/promises"
import type { SkillFileSystem } from "./types.js"

export const nodeSkillFileSystem: SkillFileSystem = {
  async readFile(path) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined
      }
      throw error
    }
  },
  async readDir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined
      }
      throw error
    }
  },
  async stat(path) {
    try {
      const result = await stat(path)
      return {
        isFile: result.isFile(),
        isDirectory: result.isDirectory(),
        mtimeMs: Math.trunc(result.mtimeMs)
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined
      }
      throw error
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}
