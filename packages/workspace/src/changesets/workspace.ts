import type { ExecutionFileSystem } from "@wanex/runtime/execution"
import { WorkspacePathResolver } from "../path-policy.js"
import type { WorkspaceReader } from "./types.js"

export class WorkspaceFileReader implements WorkspaceReader {
  readonly rootDir: string

  private readonly paths: WorkspacePathResolver
  private readonly fileSystem: ExecutionFileSystem

  constructor(rootDir: string, fileSystem: ExecutionFileSystem) {
    this.fileSystem = fileSystem
    this.paths = new WorkspacePathResolver(rootDir, fileSystem)
    this.rootDir = this.paths.rootDir
  }

  async readText(path: string): Promise<string | null> {
    try {
      const resolved = await this.paths.resolveOptionalRead(path)
      if (resolved === null) return null
      const bytes = await this.fileSystem.read(resolved)
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }
}
