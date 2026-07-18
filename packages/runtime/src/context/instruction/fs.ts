import { readFile, stat } from "node:fs/promises"
import type { InstructionFileSystem } from "./types.js"

export const nodeInstructionFileSystem: InstructionFileSystem = {
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
  async stat(path) {
    try {
      const result = await stat(path)
      return {
        isFile: result.isFile(),
        mtimeMs: result.mtimeMs
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
