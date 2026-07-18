import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { WorkspacePathResolver } from "../path-policy.js"
import type { Workspace } from "./types.js"

export class LocalWorkspace implements Workspace {
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

  async writeText(path: string, text: string): Promise<void> {
    const absolute = await this.paths.resolveMutation(path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, text, "utf8")
  }

  async delete(path: string): Promise<void> {
    await rm(await this.paths.resolveMutation(path), { force: true })
  }
}
