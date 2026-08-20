import { readFile } from "node:fs/promises"
import { WorkspacePathResolver } from "../path-policy.js"
import type { WorkspaceReader } from "./types.js"

export class LocalWorkspaceReader implements WorkspaceReader {
  readonly rootDir: string

  private readonly paths: WorkspacePathResolver

  constructor(rootDir: string) {
    this.paths = new WorkspacePathResolver(rootDir)
    this.rootDir = this.paths.rootDir
  }

  async readText(path: string): Promise<string | null> {
    try {
      return await readFile(await this.paths.resolveRead(path), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }

}
