import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import type {
  ExecutionFileMetadata,
  ExecutionFileSystem
} from "@wanex/runtime/execution"

export class WorkspacePathResolver {
  readonly rootDir: string

  private canonicalRoot: Promise<string> | undefined

  constructor(
    rootDir: string,
    private readonly fileSystem: ExecutionFileSystem
  ) {
    this.rootDir = resolve(rootDir)
  }

  async resolveRead(path: string): Promise<string> {
    const candidate = this.candidate(path)
    try {
      return await this.fileSystem.canonicalize(candidate)
    } catch (error) {
      throw mapPathError(error, path)
    }
  }

  async resolveOptionalRead(path: string): Promise<string | null> {
    const candidate = this.candidate(path)
    try {
      if ((await this.fileSystem.metadata(candidate)) === null) return null
      return await this.fileSystem.canonicalize(candidate)
    } catch (error) {
      throw mapPathError(error, path)
    }
  }

  async resolveReadEntry(path: string): Promise<{
    readonly path: string
    readonly metadata: ExecutionFileMetadata
  }> {
    const candidate = this.candidate(path)
    try {
      const metadata = await this.fileSystem.metadata(candidate)
      if (metadata === null) {
        throw new Error(`workspace path does not exist: ${path}`)
      }
      return {
        path: await this.fileSystem.canonicalize(candidate),
        metadata
      }
    } catch (error) {
      throw mapPathError(error, path)
    }
  }

  async resolveMutation(path: string): Promise<string> {
    const candidate = this.candidate(path)
    try {
      const metadata = await this.fileSystem.metadata(candidate)
      if (metadata?.kind === "symlink") throw workspacePathEscape(path)
      return await this.fileSystem.canonicalize(candidate)
    } catch (error) {
      if (isMissingPathError(error)) return candidate
      throw mapPathError(error, path)
    }
  }

  async resolveDirectory(path?: string): Promise<string> {
    if (path === undefined || path === ".") {
      return await this.getCanonicalRoot()
    }
    const candidate = await this.resolveRead(path)
    const metadata = await this.fileSystem.metadata(candidate)
    if (metadata?.kind !== "directory") {
      throw new Error(`workspace path is not a directory: ${path}`)
    }
    return candidate
  }

  private candidate(path: string): string {
    const normalized = normalizeWorkspaceRelativePath(path)
    return resolve(this.rootDir, ...normalized.split("/"))
  }

  private getCanonicalRoot(): Promise<string> {
    this.canonicalRoot ??= this.fileSystem.canonicalize(this.rootDir)
    return this.canonicalRoot
  }
}

export function normalizeWorkspaceRelativePath(path: string): string {
  if (path.length === 0 || path.includes("\0")) {
    throw new Error(`invalid workspace path: ${path}`)
  }

  const portable = path.replaceAll("\\", "/")
  if (
    portable.startsWith("/") ||
    portable.startsWith("//") ||
    /^[A-Za-z]:\//u.test(portable) ||
    isAbsolute(path)
  ) {
    throw workspacePathEscape(path)
  }

  const segments = portable.split("/")
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw workspacePathEscape(path)
  }
  return segments.join("/")
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function mapPathError(error: unknown, path: string): Error {
  if (
    error instanceof Error &&
    error.message.startsWith("execution filesystem access is outside admitted roots")
  ) {
    return workspacePathEscape(path)
  }
  return error instanceof Error ? error : new Error(String(error))
}

function workspacePathEscape(path: string): Error {
  return new Error(`workspace path escapes root: ${path}`)
}
