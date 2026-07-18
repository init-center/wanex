import { rm, stat } from "node:fs/promises"

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false
    }
    throw error
  }
}

export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}
